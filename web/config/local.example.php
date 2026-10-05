<?php
return [
    'app_name' => 'OnTrack AI Telephony',
    'base_url' => 'https://agent.ontrackegy.com',
    // Production deploy writes admin_password_hash into config/local.php.
    'admin_password_hash' => '',
    'session_name' => 'ontrack_agent_session',
    'sqlite_path' => __DIR__ . '/../storage/app.sqlite',
    'pairing_ttl_minutes' => 10,
    'job_lease_seconds' => 90,
];
