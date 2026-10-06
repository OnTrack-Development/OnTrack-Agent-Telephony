<?php
require __DIR__ . '/../../app/bootstrap.php';
require_admin_api();

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $in = json_input();

    $enabled = !empty($in['enabled']);
    $autoMerge = array_key_exists('auto_merge', $in) ? !empty($in['auto_merge']) : true;
    $number = normalize_phone((string)($in['bridge_number'] ?? ''));

    if ($enabled && strlen(str_replace('+', '', $number)) < 5) {
        json_response(['ok' => false, 'error' => 'A valid bridge phone number is required'], 422);
    }

    save_setting('media_bridge_enabled', $enabled ? '1' : '0');
    save_setting('media_bridge_number', $number);
    save_setting('media_auto_merge', $autoMerge ? '1' : '0');

    json_response([
        'ok' => true,
        'enabled' => $enabled,
        'bridge_number' => $number,
        'auto_merge' => $autoMerge,
    ]);
}

$secret = setting_value('media_gateway_secret', '');

json_response([
    'ok' => true,
    'enabled' => setting_value('media_bridge_enabled', '0') === '1',
    'bridge_number' => setting_value('media_bridge_number', ''),
    'auto_merge' => setting_value('media_auto_merge', '1') === '1',
    'callback_secret' => $secret,
    'bridge_event_url' => rtrim((string)cfg('base_url', 'https://agent.ontrackegy.com'), '/') . '/api/media/gateway-event.php',
    'recording_upload_url' => rtrim((string)cfg('base_url', 'https://agent.ontrackegy.com'), '/') . '/api/media/upload-recording.php',
    // Backward-compatible aliases for already deployed dashboard JS.
    'gateway_secret' => $secret,
    'gateway_event_url' => rtrim((string)cfg('base_url', 'https://agent.ontrackegy.com'), '/') . '/api/media/gateway-event.php',
    'gateway_upload_url' => rtrim((string)cfg('base_url', 'https://agent.ontrackegy.com'), '/') . '/api/media/upload-recording.php',
]);
