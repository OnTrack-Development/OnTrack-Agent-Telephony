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
    json_response(['ok' => false, 'error' => 'No active voice agent is assigned to this phone'], 409);
}

$apiKey = setting_value('gemini_api_key', '');
if ($apiKey === '') {
    json_response([
        'ok' => false,
        'error' => 'gemini_not_configured',
        'detail' => 'Add the Gemini API key from Bridge Status → AI Platform.'
    ], 503);
}

$contact = trim((string)($call['contact_name'] ?? ''));
$phone = trim((string)($call['phone_number'] ?? ''));

$callContext = "

معلومات المكالمة الحالية من منصة OnTrack:
"
    . "- اتجاه المكالمة: " . ($direction === 'inbound' ? 'واردة' : 'صادرة') . "
"
    . "- اسم جهة الاتصال: " . ($contact !== '' ? $contact : 'غير معروف') . "
"
    . "- رقم الهاتف: " . ($phone !== '' ? $phone : 'غير متاح') . "
"
    . "- رقم جلسة المكالمة داخل المنصة: " . $callId . "
"
    . "لا تكشف أي تفاصيل تقنية عن المنصة أو رقم الجلسة للعميل.";

$systemInstruction = trim((string)$agent['system_prompt']) . $callContext;
$model = trim((string)$agent['model']);
$voice = trim((string)$agent['voice_name']);

$now = new DateTimeImmutable('now', new DateTimeZone('UTC'));
$expireTime = $now->modify('+30 minutes')->format('Y-m-d\TH:i:s\Z');
$newSessionExpireTime = $now->modify('+2 minutes')->format('Y-m-d\TH:i:s\Z');

$tokenBody = [
    'uses' => 1,
    'expireTime' => $expireTime,
    'newSessionExpireTime' => $newSessionExpireTime,
    'liveConnectConstraints' => [
        'model' => 'models/' . ltrim($model, '/'),
        'config' => [
            'responseModalities' => ['AUDIO'],
            'sessionResumption' => (object)[],
        ],
    ],
];

$ch = curl_init('https://generativelanguage.googleapis.com/v1beta/auth_tokens');
curl_setopt_array($ch, [
    CURLOPT_POST => true,
    CURLOPT_POSTFIELDS => json_encode($tokenBody, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES),
    CURLOPT_RETURNTRANSFER => true,
    CURLOPT_CONNECTTIMEOUT => 8,
    CURLOPT_TIMEOUT => 20,
    CURLOPT_HTTPHEADER => [
        'Content-Type: application/json',
        'x-goog-api-key: ' . $apiKey,
        'User-Agent: OnTrackAgentTelephony/0.6.0',
    ],
]);

$raw = curl_exec($ch);
$http = (int)curl_getinfo($ch, CURLINFO_RESPONSE_CODE);
$error = curl_error($ch);
curl_close($ch);

$data = is_string($raw) ? (json_decode($raw, true) ?: []) : [];

if ($raw === false || $http < 200 || $http >= 300) {
    json_response([
        'ok' => false,
        'error' => 'live_session_failed',
        'detail' => $error !== '' ? $error : ($data['error']['message'] ?? 'Unable to create Live session'),
        'status' => $http,
    ], 502);
}

$token = trim((string)($data['name'] ?? ''));
if ($token === '') {
    json_response(['ok' => false, 'error' => 'live_token_missing'], 502);
}

$sessionToken = random_token(24);
$sessionHash = hash('sha256', $sessionToken);
$created = now_utc();

$insert = $pdo->prepare(
    "INSERT INTO ai_sessions(
        tenant_id,agent_id,device_id,call_id,direction,status,
        client_token_hash,provider,model,voice_name,started_at,created_at
     ) VALUES(?,?,?,?,?,'prepared',?,'gemini',?,?,?,?)"
);
$insert->execute([
    $tenantId,
    $agentId,
    $device['id'],
    $callId,
    $direction,
    $sessionHash,
    $model,
    $voice,
    $created,
    $created,
]);

$sessionId = (int)$pdo->lastInsertId();

json_response([
    'ok' => true,
    'platform_session_id' => $sessionId,
    'platform_session_token' => $sessionToken,
    'provider' => 'gemini_live',
    'token' => $token,
    'model' => $model,
    'voice_name' => $voice,
    'expires_at' => $expireTime,
    'system_instruction' => $systemInstruction,
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
    'websocket_url' => 'wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContentConstrained',
    'opening_text' => $direction === 'inbound'
        ? 'ابدأ المكالمة الآن بتحية قصيرة وطبيعية حسب شخصيتك ودورك، ثم توقف واسمع العميل.'
        : '',
]);
