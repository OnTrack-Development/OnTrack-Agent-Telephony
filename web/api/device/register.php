<?php
require __DIR__ . '/../../app/bootstrap.php';

$in = json_input();
$code = trim((string)($in['pairing_code'] ?? ''));
$name = trim((string)($in['name'] ?? 'Android Phone'));
$phone = normalize_phone((string)($in['phone_number'] ?? ''));

if (!preg_match('/^\d{6}$/', $code)) {
    json_response(['ok' => false, 'error' => 'Invalid pairing code'], 422);
}

$pdo = db();
$tenantId = ensure_default_tenant_and_agent($pdo);

$agentStmt = $pdo->prepare(
    "SELECT id FROM voice_agents
     WHERE tenant_id=? AND is_default=1 AND is_active=1
     ORDER BY id ASC LIMIT 1"
);
$agentStmt->execute([$tenantId]);
$agentId = (int)($agentStmt->fetchColumn() ?: 0);

$pdo->beginTransaction();

try {
    $q = $pdo->prepare(
        "SELECT * FROM pairing_codes
         WHERE code=? AND used_at IS NULL
           AND expires_at >= datetime('now')
         LIMIT 1"
    );
    $q->execute([$code]);
    $pair = $q->fetch();

    if (!$pair) {
        throw new RuntimeException(
            'Pairing code expired or invalid');
    }

    $token = random_token();
    $hash = hash('sha256', $token);

    $s = $pdo->prepare(
        "INSERT INTO devices(
            name,phone_number,platform,manufacturer,model,app_version,
            token_hash,status,last_seen_at,created_at,tenant_id,voice_agent_id
         ) VALUES(?,?, 'android',?,?,?,?, 'online',?,?,?,?)"
    );

    $s->execute([
        $name,
        $phone ?: null,
        (string)($in['manufacturer'] ?? ''),
        (string)($in['model'] ?? ''),
        (string)($in['app_version'] ?? ''),
        $hash,
        now_utc(),
        now_utc(),
        $tenantId,
        $agentId > 0 ? $agentId : null,
    ]);

    $id = (int)$pdo->lastInsertId();

    $u = $pdo->prepare(
        'UPDATE pairing_codes SET used_at=? WHERE id=?'
    );
    $u->execute([now_utc(), $pair['id']]);

    $pdo->commit();

    json_response([
        'ok' => true,
        'device_id' => $id,
        'device_token' => $token,
        'poll_url' => rtrim((string)cfg('base_url'), '/')
            . '/api/device/poll.php'
    ], 201);

} catch (Throwable $e) {
    $pdo->rollBack();

    json_response([
        'ok' => false,
        'error' => $e->getMessage()
    ], 422);
}
