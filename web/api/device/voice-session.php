<?php
require __DIR__ . '/../../app/bootstrap.php';

$device = current_device();
$in = json_input();
$pdo = db();

$callId = (int)($in['call_id'] ?? 0);
$direction = trim((string)($in['direction'] ?? 'inbound'));

if ($callId <= 0 || !in_array($direction, ['inbound','outbound'], true)) {
    json_response(['ok' => false, 'error' => 'Invalid call session request'], 422);
}

$stmt = $pdo->prepare(
    "SELECT c.*,d.tenant_id,d.voice_agent_id
     FROM calls c
     JOIN devices d ON d.id=c.device_id
     WHERE c.id=? AND c.device_id=?
     LIMIT 1"
);
$stmt->execute([$callId, $device['id']]);
$call = $stmt->fetch();

if (!$call) {
    json_response(['ok' => false, 'error' => 'Call not found'], 404);
}

$tenantId = (int)($call['tenant_id'] ?? 0);
$agentId = (int)($call['voice_agent_id'] ?? 0);

if ($tenantId <= 0 || $agentId <= 0) {
    ensure_default_tenant_and_agent($pdo);

    $refresh = $pdo->prepare(
        "SELECT tenant_id,voice_agent_id FROM devices WHERE id=? LIMIT 1"
    );
    $refresh->execute([$device['id']]);
    $assigned = $refresh->fetch() ?: [];
    $tenantId = (int)($assigned['tenant_id'] ?? 0);
    $agentId = (int)($assigned['voice_agent_id'] ?? 0);
}

$agentStmt = $pdo->prepare(
    "SELECT * FROM voice_agents
     WHERE id=? AND tenant_id=? AND is_active=1
     LIMIT 1"
);
$agentStmt->execute([$agentId, $tenantId]);
$agent = $agentStmt->fetch();

if (!$agent) {
    json_response([
        'ok' => false,
        'error' => 'No active voice agent is assigned to this phone'
    ], 409);
}

if (setting_value('gemini_api_key', '') === '') {
    json_response([
        'ok' => false,
        'error' => 'gemini_not_configured',
        'detail' => 'Add the Gemini API key from Platform & Audio → AI Platform.'
    ], 503);
}

$sessionToken = random_token(24);
$sessionHash = hash('sha256', $sessionToken);
$created = now_utc();

$insert = $pdo->prepare(
    "INSERT INTO ai_sessions(
        tenant_id,agent_id,device_id,call_id,direction,status,
        client_token_hash,provider,model,voice_name,started_at,created_at
     ) VALUES(?,?,?,?,?,'prepared',?,'platform_relay',?,?,?,?)"
);
$insert->execute([
    $tenantId,
    $agentId,
    $device['id'],
    $callId,
    $direction,
    $sessionHash,
    trim((string)$agent['model']),
    trim((string)$agent['voice_name']),
    $created,
    $created,
]);

$sessionId = (int)$pdo->lastInsertId();

$pdo->prepare(
    "UPDATE calls
     SET media_status='requested',
         media_requested_at=COALESCE(media_requested_at,?),
         media_error=NULL
     WHERE id=? AND device_id=?"
)->execute([$created, $callId, $device['id']]);

json_response([
    'ok' => true,
    'platform_session_id' => $sessionId,
    'platform_session_token' => $sessionToken,
    'provider' => 'platform_relay',
    'model' => trim((string)$agent['model']),
    'voice_name' => trim((string)$agent['voice_name']),
    'input_audio' => [
        'encoding' => 'pcm_s16le',
        'sample_rate' => 16000,
        'channels' => 1,
        'chunk_ms' => 100,
    ],
    'output_audio' => [
        'encoding' => 'pcm_s16le',
        'sample_rate' => 24000,
        'channels' => 1,
    ],
    'relay' => [
        'run' => '/api/device/voice-relay.php',
        'push' => '/api/device/voice-media-push.php',
        'pull' => '/api/device/voice-media-pull.php',
    ],
]);
