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
    ensure_column($pdo, 'calls', 'recording_file', 'TEXT');
    ensure_column($pdo, 'calls', 'media_status', "TEXT NOT NULL DEFAULT 'not_connected'");
    ensure_column($pdo, 'calls', 'media_pin', 'TEXT');
    ensure_column($pdo, 'calls', 'media_bridge_number', 'TEXT');
    ensure_column($pdo, 'calls', 'media_requested_at', 'TEXT');
    ensure_column($pdo, 'calls', 'media_connected_at', 'TEXT');
    ensure_column($pdo, 'calls', 'media_gateway_connected_at', 'TEXT');
    ensure_column($pdo, 'calls', 'media_merge_requested_at', 'TEXT');
    ensure_column($pdo, 'calls', 'media_merge_confirmed_at', 'TEXT');
    ensure_column($pdo, 'calls', 'media_disconnected_at', 'TEXT');
    ensure_column($pdo, 'calls', 'media_error', 'TEXT');
    ensure_column($pdo, 'devices', 'conference_can_add_call', 'INTEGER');
    ensure_column($pdo, 'devices', 'conferenceable_count', 'INTEGER');
    ensure_column($pdo, 'devices', 'active_call_count', 'INTEGER');
    ensure_column($pdo, 'devices', 'conference_status', "TEXT NOT NULL DEFAULT 'unknown'");
    ensure_column($pdo, 'devices', 'conference_checked_at', 'TEXT');

    $secret = $pdo->prepare("SELECT setting_value FROM settings WHERE setting_key='media_gateway_secret'");
    $secret->execute();
    if (!$secret->fetchColumn()) {
        $value = bin2hex(random_bytes(32));
        $stmt = $pdo->prepare(
            "INSERT INTO settings(setting_key,setting_value,updated_at)
             VALUES('media_gateway_secret',?,?)
             ON CONFLICT(setting_key) DO NOTHING"
        );
        $stmt->execute([$value, gmdate('Y-m-d H:i:s')]);
    }
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


function setting_value(string $key, string $default = ''): string {
    $stmt = db()->prepare('SELECT setting_value FROM settings WHERE setting_key=? LIMIT 1');
    $stmt->execute([$key]);
    $value = $stmt->fetchColumn();
    return is_string($value) ? $value : $default;
}

function save_setting(string $key, string $value): void {
    $stmt = db()->prepare(
        "INSERT INTO settings(setting_key,setting_value,updated_at)
         VALUES(?,?,?)
         ON CONFLICT(setting_key)
         DO UPDATE SET setting_value=excluded.setting_value,updated_at=excluded.updated_at"
    );
    $stmt->execute([$key, $value, now_utc()]);
}

function require_media_gateway(): void {
    $auth = (string)($_SERVER['HTTP_AUTHORIZATION'] ?? '');
    if (!preg_match('/^Bearer\s+(.+)$/i', $auth, $m)) {
        json_response(['ok' => false, 'error' => 'Missing media gateway token'], 401);
    }

    $expected = setting_value('media_gateway_secret', '');
    $actual = trim((string)$m[1]);

    if ($expected === '' || !hash_equals($expected, $actual)) {
        json_response(['ok' => false, 'error' => 'Invalid media gateway token'], 401);
    }
}

function create_media_pin(PDO $pdo): string {
    for ($attempt = 0; $attempt < 20; $attempt++) {
        $pin = (string)random_int(10000000, 99999999);
        $stmt = $pdo->prepare(
            "SELECT 1 FROM calls
             WHERE media_pin=? AND media_status NOT IN ('disconnected','failed')
             LIMIT 1"
        );
        $stmt->execute([$pin]);

        if (!$stmt->fetchColumn()) {
            return $pin;
        }
    }

    throw new RuntimeException('Could not allocate media session PIN');
}


function local_secret_key(): string {
    $path = __DIR__ . '/../storage/.app-secret-key';

    if (is_file($path)) {
        $raw = trim((string)file_get_contents($path));
        $key = base64_decode($raw, true);
        if (is_string($key) && strlen($key) === 32) {
            return $key;
        }
    }

    $key = random_bytes(32);
    if (!is_dir(dirname($path))) {
        mkdir(dirname($path), 0775, true);
    }

    file_put_contents($path, base64_encode($key), LOCK_EX);
    @chmod($path, 0600);
    return $key;
}

function encrypt_local_secret(string $plain): string {
    if ($plain === '') return '';

    $key = local_secret_key();

    if (function_exists('sodium_crypto_secretbox')) {
        $nonce = random_bytes(SODIUM_CRYPTO_SECRETBOX_NONCEBYTES);
        $cipher = sodium_crypto_secretbox($plain, $nonce, $key);
        return 'sodium:' . base64_encode($nonce . $cipher);
    }

    $iv = random_bytes(12);
    $tag = '';
    $cipher = openssl_encrypt(
        $plain,
        'aes-256-gcm',
        $key,
        OPENSSL_RAW_DATA,
        $iv,
        $tag
    );

    if (!is_string($cipher)) {
        throw new RuntimeException('Could not encrypt local secret');
    }

    return 'aesgcm:' . base64_encode($iv . $tag . $cipher);
}

function decrypt_local_secret(string $value): string {
    if ($value === '') return '';

    $key = local_secret_key();

    if (str_starts_with($value, 'sodium:')) {
        $raw = base64_decode(substr($value, 7), true);
        if (!is_string($raw) || strlen($raw) <= SODIUM_CRYPTO_SECRETBOX_NONCEBYTES) {
            return '';
        }

        $nonce = substr($raw, 0, SODIUM_CRYPTO_SECRETBOX_NONCEBYTES);
        $cipher = substr($raw, SODIUM_CRYPTO_SECRETBOX_NONCEBYTES);
        $plain = sodium_crypto_secretbox_open($cipher, $nonce, $key);
        return is_string($plain) ? $plain : '';
    }

    if (str_starts_with($value, 'aesgcm:')) {
        $raw = base64_decode(substr($value, 7), true);
        if (!is_string($raw) || strlen($raw) <= 28) return '';

        $iv = substr($raw, 0, 12);
        $tag = substr($raw, 12, 16);
        $cipher = substr($raw, 28);

        $plain = openssl_decrypt(
            $cipher,
            'aes-256-gcm',
            $key,
            OPENSSL_RAW_DATA,
            $iv,
            $tag
        );

        return is_string($plain) ? $plain : '';
    }

    return '';
}

function twilio_auth_token(): string {
    return decrypt_local_secret(setting_value('twilio_auth_token_enc', ''));
}

function twilio_account_sid(): string {
    return trim(setting_value('twilio_account_sid', ''));
}

function twilio_request_url(): string {
    $base = rtrim((string)cfg('base_url', 'https://agent.ontrackegy.com'), '/');
    $uri = (string)($_SERVER['REQUEST_URI'] ?? '/');
    return $base . $uri;
}

function verify_twilio_signature(): void {
    $token = twilio_auth_token();
    if ($token === '') {
        http_response_code(503);
        exit('Twilio is not configured');
    }

    $provided = (string)($_SERVER['HTTP_X_TWILIO_SIGNATURE'] ?? '');
    if ($provided === '') {
        http_response_code(403);
        exit('Missing Twilio signature');
    }

    $params = $_POST;
    ksort($params, SORT_STRING);

    $data = twilio_request_url();

    foreach ($params as $key => $value) {
        if (is_array($value)) continue;
        $data .= (string)$key . (string)$value;
    }

    $expected = base64_encode(hash_hmac('sha1', $data, $token, true));

    if (!hash_equals($expected, $provided)) {
        http_response_code(403);
        exit('Invalid Twilio signature');
    }
}

function twiml_response(string $xml): never {
    header('Content-Type: text/xml; charset=utf-8');
    echo "<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n<Response>"
        . $xml
        . '</Response>';
    exit;
}

function xml_attr(string $value): string {
    return htmlspecialchars($value, ENT_QUOTES | ENT_XML1, 'UTF-8');
}
