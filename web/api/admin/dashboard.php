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
    "SELECT id,name,phone_number,manufacturer,model,app_version,last_seen_at,
            conference_can_add_call,conferenceable_count,active_call_count,
            conference_status,conference_checked_at,created_at,
            CASE
              WHEN last_seen_at IS NOT NULL AND last_seen_at >= ? THEN 'online'
              ELSE 'offline'
            END AS status
     FROM devices
     WHERE revoked_at IS NULL
     ORDER BY id DESC"
);
$devicesStmt->execute([$onlineCutoff]);
$devices = $devicesStmt->fetchAll();

$calls = $pdo->query(
    "SELECT id,direction,phone_number,contact_name,status,outcome,
            started_at,answered_at,ended_at,duration_seconds,
            recording_status,recording_url,created_at
     FROM calls
     ORDER BY id DESC
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

json_response([
    'ok' => true,
    'metrics' => $metrics,
    'devices' => $devices,
    'calls' => $calls,
    'campaigns' => $campaigns,
    'contacts' => $contacts,
    'media' => [
        'status' => 'disconnected',
        'audio_on_server' => false,
        'recording_enabled' => false,
        'label' => 'Phone audio only',
        'detail' => 'Call audio is currently handled only by the Android handset. No live audio is reaching this server yet.'
    ],
    'timezone' => (string)cfg('timezone', 'Africa/Cairo')
]);
