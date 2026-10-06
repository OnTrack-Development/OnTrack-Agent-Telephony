<?php
require __DIR__ . '/../../app/bootstrap.php';
require_admin_api();

$in = json_input();
$action = (string)($in['action'] ?? '');
$deviceId = (int)($in['device_id'] ?? 0);

if ($deviceId <= 0) {
    json_response(['ok' => false, 'error' => 'device_id required'], 422);
}

$pdo = db();
$q = $pdo->prepare('SELECT * FROM devices WHERE id=? LIMIT 1');
$q->execute([$deviceId]);
$device = $q->fetch();

if (!$device) {
    json_response(['ok' => false, 'error' => 'Device not found'], 404);
}

if ($action === 'rename') {
    $name = trim((string)($in['name'] ?? ''));
    if ($name === '') {
        json_response(['ok' => false, 'error' => 'Device name required'], 422);
    }
    $name = mb_substr($name, 0, 120);
    $pdo->prepare('UPDATE devices SET name=? WHERE id=?')->execute([$name, $deviceId]);
    json_response(['ok' => true, 'device_id' => $deviceId, 'name' => $name]);
}

if ($action === 'remove') {
    $pdo->beginTransaction();
    try {
        $pdo->prepare('DELETE FROM phone_contacts WHERE device_id=?')->execute([$deviceId]);
        $pdo->prepare("UPDATE devices SET revoked_at=?, status='offline' WHERE id=?")
            ->execute([now_utc(), $deviceId]);
        $pdo->commit();

        json_response([
            'ok' => true,
            'device_id' => $deviceId,
            'removed' => true,
            'note' => 'Pairing revoked; historical calls preserved.'
        ]);
    } catch (Throwable $e) {
        $pdo->rollBack();
        json_response(['ok' => false, 'error' => $e->getMessage()], 500);
    }
}

json_response(['ok' => false, 'error' => 'Unsupported action'], 422);
