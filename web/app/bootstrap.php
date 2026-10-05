<?php
declare(strict_types=1);

$configFile = __DIR__ . '/../config/local.php';
$configBackupFile = __DIR__ . '/../storage/.ontrack-local.php';

if (!is_file($configFile) && is_file($configBackupFile)) {
    $configDir = dirname($configFile);
    if (!is_dir($configDir)) @mkdir($configDir, 0775, true);
    @copy($configBackupFile, $configFile);
    clearstatcache(true, $configFile);
}

if (!is_file($configFile)) {
    $uri = (string)($_SERVER['REQUEST_URI'] ?? '');
    if (!str_contains($uri, '/api/')) {
        header('Location: /update.php');
        exit;
    }
    http_response_code(503);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode(['ok' => false, 'error' => 'Application is not configured. Open /update.php to repair local configuration.']);
    exit;
}

$config = require $configFile;

if (session_status() !== PHP_SESSION_ACTIVE) {
    session_name($config['session_name'] ?? 'ontrack_agent_session');
    session_set_cookie_params([
        'httponly' => true,
        'secure' => (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off'),
        'samesite' => 'Lax',
    ]);
    session_start();
}

function cfg(string $key, mixed $default = null): mixed {
    global $config;
    return $config[$key] ?? $default;
}

function db(): PDO {
    static $pdo = null;
    if ($pdo instanceof PDO) return $pdo;

    $path = (string) cfg('sqlite_path');
    $dir = dirname($path);
    if (!is_dir($dir)) mkdir($dir, 0775, true);

    $pdo = new PDO('sqlite:' . $path, null, null, [
        PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
    ]);

    $pdo->exec('PRAGMA journal_mode=WAL;');
    $pdo->exec('PRAGMA foreign_keys=ON;');
    migrate($pdo);

    return $pdo;
}

function ensure_column(PDO $pdo, string $table, string $column, string $definition): void {
    $rows = $pdo->query("PRAGMA table_info(" . $table . ")")->fetchAll();
    foreach ($rows as $row) {
        if (($row['name'] ?? '') === $column) return;
    }
    $pdo->exec("ALTER TABLE " . $table . " ADD COLUMN " . $column . " " . $definition);
}

function migrate(PDO $pdo): void {
    static $done = false;
    if ($done) return;
    $done = true;

    $sql = file_get_contents(__DIR__ . '/../database/schema.sql');
    if ($sql === false) throw new RuntimeException('Missing database/schema.sql');
    $pdo->exec($sql);

    // Existing databases from earlier POC builds need additive columns.
    ensure_column($pdo, 'calls', 'contact_name', 'TEXT');
    ensure_column($pdo, 'calls', 'recording_status', "TEXT NOT NULL DEFAULT 'not_recorded'");
    ensure_column($pdo, 'calls', 'recording_url', 'TEXT');
}

function json_input(): array {
    $raw = file_get_contents('php://input') ?: '';
    if ($raw === '') return $_POST ?: [];
    $data = json_decode($raw, true);
    return is_array($data) ? $data : [];
}

function json_response(array $payload, int $status = 200): never {
    http_response_code($status);
    header('Content-Type: application/json; charset=utf-8');
    header('Cache-Control: no-store');
    echo json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

function require_admin_api(): void {
    if (empty($_SESSION['admin_ok'])) {
        json_response(['ok' => false, 'error' => 'Unauthorized'], 401);
    }
}

function current_device(): array {
    $auth = $_SERVER['HTTP_AUTHORIZATION'] ?? '';
    if (!preg_match('/^Bearer\s+(.+)$/i', $auth, $m)) {
        json_response(['ok' => false, 'error' => 'Missing device token'], 401);
    }

    $hash = hash('sha256', trim($m[1]));
    $stmt = db()->prepare('SELECT * FROM devices WHERE token_hash = ? AND revoked_at IS NULL LIMIT 1');
    $stmt->execute([$hash]);
    $device = $stmt->fetch();

    if (!$device) {
        json_response(['ok' => false, 'error' => 'Invalid device token'], 401);
    }

    return $device;
}

function now_utc(): string {
    return gmdate('Y-m-d H:i:s');
}

function random_token(int $bytes = 32): string {
    return rtrim(strtr(base64_encode(random_bytes($bytes)), '+/', '-_'), '=');
}

function normalize_phone(string $phone): string {
    return preg_replace('/[^0-9+]/', '', trim($phone)) ?? '';
}

function phone_key(string $phone): string {
    $digits = str_replace('+', '', normalize_phone($phone));
    return strlen($digits) > 10 ? substr($digits, -10) : $digits;
}

function find_contact_name(PDO $pdo, int $deviceId, string $phone): ?string {
    $key = phone_key($phone);
    if ($key === '') return null;

    $stmt = $pdo->prepare('SELECT contact_name FROM phone_contacts WHERE device_id=? AND phone_key=? LIMIT 1');
    $stmt->execute([$deviceId, $key]);
    $name = $stmt->fetchColumn();

    return is_string($name) && trim($name) !== '' ? trim($name) : null;
}
