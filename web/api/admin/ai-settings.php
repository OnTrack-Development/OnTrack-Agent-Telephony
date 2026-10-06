<?php
require __DIR__ . '/../../app/bootstrap.php';
require_admin_api();

$pdo = db();

function default_voice_agent(PDO $pdo): array {
    $tenantId = ensure_default_tenant_and_agent($pdo);

    $stmt = $pdo->prepare(
        "SELECT va.*
         FROM voice_agents va
         WHERE va.tenant_id=? AND va.is_default=1
         ORDER BY va.id ASC
         LIMIT 1"
    );
    $stmt->execute([$tenantId]);
    $agent = $stmt->fetch();

    if (!$agent) {
        throw new RuntimeException('Default voice agent is missing');
    }

    return $agent;
}

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $in = json_input();
    $agent = default_voice_agent($pdo);

    if (array_key_exists('gemini_api_key', $in)) {
        $key = trim((string)$in['gemini_api_key']);
        if ($key !== '') {
            if (strlen($key) < 20 || strlen($key) > 500) {
                json_response(['ok' => false, 'error' => 'Invalid Gemini API key'], 422);
            }
            save_setting('gemini_api_key', $key);
        }
    }

    $name = trim((string)($in['agent_name'] ?? $agent['name']));
    $voice = trim((string)($in['voice_name'] ?? $agent['voice_name']));
    $model = trim((string)($in['model'] ?? $agent['model']));
    $prompt = trim((string)($in['system_prompt'] ?? $agent['system_prompt']));

    if ($name === '' || mb_strlen($name) > 120) {
        json_response(['ok' => false, 'error' => 'Agent name is required'], 422);
    }
    if ($voice === '' || mb_strlen($voice) > 80) {
        json_response(['ok' => false, 'error' => 'Voice name is required'], 422);
    }
    if ($model === '' || mb_strlen($model) > 120) {
        json_response(['ok' => false, 'error' => 'Model is required'], 422);
    }
    if ($prompt === '' || mb_strlen($prompt) > 30000) {
        json_response(['ok' => false, 'error' => 'System prompt is required'], 422);
    }

    $pdo->prepare(
        "UPDATE voice_agents
         SET name=?,voice_name=?,model=?,system_prompt=?,updated_at=?
         WHERE id=?"
    )->execute([
        $name,
        $voice,
        $model,
        $prompt,
        now_utc(),
        $agent['id']
    ]);

    json_response(['ok' => true]);
}

$agent = default_voice_agent($pdo);
$key = setting_value('gemini_api_key', '');

json_response([
    'ok' => true,
    'gemini_configured' => $key !== '',
    'gemini_key_hint' => $key === '' ? '' : ('••••' . substr($key, -4)),
    'agent' => [
        'id' => (int)$agent['id'],
        'name' => $agent['name'],
        'voice_name' => $agent['voice_name'],
        'model' => $agent['model'],
        'system_prompt' => $agent['system_prompt'],
    ],
]);
