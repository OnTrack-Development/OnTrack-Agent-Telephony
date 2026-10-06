<?php
declare(strict_types=1);

const OTUP_REPO_ZIP = 'https://codeload.github.com/OnTrack-Development/OnTrack-Agent-Telephony/zip/refs/heads/main';
const OTUP_REPO_API = 'https://api.github.com/repos/OnTrack-Development/OnTrack-Agent-Telephony/commits/main';

function otup_ensure_dir(string $path): void {
    if (!is_dir($path) && !mkdir($path, 0775, true) && !is_dir($path)) {
        throw new RuntimeException('Cannot create directory: ' . $path);
    }
}

function otup_atomic_write(string $path, string $content): void {
    otup_ensure_dir(dirname($path));
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

function otup_github_get(string $url): string {
    if (!extension_loaded('curl')) {
        throw new RuntimeException('PHP cURL extension is required.');
    }

    $ch = curl_init($url);
    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_FOLLOWLOCATION => true,
        CURLOPT_CONNECTTIMEOUT => 15,
        CURLOPT_TIMEOUT => 120,
        CURLOPT_USERAGENT => 'OnTrack-Agent-Telephony-Admin-Updater/2.0',
        CURLOPT_HTTPHEADER => ['Accept: application/vnd.github+json'],
    ]);

    $body = curl_exec($ch);
    $code = (int) curl_getinfo($ch, CURLINFO_RESPONSE_CODE);
    $err = curl_error($ch);
    curl_close($ch);

    if ($body === false || $code < 200 || $code >= 300) {
        throw new RuntimeException(
            'GitHub request failed' . ($err ? ': ' . $err : ' (HTTP ' . $code . ')')
        );
    }

    return (string) $body;
}

function otup_recursive_delete(string $path): void {
    if (!file_exists($path)) return;

    if (is_file($path) || is_link($path)) {
        @unlink($path);
        return;
    }

    $items = scandir($path);
    if ($items === false) return;

    foreach ($items as $item) {
        if ($item === '.' || $item === '..') continue;
        otup_recursive_delete($path . DIRECTORY_SEPARATOR . $item);
    }

    @rmdir($path);
}

function otup_should_preserve(string $relative): bool {
    $relative = str_replace('\\', '/', ltrim($relative, '/'));

    return in_array($relative, [
        'config/local.php',
        'storage/app.sqlite',
        'storage/app.sqlite-wal',
        'storage/app.sqlite-shm',
        'storage/.ontrack-local.php',
        'storage/.deployed-commit.json',
    ], true);
}

function otup_deploy_tree(string $source, string $target, array &$stats): void {
    $it = new RecursiveIteratorIterator(
        new RecursiveDirectoryIterator($source, FilesystemIterator::SKIP_DOTS),
        RecursiveIteratorIterator::SELF_FIRST
    );

    $sourceLen = strlen(rtrim($source, DIRECTORY_SEPARATOR)) + 1;

    foreach ($it as $item) {
        $full = $item->getPathname();
        $relative = str_replace('\\', '/', substr($full, $sourceLen));

        if (otup_should_preserve($relative)) {
            $stats['preserved']++;
            continue;
        }

        $dest = rtrim($target, DIRECTORY_SEPARATOR)
            . DIRECTORY_SEPARATOR
            . str_replace('/', DIRECTORY_SEPARATOR, $relative);

        if ($item->isDir()) {
            otup_ensure_dir($dest);
            continue;
        }

        otup_ensure_dir(dirname($dest));
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

function otup_latest_commit(): array {
    try {
        $data = json_decode(otup_github_get(OTUP_REPO_API), true);
        if (!is_array($data)) return [];

        return [
            'sha' => (string)($data['sha'] ?? ''),
            'short_sha' => substr((string)($data['sha'] ?? ''), 0, 12),
            'message' => trim((string)($data['commit']['message'] ?? '')),
            'date' => (string)($data['commit']['committer']['date'] ?? ''),
        ];
    } catch (Throwable $e) {
        return [
            'error' => $e->getMessage(),
        ];
    }
}

function otup_deployed_commit(string $root): array {
    $path = rtrim($root, DIRECTORY_SEPARATOR)
        . DIRECTORY_SEPARATOR . 'storage'
        . DIRECTORY_SEPARATOR . '.deployed-commit.json';

    if (!is_file($path)) return [];

    $raw = file_get_contents($path);
    $data = is_string($raw) ? json_decode($raw, true) : null;

    return is_array($data) ? $data : [];
}

function otup_mark_deployed(string $root, array $commit): void {
    $path = rtrim($root, DIRECTORY_SEPARATOR)
        . DIRECTORY_SEPARATOR . 'storage'
        . DIRECTORY_SEPARATOR . '.deployed-commit.json';

    $payload = [
        'sha' => (string)($commit['sha'] ?? ''),
        'short_sha' => (string)($commit['short_sha'] ?? ''),
        'message' => (string)($commit['message'] ?? ''),
        'deployed_at' => gmdate('c'),
    ];

    otup_atomic_write(
        $path,
        json_encode($payload, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES) . "\n"
    );
}

function otup_perform_update(string $root): array {
    if (!class_exists('ZipArchive')) {
        throw new RuntimeException('PHP ZipArchive extension is required.');
    }

    $latest = otup_latest_commit();
    if (empty($latest['sha'])) {
        throw new RuntimeException(
            (string)($latest['error'] ?? 'Could not resolve latest GitHub commit.')
        );
    }

    $tmpBase = rtrim(sys_get_temp_dir(), DIRECTORY_SEPARATOR)
        . DIRECTORY_SEPARATOR . 'ontrack-agent-' . bin2hex(random_bytes(5));

    otup_ensure_dir($tmpBase);

    $zipPath = $tmpBase . DIRECTORY_SEPARATOR . 'repo.zip';
    $extractPath = $tmpBase . DIRECTORY_SEPARATOR . 'extract';
    otup_ensure_dir($extractPath);

    try {
        $zipData = otup_github_get(OTUP_REPO_ZIP);

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

        $dirs = array_values(array_filter(
            scandir($extractPath) ?: [],
            fn($x) => $x !== '.'
                && $x !== '..'
                && is_dir($extractPath . DIRECTORY_SEPARATOR . $x)
        ));

        if (!$dirs) {
            throw new RuntimeException('Could not locate extracted repository.');
        }

        $webSource = $extractPath
            . DIRECTORY_SEPARATOR . $dirs[0]
            . DIRECTORY_SEPARATOR . 'web';

        if (!is_dir($webSource)) {
            throw new RuntimeException('Repository web/ directory was not found.');
        }

        $stats = ['files' => 0, 'preserved' => 0];
        otup_deploy_tree($webSource, $root, $stats);
        otup_mark_deployed($root, $latest);

        return [
            'files' => $stats['files'],
            'preserved' => $stats['preserved'],
            'commit' => $latest,
        ];
    } finally {
        otup_recursive_delete($tmpBase);
    }
}

function otup_status(string $root): array {
    $latest = otup_latest_commit();
    $deployed = otup_deployed_commit($root);

    $latestSha = (string)($latest['sha'] ?? '');
    $deployedSha = (string)($deployed['sha'] ?? '');

    return [
        'latest' => $latest,
        'deployed' => $deployed,
        'update_available' => $latestSha !== ''
            && ($deployedSha === '' || !hash_equals($latestSha, $deployedSha)),
    ];
}
