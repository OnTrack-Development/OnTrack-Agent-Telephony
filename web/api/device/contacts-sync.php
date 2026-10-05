<?php
require __DIR__ . '/../../app/bootstrap.php';

$device = current_device();
$in = json_input();
$contacts = $in['contacts'] ?? [];
$replace = !empty($in['replace']);

if (!is_array($contacts)) {
    json_response(['ok' => false, 'error' => 'contacts must be an array'], 422);
}

if (count($contacts) > 250) {
    json_response(['ok' => false, 'error' => 'Maximum 250 contacts per batch'], 422);
}

$pdo = db();
$pdo->beginTransaction();

try {
    if ($replace) {
        $delete = $pdo->prepare('DELETE FROM phone_contacts WHERE device_id=?');
        $delete->execute([$device['id']]);
    }

    $upsert = $pdo->prepare(
        'INSERT INTO phone_contacts(device_id,contact_name,phone_number,phone_key,synced_at)
         VALUES(?,?,?,?,?)
         ON CONFLICT(device_id,phone_key) DO UPDATE SET
           contact_name=excluded.contact_name,
           phone_number=excluded.phone_number,
           synced_at=excluded.synced_at'
    );

    $saved = 0;

    foreach ($contacts as $row) {
        if (!is_array($row)) continue;

        $phone = normalize_phone((string)($row['phone'] ?? ''));
        $key = phone_key($phone);
        $name = trim((string)($row['name'] ?? ''));

        if (strlen($key) < 5) continue;
        if ($name === '') $name = $phone;

        $upsert->execute([
            $device['id'],
            mb_substr($name, 0, 200),
            $phone,
            $key,
            now_utc()
        ]);

        $saved++;
    }

    $pdo->commit();

    $count = $pdo->prepare('SELECT COUNT(*) FROM phone_contacts WHERE device_id=?');
    $count->execute([$device['id']]);

    json_response([
        'ok' => true,
        'saved' => $saved,
        'total' => (int)$count->fetchColumn(),
        'replace' => $replace
    ]);
} catch (Throwable $e) {
    $pdo->rollBack();
    json_response(['ok' => false, 'error' => $e->getMessage()], 500);
}
