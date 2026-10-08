<?php
require __DIR__ . '/../../app/bootstrap.php';
require_admin_api();

$pdo = db();

$timezone = new DateTimeZone((string)cfg('timezone', 'Africa/Cairo'));
$nowLocal = new DateTimeImmutable('now', $timezone);
$startLocal = $nowLocal->setTime(0, 0, 0);
$endLocal = $startLocal->modify('+1 day');
$utc = new DateTimeZone('UTC');
$startUtc = $startLocal->setTimezone($utc)->format('Y-m-d H:i:s');
$endUtc = $endLocal->setTimezone($utc)->format('Y-m-d H:i:s');

$onlineCutoff = gmdate('Y-m-d H:i:s', time() - 60);

$countOnline = $pdo->prepare(
    "SELECT COUNT(*) FROM devices
     WHERE revoked_at IS NULL
       AND last_seen_at IS NOT NULL
       AND last_seen_at >= ?"
);
$countOnline->execute([$onlineCutoff]);

$countCallsToday = $pdo->prepare(
    "SELECT COUNT(*) FROM calls WHERE created_at >= ? AND created_at < ?"
);
$countCallsToday->execute([$startUtc, $endUtc]);

$countAnsweredToday = $pdo->prepare(
    "SELECT COUNT(*) FROM calls
     WHERE created_at >= ? AND created_at < ?
       AND answered_at IS NOT NULL"
);
$countAnsweredToday->execute([$startUtc, $endUtc]);

$metrics = [
    'devices' => (int)$countOnline->fetchColumn(),
    'paired_devices' => (int)$pdo->query(
        "SELECT COUNT(*) FROM devices WHERE revoked_at IS NULL"
    )->fetchColumn(),
    'running_campaigns' => (int)$pdo->query(
        "SELECT COUNT(*) FROM campaigns WHERE status='running'"
    )->fetchColumn(),
    'calls_today' => (int)$countCallsToday->fetchColumn(),
    'answered_today' => (int)$countAnsweredToday->fetchColumn(),
    'contacts' => (int)$pdo->query(
        "SELECT COUNT(*) FROM phone_contacts"
    )->fetchColumn(),
];

$devicesStmt = $pdo->prepare(
    "SELECT d.id,d.name,d.phone_number,d.manufacturer,d.model,d.app_version,d.last_seen_at,
            d.tenant_id,d.voice_agent_id,d.created_at,
            t.name AS tenant_name,
            va.name AS voice_agent_name,
            va.is_active AS voice_agent_active,
            va.provider AS voice_agent_provider,
            va.model AS voice_agent_model,
            va.voice_name AS voice_agent_voice,
            CASE
              WHEN d.last_seen_at IS NOT NULL AND d.last_seen_at >= ? THEN 'online'
              ELSE 'offline'
            END AS status
     FROM devices d
     LEFT JOIN tenants t ON t.id=d.tenant_id
     LEFT JOIN voice_agents va ON va.id=d.voice_agent_id
     WHERE d.revoked_at IS NULL
     ORDER BY d.id DESC"
);
$devicesStmt->execute([$onlineCutoff]);
$devices = $devicesStmt->fetchAll();

$calls = $pdo->query(
    "SELECT c.id,c.direction,c.phone_number,c.contact_name,c.status,c.outcome,
            c.started_at,c.answered_at,c.ended_at,c.duration_seconds,
            c.recording_status,c.recording_url,
            c.media_status,c.media_bridge_number,c.media_requested_at,
            c.media_connected_at,c.media_gateway_connected_at,
            c.media_merge_requested_at,c.media_merge_confirmed_at,
            c.media_disconnected_at,c.media_error,
            c.created_at,
            (SELECT s.status
             FROM ai_sessions s
             WHERE s.call_id=c.id
             ORDER BY s.id DESC
             LIMIT 1) AS ai_session_status,
            (SELECT s.last_error
             FROM ai_sessions s
             WHERE s.call_id=c.id
             ORDER BY s.id DESC
             LIMIT 1) AS ai_session_error
     FROM calls c
     ORDER BY c.id DESC
     LIMIT 250"
)->fetchAll();

$campaigns = $pdo->query(
    "SELECT c.id,c.name,c.agent_name,c.status,c.created_at,
            COUNT(cc.id) total_contacts,
            SUM(CASE WHEN cc.status IN ('completed','failed','skipped') THEN 1 ELSE 0 END) done_contacts
     FROM campaigns c
     LEFT JOIN campaign_contacts cc ON cc.campaign_id=c.id
     GROUP BY c.id
     ORDER BY c.id DESC
     LIMIT 50"
)->fetchAll();

$contacts = $pdo->query(
    "SELECT pc.id,pc.device_id,pc.contact_name,pc.phone_number,pc.synced_at,
            d.name device_name
     FROM phone_contacts pc
     JOIN devices d ON d.id=pc.device_id
     WHERE d.revoked_at IS NULL
     ORDER BY pc.contact_name COLLATE NOCASE ASC
     LIMIT 2000"
)->fetchAll();

$liveMedia = $pdo->query(
    "SELECT COUNT(*) FROM ai_sessions
     WHERE status IN ('connecting','connected','active','live')
       AND ended_at IS NULL"
)->fetchColumn();

$liveRecording = $pdo->query(
    "SELECT COUNT(*) FROM calls
     WHERE ended_at IS NULL
       AND recording_status='recording'"
)->fetchColumn();

$audioOnServer = (int)$liveMedia > 0;
$recordingOn = (int)$liveRecording > 0;

if ($audioOnServer) {
    $mediaStatus = 'connected';
    $mediaLabel = 'Platform Voice Agent live';
    $mediaDetail = 'The active call is attached to an OnTrack platform AI session.';
} else {
    $mediaStatus = 'validated';
    $mediaLabel = 'Direct SIM audio validated';
    $mediaDetail = 'Digital SIM RX/TX is validated. The platform media session starts per call when the assigned Voice Agent and provider are ready.';
}

json_response([
    'ok' => true,
    'metrics' => $metrics,
    'devices' => $devices,
    'calls' => $calls,
    'campaigns' => $campaigns,
    'contacts' => $contacts,
    'media' => [
        'status' => $mediaStatus,
        'audio_on_server' => $audioOnServer,
        'recording_enabled' => $recordingOn,
        'phone_audio_validated' => true,
        'architecture' => 'phone_platform_voice_agent',
        'label' => $mediaLabel,
        'detail' => $mediaDetail,
    ],
    'timezone' => (string)cfg('timezone', 'Africa/Cairo')
]);
