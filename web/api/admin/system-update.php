<?php
declare(strict_types=1);

require __DIR__ . '/../../app/bootstrap.php';
require_admin_api();
require __DIR__ . '/../../app/site_updater.php';

$root = realpath(__DIR__ . '/../../') ?: (__DIR__ . '/../../');
$root = rtrim($root, DIRECTORY_SEPARATOR);

if ($_SERVER['REQUEST_METHOD'] === 'GET') {
    json_response([
        'ok' => true,
        'status' => otup_status($root),
    ]);
}

$in = json_input();
$action = (string)($in['action'] ?? '');

if ($action !== 'update') {
    json_response(['ok' => false, 'error' => 'Unsupported action'], 422);
}

try {
    $result = otup_perform_update($root);

    $configPath = $root . '/config/local.php';
    $configBackupPath = $root . '/storage/.ontrack-local.php';

    if (is_file($configPath)) {
        $payload = file_get_contents($configPath);
        if ($payload !== false) {
            otup_atomic_write($configBackupPath, $payload);
        }
    }

    json_response([
        'ok' => true,
        'updated' => true,
        'files' => (int)$result['files'],
        'preserved' => (int)$result['preserved'],
        'commit' => $result['commit'],
        'status' => otup_status($root),
    ]);
} catch (Throwable $e) {
    json_response([
        'ok' => false,
        'error' => $e->getMessage(),
    ], 500);
}
