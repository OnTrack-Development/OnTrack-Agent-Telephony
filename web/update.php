<?php
declare(strict_types=1);

/**
 * OnTrack Agent Telephony - Shared Hosting GitHub Bridge
 * ------------------------------------------------------
 * One-time upload to public_html/update.php.
 * After setup, this script pulls main from the public GitHub repository and
 * deploys only the web/ directory while preserving local config and SQLite data.
 */

const OT_REPO_ZIP = 'https://codeload.github.com/OnTrack-Development/OnTrack-Agent-Telephony/zip/refs/heads/main';
const OT_REPO_API = 'https://api.github.com/repos/OnTrack-Development/OnTrack-Agent-Telephony/commits/main';

$root = __DIR__;
$configPath = $root . '/config/local.php';
$configBackupPath = $root . '/storage/.ontrack-local.php';

if (session_status() !== PHP_SESSION_ACTIVE) {
    session_name('ontrack_agent_updater');
    session_set_cookie_params([
        'httponly' => true,
        'secure' => (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off'),
        'samesite' => 'Strict',
    ]);
    session_start();
}

function h(string $v): string {
    return htmlspecialchars($v, ENT_QUOTES, 'UTF-8');
}

function ensure_dir(string $path): void {
    if (!is_dir($path) && !mkdir($path, 0775, true) && !is_dir($path)) {
        throw new RuntimeException('Cannot create directory: ' . $path);
    }
}

function atomic_write(string $path, string $content): void {
    ensure_dir(dirname($path));
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

function load_local_config(string $path): array {
    if (!is_file($path)) return [];
    $cfg = require $path;
    return is_array($cfg) ? $cfg : [];
}

function github_get(string $url): string {
    if (!extension_loaded('curl')) {
        throw new RuntimeException('PHP cURL extension is required.');
    }

    $ch = curl_init($url);
    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_FOLLOWLOCATION => true,
        CURLOPT_CONNECTTIMEOUT => 15,
        CURLOPT_TIMEOUT => 90,
        CURLOPT_USERAGENT => 'OnTrack-Agent-Telephony-Updater/1.0',
        CURLOPT_HTTPHEADER => ['Accept: application/vnd.github+json'],
    ]);
    $body = curl_exec($ch);
    $code = (int) curl_getinfo($ch, CURLINFO_RESPONSE_CODE);
    $err = curl_error($ch);
    curl_close($ch);

    if ($body === false || $code < 200 || $code >= 300) {
        throw new RuntimeException('GitHub download failed' . ($err ? ': ' . $err : ' (HTTP ' . $code . ')'));
    }
    return (string) $body;
}

function recursive_delete(string $path): void {
    if (!file_exists($path)) return;
    if (is_file($path) || is_link($path)) {
        @unlink($path);
        return;
    }
    $items = scandir($path);
    if ($items === false) return;
    foreach ($items as $item) {
        if ($item === '.' || $item === '..') continue;
        recursive_delete($path . DIRECTORY_SEPARATOR . $item);
    }
    @rmdir($path);
}

function should_preserve(string $relative): bool {
    $relative = str_replace('\\', '/', ltrim($relative, '/'));
    if ($relative === 'config/local.php') return true;
    if ($relative === 'storage/app.sqlite') return true;
    if ($relative === 'storage/app.sqlite-wal') return true;
    if ($relative === 'storage/app.sqlite-shm') return true;
    if ($relative === 'storage/.ontrack-local.php') return true;
    return false;
}

function deploy_tree(string $source, string $target, array &$stats): void {
    $it = new RecursiveIteratorIterator(
        new RecursiveDirectoryIterator($source, FilesystemIterator::SKIP_DOTS),
        RecursiveIteratorIterator::SELF_FIRST
    );

    $sourceLen = strlen(rtrim($source, DIRECTORY_SEPARATOR)) + 1;

    foreach ($it as $item) {
        $full = $item->getPathname();
        $relative = substr($full, $sourceLen);
        $relative = str_replace('\\', '/', $relative);

        if (should_preserve($relative)) {
            $stats['preserved']++;
            continue;
        }

        $dest = rtrim($target, DIRECTORY_SEPARATOR) . DIRECTORY_SEPARATOR . str_replace('/', DIRECTORY_SEPARATOR, $relative);

        if ($item->isDir()) {
            ensure_dir($dest);
            continue;
        }

        ensure_dir(dirname($dest));
        $tmp = $dest . '.ot-new-' . bin2hex(random_bytes(3));

        if (!copy($full, $tmp)) {
            @unlink($tmp);
            throw new RuntimeException('Failed to copy ' . $relative);
        }

        @chmod($tmp, 0644);
        if (!rename($tmp, $dest)) {
            @unlink($tmp);
            throw new RuntimeException('Failed to replace ' . $relative);
        }

        $stats['files']++;
    }
}

function latest_commit(): array {
    try {
        $data = json_decode(github_get(OT_REPO_API), true);
        if (!is_array($data)) return [];
        return [
            'sha' => substr((string)($data['sha'] ?? ''), 0, 12),
            'message' => trim((string)($data['commit']['message'] ?? '')),
            'date' => (string)($data['commit']['committer']['date'] ?? ''),
        ];
    } catch (Throwable) {
        return [];
    }
}

function perform_update(string $root): array {
    if (!class_exists('ZipArchive')) {
        throw new RuntimeException('PHP ZipArchive extension is required.');
    }

    $tmpBase = rtrim(sys_get_temp_dir(), DIRECTORY_SEPARATOR) . DIRECTORY_SEPARATOR . 'ontrack-agent-' . bin2hex(random_bytes(5));
    ensure_dir($tmpBase);

    $zipPath = $tmpBase . DIRECTORY_SEPARATOR . 'repo.zip';
    $extractPath = $tmpBase . DIRECTORY_SEPARATOR . 'extract';
    ensure_dir($extractPath);

    try {
        $zipData = github_get(OT_REPO_ZIP);
        if (file_put_contents($zipPath, $zipData, LOCK_EX) === false) {
            throw new RuntimeException('Could not save downloaded repository archive.');
        }

        $zip = new ZipArchive();
        if ($zip->open($zipPath) !== true) {
            throw new RuntimeException('Downloaded repository archive is invalid.');
        }
        if (!$zip->extractTo($extractPath)) {
            $zip->close();
            throw new RuntimeException('Could not extract repository archive.');
        }
        $zip->close();

        $dirs = array_values(array_filter(scandir($extractPath) ?: [], fn($x) => $x !== '.' && $x !== '..' && is_dir($extractPath . DIRECTORY_SEPARATOR . $x)));
        if (!$dirs) throw new RuntimeException('Could not locate extracted repository.');

        $webSource = $extractPath . DIRECTORY_SEPARATOR . $dirs[0] . DIRECTORY_SEPARATOR . 'web';
        if (!is_dir($webSource)) throw new RuntimeException('Repository web/ directory was not found.');

        $stats = ['files' => 0, 'preserved' => 0];
        deploy_tree($webSource, $root, $stats);

        // Force bootstrap once so schema migrations run immediately after deployment.
        $health = $root . '/api/health.php';
        if (is_file($health)) {
            clearstatcache(true, $health);
        }

        $commit = latest_commit();
        return [
            'files' => $stats['files'],
            'preserved' => $stats['preserved'],
            'commit' => $commit,
        ];
    } finally {
        recursive_delete($tmpBase);
    }
}

$message = '';
$error = '';
$config = load_local_config($configPath);

if (!$config) {
    if ($_SERVER['REQUEST_METHOD'] === 'POST' && ($_POST['action'] ?? '') === 'install') {
        try {
            $adminPassword = (string)($_POST['admin_password'] ?? '');
            $updatePassword = (string)($_POST['update_password'] ?? '');
            $baseUrl = rtrim((string)($_POST['base_url'] ?? 'https://agent.ontrackegy.com'), '/');

            if (strlen($adminPassword) < 8) throw new RuntimeException('Dashboard password must be at least 8 characters.');
            if (strlen($updatePassword) < 8) throw new RuntimeException('Updater password must be at least 8 characters.');
            if (!str_starts_with($baseUrl, 'https://')) throw new RuntimeException('Base URL must use HTTPS.');

            ensure_dir($root . '/config');
            ensure_dir($root . '/storage');

            $cfg = [
                'app_name' => 'OnTrack AI Telephony',
                'base_url' => $baseUrl,
                'admin_password_hash' => password_hash($adminPassword, PASSWORD_DEFAULT),
                'update_password_hash' => password_hash($updatePassword, PASSWORD_DEFAULT),
                'session_name' => 'ontrack_agent_session',
                'sqlite_path' => $root . '/storage/app.sqlite',
                'pairing_ttl_minutes' => 10,
                'job_lease_seconds' => 90,
            ];

            $configPayload = "<?php\nreturn " . var_export($cfg, true) . ";\n";
            atomic_write($configPath, $configPayload);
            atomic_write($configBackupPath, $configPayload);
            $config = $cfg;
            session_regenerate_id(true);
            $_SESSION['updater_ok'] = true;
            $message = 'Setup completed. You can deploy from GitHub now.';
        } catch (Throwable $e) {
            $error = $e->getMessage();
        }
    }
} else {
    if (($_GET['logout'] ?? '') === '1') {
        unset($_SESSION['updater_ok']);
        header('Location: update.php');
        exit;
    }

    if ($_SERVER['REQUEST_METHOD'] === 'POST' && ($_POST['action'] ?? '') === 'login') {
        $password = (string)($_POST['password'] ?? '');
        $hash = (string)($config['update_password_hash'] ?? '');
        if ($hash !== '' && password_verify($password, $hash)) {
            session_regenerate_id(true);
            $_SESSION['updater_ok'] = true;
        } else {
            $error = 'Incorrect updater password.';
        }
    }
}

$authenticated = !empty($_SESSION['updater_ok']);

if ($config && $authenticated && $_SERVER['REQUEST_METHOD'] === 'POST' && ($_POST['action'] ?? '') === 'update') {
    try {
        $result = perform_update($root);

        if (is_file($configPath)) {
            $localPayload = file_get_contents($configPath);
            if ($localPayload !== false) {
                atomic_write($configBackupPath, $localPayload);
            }
        } elseif (is_file($configBackupPath)) {
            $backupPayload = file_get_contents($configBackupPath);
            if ($backupPayload !== false) {
                atomic_write($configPath, $backupPayload);
            }
        }

        $commit = $result['commit'];
        $message = 'Update completed: ' . $result['files'] . ' files deployed.';
        if (!empty($commit['sha'])) $message .= ' Commit ' . $commit['sha'] . '.';
        $config = load_local_config($configPath);
    } catch (Throwable $e) {
        $error = $e->getMessage();
    }
}

$commit = $authenticated ? latest_commit() : [];
?>
<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>OnTrack Agent Telephony Updater</title>
<style>
:root{color-scheme:dark;--bg:#090a0c;--p:#14161a;--l:#292d34;--t:#f5f5f6;--m:#9399a3;--r:#e5252a;--g:#30c48d}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--t);font-family:system-ui,-apple-system,Segoe UI,sans-serif;min-height:100vh;display:grid;place-items:center;padding:22px}
.card{width:min(560px,100%);background:var(--p);border:1px solid var(--l);border-radius:20px;padding:26px;box-shadow:0 28px 80px #0008}
.brand{font-weight:900;font-size:22px}.sub{color:var(--m);font-size:13px;margin:4px 0 22px}.ok,.err{padding:12px;border-radius:11px;margin:12px 0;font-size:13px}.ok{background:#11372b;color:#8ce8c2}.err{background:#40161a;color:#ffafb2}
label{display:grid;gap:7px;margin:13px 0;color:#c8ccd2;font-size:12px}input{width:100%;padding:12px;background:#090b0e;border:1px solid var(--l);border-radius:10px;color:#fff}
button,.btn{display:inline-block;border:0;border-radius:11px;padding:12px 16px;background:var(--r);color:#fff;font-weight:800;cursor:pointer;text-decoration:none}.secondary{background:#252930}
.row{display:flex;gap:9px;align-items:center;flex-wrap:wrap}.meta{border:1px solid var(--l);border-radius:13px;padding:14px;margin:16px 0;color:var(--m);font-size:12px;line-height:1.7}.meta b{color:#fff}
</style>
</head>
<body><main class="card">
<div class="brand">OnTrack Agent Telephony</div>
<div class="sub">Shared Hosting GitHub Bridge</div>

<?php if ($message): ?><div class="ok"><?=h($message)?></div><?php endif; ?>
<?php if ($error): ?><div class="err"><?=h($error)?></div><?php endif; ?>

<?php if (!$config): ?>
<h2>First setup</h2>
<p class="sub">This creates the local server-only config. Nothing secret is committed to GitHub.</p>
<form method="post">
<input type="hidden" name="action" value="install">
<label>Dashboard admin password<input type="password" name="admin_password" minlength="8" required></label>
<label>Updater password<input type="password" name="update_password" minlength="8" required></label>
<label>Site URL<input name="base_url" value="https://agent.ontrackegy.com" required></label>
<button type="submit">Install & configure</button>
</form>

<?php elseif (!$authenticated): ?>
<h2>Updater login</h2>
<form method="post">
<input type="hidden" name="action" value="login">
<label>Updater password<input type="password" name="password" required autofocus></label>
<button type="submit">Open updater</button>
</form>

<?php else: ?>
<div class="meta">
<b>Repository:</b> OnTrack-Development/OnTrack-Agent-Telephony<br>
<b>Branch:</b> main<br>
<b>Target:</b> <?=h($root)?><br>
<?php if (!empty($commit['sha'])): ?><b>Latest commit:</b> <?=h($commit['sha'])?><br><?php endif; ?>
<?php if (!empty($commit['message'])): ?><b>Message:</b> <?=h($commit['message'])?><br><?php endif; ?>
<b>Preserved:</b> config/local.php + SQLite database
</div>
<form method="post" onsubmit="this.querySelector('button').disabled=true;this.querySelector('button').textContent='Updating…';">
<input type="hidden" name="action" value="update">
<div class="row">
<button type="submit">Update from GitHub</button>
<a class="btn secondary" href="./">Open dashboard</a>
<a class="btn secondary" href="?logout=1">Logout</a>
</div>
</form>
<?php endif; ?>
</main></body>
</html>
