<?php
require __DIR__ . '/../../app/bootstrap.php';

require_media_gateway();

$pin = preg_replace('/[^0-9]/', '', (string)($_POST['pin'] ?? '')) ?? '';

if (!preg_match('/^\d{8}$/', $pin)) {
    json_response(['ok' => false, 'error' => 'Invalid media PIN'], 422);
}

if (empty($_FILES['recording']) || !is_array($_FILES['recording'])) {
    json_response(['ok' => false, 'error' => 'Recording file required'], 422);
}

$file = $_FILES['recording'];

if (($file['error'] ?? UPLOAD_ERR_NO_FILE) !== UPLOAD_ERR_OK) {
    json_response([
        'ok' => false,
        'error' => 'Recording upload failed with code ' . (int)($file['error'] ?? -1)
    ], 422);
}

$size = (int)($file['size'] ?? 0);

if ($size <= 0 || $size > 150 * 1024 * 1024) {
    json_response(['ok' => false, 'error' => 'Invalid recording size'], 422);
}

$pdo = db();
$stmt = $pdo->prepare(
    "SELECT id FROM calls
     WHERE media_pin=?
     ORDER BY id DESC
     LIMIT 1"
);
$stmt->execute([$pin]);
$callId = (int)($stmt->fetchColumn() ?: 0);

if ($callId <= 0) {
    json_response(['ok' => false, 'error' => 'Media session not found'], 404);
}

$recordingDir = __DIR__ . '/../../storage/recordings';

if (!is_dir($recordingDir)
    && !mkdir($recordingDir, 0775, true)
    && !is_dir($recordingDir)) {
    json_response(['ok' => false, 'error' => 'Recording storage unavailable'], 500);
}

$filename = 'call-' . $callId . '-' . bin2hex(random_bytes(8)) . '.wav';
$target = $recordingDir . '/' . $filename;

if (!move_uploaded_file((string)$file['tmp_name'], $target)) {
    json_response(['ok' => false, 'error' => 'Could not store recording'], 500);
}

@chmod($target, 0640);

$pdo->prepare(
    "UPDATE calls
     SET recording_status='ready',
         recording_file=?,
         recording_url=?,
         media_status=CASE
           WHEN media_status IN ('connected','recording') THEN 'disconnected'
           ELSE media_status
         END,
         media_disconnected_at=COALESCE(media_disconnected_at,?)
     WHERE id=?"
)->execute([
    $target,
    '/api/admin/recording.php?call_id=' . $callId,
    now_utc(),
    $callId
]);

json_response([
    'ok' => true,
    'call_id' => $callId,
    'recording_status' => 'ready',
    'size_bytes' => $size
]);
