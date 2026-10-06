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
    "SELECT id,media_gateway_connected_at,media_merge_confirmed_at
     FROM calls
     WHERE media_pin=?
     ORDER BY id DESC
     LIMIT 1"
);
$stmt->execute([$pin]);
$call = $stmt->fetch();

if (!$call) {
    json_response(['ok' => false, 'error' => 'Media session not found'], 404);
}

$callId = (int)$call['id'];

if (empty($call['media_gateway_connected_at'])
    || empty($call['media_merge_confirmed_at'])) {

    $pdo->prepare(
        "UPDATE calls
         SET recording_status='not_recorded',
             media_status=CASE
               WHEN media_status='disconnected' THEN media_status
               ELSE 'failed'
             END,
             media_error=COALESCE(
               media_error,
               'Recording discarded because the carrier conference was not confirmed'
             )
         WHERE id=?"
    )->execute([$callId]);

    json_response([
        'ok' => false,
        'error' => 'Carrier conference was not confirmed; recording discarded'
    ], 409);
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
