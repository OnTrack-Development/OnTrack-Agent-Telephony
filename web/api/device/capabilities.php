<?php
require __DIR__ . '/../../app/bootstrap.php';

$device = current_device();
$in = json_input();

$canAdd = array_key_exists('can_add_call', $in)
    ? (!empty($in['can_add_call']) ? 1 : 0)
    : null;

$conferenceable = isset($in['conferenceable_count'])
    ? max(0, (int)$in['conferenceable_count'])
    : 0;

$activeCalls = isset($in['active_call_count'])
    ? max(0, (int)$in['active_call_count'])
    : 0;

$status = trim((string)($in['conference_status'] ?? 'unknown'));
$allowed = ['unknown','add_call_ready','merge_ready','unavailable'];

if (!in_array($status, $allowed, true)) {
    $status = 'unknown';
}

$stmt = db()->prepare(
    'UPDATE devices
     SET conference_can_add_call=?,
         conferenceable_count=?,
         active_call_count=?,
         conference_status=?,
         conference_checked_at=?
     WHERE id=?'
);

$stmt->execute([
    $canAdd,
    $conferenceable,
    $activeCalls,
    $status,
    now_utc(),
    $device['id']
]);

json_response([
    'ok' => true,
    'device_id' => (int)$device['id'],
    'conference_status' => $status,
    'can_add_call' => $canAdd === null ? null : (bool)$canAdd,
    'conferenceable_count' => $conferenceable,
    'active_call_count' => $activeCalls,
]);
