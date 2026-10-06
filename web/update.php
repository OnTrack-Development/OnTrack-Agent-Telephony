<?php
declare(strict_types=1);

/**
 * OnTrack Agent Telephony bootstrap entry.
 *
 * After the first installation there is NO separate updater login.
 * Website updates are managed from Dashboard -> Updates using the normal
 * admin session/password.
 */

$root = __DIR__;
$configPath = $root . '/config/local.php';
$configBackupPath = $root . '/storage/.ontrack-local.php';

function otu_h(string $value): string {
    return htmlspecialchars($value, ENT_QUOTES, 'UTF-8');
}

function otu_dir(string $path): void {
    if (!is_dir($path) && !mkdir($path, 0775, true) && !is_dir($path)) {
        throw new RuntimeException('Cannot create directory: ' . $path);
    }
}

function otu_write(string $path, string $content): void {
    otu_dir(dirname($path));
    $tmp = $path . '.tmp-' . bin2hex(random_bytes(4));

    if (file_put_contents($tmp, $content, LOCK_EX) === false) {
        throw new RuntimeException('Cannot write: ' . $path);
    }

    @chmod($tmp, 0640);

    if (!rename($tmp, $path)) {
        @unlink($tmp);
        throw new RuntimeException('Cannot replace: ' . $path);
    }
}

if (is_file($configPath) || is_file($configBackupPath)) {
    require __DIR__ . '/app/bootstrap.php';

    if (!empty($_SESSION['admin_ok'])) {
        header('Location: /?view=updates');
    } else {
        header('Location: /login.php?next=updates');
    }
    exit;
}

$error = '';

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    try {
        $adminPassword = (string)($_POST['admin_password'] ?? '');
        $baseUrl = rtrim(
            (string)($_POST['base_url'] ?? 'https://agent.ontrackegy.com'),
            '/'
        );

        if (strlen($adminPassword) < 8) {
            throw new RuntimeException(
                'Dashboard password must be at least 8 characters.'
            );
        }

        if (!str_starts_with($baseUrl, 'https://')) {
            throw new RuntimeException('Site URL must use HTTPS.');
        }

        otu_dir($root . '/config');
        otu_dir($root . '/storage');

        $cfg = [
            'app_name' => 'OnTrack AI Telephony',
            'base_url' => $baseUrl,
            'admin_password_hash' => password_hash(
                $adminPassword,
                PASSWORD_DEFAULT
            ),
            'session_name' => 'ontrack_agent_session',
            'sqlite_path' => $root . '/storage/app.sqlite',
            'pairing_ttl_minutes' => 10,
            'job_lease_seconds' => 90,
            'timezone' => 'Africa/Cairo',
        ];

        $payload = "<?php\nreturn "
            . var_export($cfg, true)
            . ";\n";

        otu_write($configPath, $payload);
        otu_write($configBackupPath, $payload);

        header('Location: /login.php?next=updates');
        exit;
    } catch (Throwable $e) {
        $error = $e->getMessage();
    }
}
?><!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>OnTrack AI Telephony Setup</title>
<style>
:root{color-scheme:dark;--bg:#090a0c;--p:#14161a;--l:#292d34;--t:#f5f5f6;--m:#9399a3;--r:#e5252a}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--t);font-family:system-ui,-apple-system,Segoe UI,sans-serif;min-height:100vh;display:grid;place-items:center;padding:22px}
.card{width:min(560px,100%);background:var(--p);border:1px solid var(--l);border-radius:20px;padding:26px;box-shadow:0 28px 80px #0008}
.brand{font-weight:900;font-size:22px}.sub{color:var(--m);font-size:13px;margin:4px 0 22px}
.err{padding:12px;border-radius:11px;margin:12px 0;background:#40161a;color:#ffafb2;font-size:13px}
label{display:grid;gap:7px;margin:13px 0;color:#c8ccd2;font-size:12px}
input{width:100%;padding:12px;background:#090b0e;border:1px solid var(--l);border-radius:10px;color:#fff}
button{border:0;border-radius:11px;padding:12px 16px;background:var(--r);color:#fff;font-weight:800;cursor:pointer}
</style>
</head>
<body>
<main class="card">
  <div class="brand">OnTrack Agent Telephony</div>
  <div class="sub">One-time server setup</div>

  <?php if ($error): ?>
    <div class="err"><?=otu_h($error)?></div>
  <?php endif; ?>

  <h2>First setup</h2>
  <p class="sub">
    Create the dashboard admin login. Future website updates will use the
    same admin session — there is no separate updater password.
  </p>

  <form method="post">
    <label>
      Dashboard admin password
      <input
        type="password"
        name="admin_password"
        minlength="8"
        autocomplete="new-password"
        required>
    </label>

    <label>
      Site URL
      <input
        name="base_url"
        value="https://agent.ontrackegy.com"
        required>
    </label>

    <button type="submit">Install & open dashboard</button>
  </form>
</main>
</body>
</html>
