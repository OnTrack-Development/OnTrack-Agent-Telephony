<?php
require __DIR__ . '/../../app/bootstrap.php';

$device = current_device();
$in = json_input();

$state = (string)($in['state'] ?? '');
$phone = normalize_phone((string)($in['phone_number'] ?? ''));
$contactName = trim((string)($in['contact_name'] ?? ''));
$callId = (int)($in['call_id'] ?? 0);

if (!in_array($state, ['ringing','answered','ended','rejected'], true)) {
    json_response(['ok' => false, 'error' => 'Invalid state'], 422);
}

$pdo = db();

if ($state === 'ringing') {
    if (!$phone) {
        json_response(['ok' => false, 'error' => 'Phone number required'], 422);
    }

    if ($contactName === '') {
        $contactName = find_contact_name($pdo, (int)$device['id'], $phone) ?? '';
    }

    $mode = setting_value('incoming_mode', 'ai');
    $action = $mode === 'human'
        ? 'ring_human'
        : ($mode === 'ai_if_unanswered' ? 'ring_then_ai' : 'answer_and_bridge_ai');

    $needsAi = $action === 'answer_and_bridge_ai' || $action === 'ring_then_ai';

    // AI media now stays on the paired Android phone. The handset captures
    // TELEPHONY_RX and injects the model audio into TELEPHONY_TX locally, while
    // this shared-hosting application remains the control plane.
    $mediaReady = false;
    $bridgeNumber = '';
    $autoMerge = false;
    $mediaPin = null;
    $mediaStatus = 'not_connected';
    $mediaRequestedAt = null;

    $s = $pdo->prepare(
        "INSERT INTO calls(
            device_id,direction,phone_number,contact_name,status,
            media_status,media_pin,media_bridge_number,media_requested_at,created_at
         )
         VALUES(?,'inbound',?,?, 'ringing',?,?,?,?,?)"
    );

    $s->execute([
        $device['id'],
        $phone,
        $contactName !== '' ? mb_substr($contactName, 0, 200) : null,
        $mediaStatus,
        $mediaPin,
        $mediaReady ? $bridgeNumber : null,
        $mediaRequestedAt,
        now_utc()
    ]);

    $callId = (int)$pdo->lastInsertId();

    json_response([
        'ok' => true,
        'call_id' => $callId,
        'contact_name' => $contactName !== '' ? $contactName : null,
        'instruction' => [
            'action' => $action,
            'delay_seconds' => $mode === 'ai_if_unanswered' ? 10 : 0,
            'media_bridge' => [
                'enabled' => $mediaReady,
                'phone_number' => $mediaReady ? $bridgeNumber : null,
                'pin' => $mediaReady ? $mediaPin : null,
                'auto_merge' => $mediaReady ? $autoMerge : false,
                'reason' => $needsAi
                    ? 'local_android_media'
                    : 'human_mode'
            ]
        ]
    ]);
}

if (!$callId) {
    json_response(['ok' => false, 'error' => 'call_id required'], 422);
}

$q = $pdo->prepare(
    "SELECT * FROM calls
     WHERE id=? AND device_id=? AND direction='inbound'"
);
$q->execute([$callId, $device['id']]);
$call = $q->fetch();

if (!$call) {
    json_response(['ok' => false, 'error' => 'Inbound call not found'], 404);
}

if ($state === 'answered') {
    $pdo->prepare(
        "UPDATE calls
         SET status='answered',
             answered_at=COALESCE(answered_at,?)
         WHERE id=?"
    )->execute([now_utc(), $callId]);

} else {
    $end = now_utc();
    $duration = $call['answered_at']
        ? max(0, strtotime($end) - strtotime((string)$call['answered_at']))
        : null;

    $mediaStatus = (string)($call['media_status'] ?? 'not_connected');

    if ($state === 'ended'
        && !in_array($mediaStatus, ['connected','recording','disconnected','failed'], true)
        && $mediaStatus !== 'not_connected') {
        $mediaStatus = 'failed';
    }

    $pdo->prepare(
        "UPDATE calls
         SET status=?,
             outcome=?,
             ended_at=?,
             duration_seconds=?,
             media_status=?,
             media_disconnected_at=CASE
               WHEN media_connected_at IS NOT NULL THEN COALESCE(media_disconnected_at,?)
               ELSE media_disconnected_at
             END
         WHERE id=?"
    )->execute([
        $state === 'ended' ? 'completed' : 'rejected',
        $state,
        $end,
        $duration,
        $mediaStatus,
        $end,
        $callId
    ]);
}

json_response(['ok' => true, 'call_id' => $callId]);
