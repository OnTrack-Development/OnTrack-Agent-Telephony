<?php
declare(strict_types=1);

function require_device_ai_session(
    array $device,
    int $sessionId,
    string $sessionToken
): array {
    if ($sessionId <= 0 || $sessionToken === '') {
        json_response(['ok' => false, 'error' => 'Invalid platform session credentials'], 422);
    }

    $stmt = db()->prepare(
        "SELECT s.*,a.system_prompt,a.model AS agent_model,
                a.voice_name AS agent_voice,a.provider AS agent_provider,
                a.is_active AS agent_active,
                c.phone_number,c.contact_name,c.direction AS call_direction,
                c.status AS call_status,c.ended_at AS call_ended_at
         FROM ai_sessions s
         JOIN voice_agents a ON a.id=s.agent_id AND a.tenant_id=s.tenant_id
         JOIN calls c ON c.id=s.call_id AND c.device_id=s.device_id
         WHERE s.id=? AND s.device_id=?
         LIMIT 1"
    );
    $stmt->execute([$sessionId, (int)$device['id']]);
    $session = $stmt->fetch();

    if (!$session
        || !hash_equals(
            (string)$session['client_token_hash'],
            hash('sha256', $sessionToken)
        )) {
        json_response(['ok' => false, 'error' => 'Platform AI session not found'], 404);
    }

    if ((int)($session['agent_active'] ?? 0) !== 1) {
        json_response(['ok' => false, 'error' => 'Assigned Voice Agent is disabled'], 409);
    }

    return $session;
}

function platform_call_context(array $session): string {
    $direction = (string)($session['direction'] ?? $session['call_direction'] ?? 'inbound');
    $contact = trim((string)($session['contact_name'] ?? ''));
    $phone = trim((string)($session['phone_number'] ?? ''));
    $callId = (int)($session['call_id'] ?? 0);

    return "\n\nمعلومات المكالمة الحالية من منصة OnTrack:\n"
        . "- اتجاه المكالمة: " . ($direction === 'inbound' ? 'واردة' : 'صادرة') . "\n"
        . "- اسم جهة الاتصال: " . ($contact !== '' ? $contact : 'غير معروف') . "\n"
        . "- رقم الهاتف: " . ($phone !== '' ? $phone : 'غير متاح') . "\n"
        . "- رقم جلسة المكالمة داخل المنصة: " . $callId . "\n"
        . "لا تكشف أي تفاصيل تقنية عن المنصة أو رقم الجلسة للعميل.";
}
