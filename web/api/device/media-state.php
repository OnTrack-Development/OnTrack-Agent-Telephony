<?php
require __DIR__ . '/../../app/bootstrap.php';

$device = current_device();
$in = json_input();

$callId = (int)($in['call_id'] ?? 0);
$state = trim((string)($in['state'] ?? ''));
$error = trim((string)($in['error'] ?? ''));

$allowed = [
    'not_connected',
    'requested',
    'waiting_for_add_call',
    'bridge_leg_dialing',
    'bridge_leg_answered',
    'dtmf_sent',
    'merge_waiting',
    'merge_requested',
    'merge_confirmed',
    'add_call_unavailable',
    'merge_unavailable',
    'connected',
    'active',
    'failed',
    'ended',
];

if ($callId <= 0 || !in_array($state, $allowed, true)) {
    json_response(['ok' => false, 'error' => 'Invalid media state payload'], 422);
}

$pdo = db();

$stmt = $pdo->prepare(
    "SELECT id,media_status,media_gateway_connected_at,
            media_merge_confirmed_at,recording_status
     FROM calls
     WHERE id=? AND device_id=?
     LIMIT 1"
);
$stmt->execute([$callId, $device['id']]);
$call = $stmt->fetch();

if (!$call) {
    json_response(['ok' => false, 'error' => 'Call not found'], 404);
}

$now = now_utc();
$next = $state === 'ended' ? 'disconnected' : $state;

if ($state === 'connected' || $state === 'active') {
    $pdo->prepare(
        "UPDATE calls
         SET media_status='connected',
             media_connected_at=COALESCE(media_connected_at,?),
             media_error=NULL
         WHERE id=?"
    )->execute([$now, $callId]);

    $next = 'connected';

} elseif ($state === 'ended') {
    $previous = (string)($call['media_status'] ?? 'not_connected');

    if (in_array($previous, ['connected','recording'], true)) {
        $next = 'disconnected';

        $pdo->prepare(
            "UPDATE calls
             SET media_status='disconnected',
                 media_disconnected_at=COALESCE(media_disconnected_at,?)
             WHERE id=?"
        )->execute([$now, $callId]);
    } elseif ($previous === 'failed') {
        $next = 'failed';
    } else {
        $next = $previous;
    }

} elseif ($state === 'merge_requested') {
    $pdo->prepare(
        "UPDATE calls
         SET media_status='merge_requested',
             media_merge_requested_at=COALESCE(media_merge_requested_at,?),
             media_error=CASE WHEN ?<>'' THEN ? ELSE media_error END
         WHERE id=?"
    )->execute([
        $now,
        $error,
        $error !== '' ? mb_substr($error, 0, 500) : '',
        $callId
    ]);

    $next = 'merge_requested';

} elseif ($state === 'merge_confirmed') {
    $gatewayConnected = !empty($call['media_gateway_connected_at']);
    $recording = (string)($call['recording_status'] ?? '') === 'recording';

    $next = $gatewayConnected
        ? ($recording ? 'recording' : 'connected')
        : 'merge_confirmed';

    $pdo->prepare(
        "UPDATE calls
         SET media_status=?,
             media_merge_confirmed_at=COALESCE(media_merge_confirmed_at,?),
             media_connected_at=CASE
               WHEN media_gateway_connected_at IS NOT NULL
               THEN COALESCE(media_connected_at,?)
               ELSE media_connected_at
             END,
             media_error=NULL
         WHERE id=?"
    )->execute([$next, $now, $now, $callId]);

} elseif ($state === 'not_connected') {
    $pdo->prepare(
        "UPDATE calls
         SET media_status='not_connected',
             media_error=NULL
         WHERE id=?"
    )->execute([$callId]);

    $next = 'not_connected';

} else {
    // Once the gateway + carrier conference are both verified, routine Android
    // progress updates must not downgrade the live media state.
    if (in_array((string)$call['media_status'], ['connected','recording'], true)
        && !in_array($state, ['failed','ended'], true)) {
        json_response([
            'ok' => true,
            'call_id' => $callId,
            'media_status' => $call['media_status'],
            'ignored' => true
        ]);
    }

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
        $now,
        $callId
    ]);
}

json_response([
    'ok' => true,
    'call_id' => $callId,
    'media_status' => $next
]);
