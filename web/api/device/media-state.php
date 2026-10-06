<?php
require __DIR__ . '/../../app/bootstrap.php';

$device = current_device();
$in = json_input();

$callId = (int)($in['call_id'] ?? 0);
$state = trim((string)($in['state'] ?? ''));
$error = trim((string)($in['error'] ?? ''));

$allowed = [
    'requested',
    'waiting_for_add_call',
    'bridge_leg_dialing',
    'bridge_leg_answered',
    'dtmf_sent',
    'merge_waiting',
    'merge_requested',
    'add_call_unavailable',
    'merge_unavailable',
    'failed',
    'ended',
];

if ($callId <= 0 || !in_array($state, $allowed, true)) {
    json_response(['ok' => false, 'error' => 'Invalid media state payload'], 422);
}

$pdo = db();

$stmt = $pdo->prepare(
    "SELECT id,media_status FROM calls
     WHERE id=? AND device_id=? AND direction='inbound'
     LIMIT 1"
);
$stmt->execute([$callId, $device['id']]);
$call = $stmt->fetch();

if (!$call) {
    json_response(['ok' => false, 'error' => 'Call not found'], 404);
}

if (in_array((string)$call['media_status'], ['connected','recording'], true)
    && !in_array($state, ['failed','ended'], true)) {
    json_response([
        'ok' => true,
        'call_id' => $callId,
        'media_status' => $call['media_status'],
        'ignored' => true
    ]);
}

$next = $state === 'ended' ? 'disconnected' : $state;

$update = $pdo->prepare(
    "UPDATE calls
     SET media_status=?,
         media_error=CASE WHEN ?<>'' THEN ? ELSE media_error END,
         media_disconnected_at=CASE
           WHEN ? IN ('failed','disconnected') THEN COALESCE(media_disconnected_at,?)
           ELSE media_disconnected_at
         END
     WHERE id=?"
);

$update->execute([
    $next,
    $error,
    $error !== '' ? mb_substr($error, 0, 500) : '',
    $next,
    now_utc(),
    $callId
]);

json_response([
    'ok' => true,
    'call_id' => $callId,
    'media_status' => $next
]);
