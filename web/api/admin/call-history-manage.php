<?php
require __DIR__ . '/../../app/bootstrap.php';
require_admin_api();

$in = json_input();
$action = (string)($in['action'] ?? '');
$pdo = db();

if ($action === 'delete_one') {
    $callId = (int)($in['call_id'] ?? 0);
    if ($callId <= 0) json_response(['ok' => false, 'error' => 'call_id required'], 422);

    $stmt = $pdo->prepare('DELETE FROM calls WHERE id=?');
    $stmt->execute([$callId]);

    json_response(['ok' => true, 'deleted' => $stmt->rowCount()]);
}

if ($action === 'delete_number') {
    $phone = normalize_phone((string)($in['phone_number'] ?? ''));
    if ($phone === '') json_response(['ok' => false, 'error' => 'phone_number required'], 422);

    $key = phone_key($phone);
    $rows = $pdo->query('SELECT id,phone_number FROM calls')->fetchAll();
    $ids = [];
    foreach ($rows as $row) {
        if (phone_key((string)$row['phone_number']) === $key) $ids[] = (int)$row['id'];
    }

    if ($ids) {
        $marks = implode(',', array_fill(0, count($ids), '?'));
        $stmt = $pdo->prepare("DELETE FROM calls WHERE id IN ($marks)");
        $stmt->execute($ids);
    }

    json_response(['ok' => true, 'deleted' => count($ids)]);
}

if ($action === 'clear_all') {
    $count = (int)$pdo->query('SELECT COUNT(*) FROM calls')->fetchColumn();
    $pdo->exec('DELETE FROM calls');
    json_response(['ok' => true, 'deleted' => $count]);
}

json_response(['ok' => false, 'error' => 'Unsupported action'], 422);
