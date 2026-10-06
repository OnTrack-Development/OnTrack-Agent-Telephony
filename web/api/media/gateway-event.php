<?php
require __DIR__ . '/../../app/bootstrap.php';

require_media_gateway();

$in = json_input();
$pin = preg_replace('/[^0-9]/', '', (string)($in['pin'] ?? '')) ?? '';
$state = trim((string)($in['state'] ?? ''));
$gatewayId = trim((string)($in['gateway_call_id'] ?? ''));
$error = trim((string)($in['error'] ?? ''));

if (!preg_match('/^\d{8}$/', $pin)) {
    json_response(['ok' => false, 'error' => 'Invalid media PIN'], 422);
}

$allowed = ['connected','recording','ended','failed'];

if (!in_array($state, $allowed, true)) {
    json_response(['ok' => false, 'error' => 'Invalid gateway state'], 422);
}

$pdo = db();

$stmt = $pdo->prepare(
    "SELECT * FROM calls
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
$now = now_utc();
$mergeConfirmed = !empty($call['media_merge_confirmed_at']);

if ($state === 'connected') {
    $next = $mergeConfirmed ? 'connected' : 'gateway_connected';

    $pdo->prepare(
        "UPDATE calls
         SET media_status=?,
             media_gateway_connected_at=COALESCE(media_gateway_connected_at,?),
             media_connected_at=CASE
               WHEN media_merge_confirmed_at IS NOT NULL
               THEN COALESCE(media_connected_at,?)
               ELSE media_connected_at
             END,
             media_error=NULL
         WHERE id=?"
    )->execute([$next, $now, $now, $callId]);

} elseif ($state === 'recording') {
    $next = $mergeConfirmed ? 'recording' : 'gateway_connected';

    $pdo->prepare(
        "UPDATE calls
         SET media_status=?,
             media_gateway_connected_at=COALESCE(media_gateway_connected_at,?),
             media_connected_at=CASE
               WHEN media_merge_confirmed_at IS NOT NULL
               THEN COALESCE(media_connected_at,?)
               ELSE media_connected_at
             END,
             recording_status='recording',
             media_error=NULL
         WHERE id=?"
    )->execute([$next, $now, $now, $callId]);

} elseif ($state === 'ended') {
    $pdo->prepare(
        "UPDATE calls
         SET media_status='disconnected',
             media_disconnected_at=COALESCE(media_disconnected_at,?)
         WHERE id=?"
    )->execute([$now, $callId]);

} else {
    $pdo->prepare(
        "UPDATE calls
         SET media_status='failed',
             media_error=?,
             media_disconnected_at=COALESCE(media_disconnected_at,?)
         WHERE id=?"
    )->execute([
        $error !== '' ? mb_substr($error, 0, 500) : 'Media gateway failure',
        $now,
        $callId
    ]);
}

json_response([
    'ok' => true,
    'call_id' => $callId,
    'state' => $state,
    'gateway_call_id' => $gatewayId !== '' ? $gatewayId : null
]);
