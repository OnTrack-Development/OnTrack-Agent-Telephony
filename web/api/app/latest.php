<?php
require __DIR__ . '/../../app/bootstrap.php';

$metaFile = __DIR__ . '/../../downloads/latest.json';

if (!is_file($metaFile)) {
    json_response(['ok' => false, 'error' => 'No Android release published yet'], 503);
}

$raw = file_get_contents($metaFile);
$meta = is_string($raw) ? json_decode($raw, true) : null;

if (!is_array($meta)) {
    json_response(['ok' => false, 'error' => 'Invalid Android release metadata'], 500);
}

$filename = basename((string)($meta['filename'] ?? ''));
if ($filename === '') {
    json_response(['ok' => false, 'error' => 'Missing Android release filename'], 500);
}

$base = rtrim((string)cfg('site_url', ''), '/');
if ($base === '') {
    $scheme = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') ? 'https' : 'http';
    $host = (string)($_SERVER['HTTP_HOST'] ?? 'agent.ontrackegy.com');
    $base = $scheme . '://' . $host;
}

json_response([
    'ok' => true,
    'version_code' => (int)($meta['version_code'] ?? 0),
    'version_name' => (string)($meta['version_name'] ?? ''),
    'sha256' => strtolower((string)($meta['sha256'] ?? '')),
    'download_url' => $base . '/downloads/' . rawurlencode($filename),
    'size_bytes' => (int)($meta['size_bytes'] ?? 0),
    'published_at' => (string)($meta['published_at'] ?? ''),
    'release_notes' => (string)($meta['release_notes'] ?? ''),
    'signing_certificate_sha256' => (string)($meta['signing_certificate_sha256'] ?? ''),
]);
