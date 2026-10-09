<?php
declare(strict_types=1);
header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store, must-revalidate');
header('X-Content-Type-Options: nosniff');
$metaFile = __DIR__ . '/../../downloads/latest.json';
$raw = is_file($metaFile) ? file_get_contents($metaFile) : false;
$meta = is_string($raw) ? json_decode($raw, true) : null;
if (!is_array($meta)) {
 http_response_code(503);
 echo json_encode(['ok'=>false,'error'=>'No release staged'], JSON_UNESCAPED_SLASHES);
 exit;
}
$filename = (string)($meta['filename'] ?? '');
if ($filename === '' || basename($filename) !== $filename || !preg_match('/^WHMCS-v\d+\.\d+\.\d+-ARM64-release-signed\.apk$/', $filename)) {
 http_response_code(500);
 echo json_encode(['ok'=>false,'error'=>'Invalid release metadata'], JSON_UNESCAPED_SLASHES);
 exit;
}
$apk = __DIR__ . '/../../downloads/' . $filename;
if (!is_file($apk) || (int)filesize($apk) !== (int)($meta['size_bytes'] ?? -1)) {
 http_response_code(503);
 echo json_encode(['ok'=>false,'error'=>'APK not yet available on this host'], JSON_UNESCAPED_SLASHES);
 exit;
}
echo json_encode([
 'ok'=>true,
 'app_id'=>'com.ontrackdevelopment.command',
 'version_name'=>(string)($meta['version_name']??''),
 'version_code'=>(int)($meta['version_code']??0),
 'sha256'=>(string)($meta['sha256']??''),
 'size_bytes'=>(int)($meta['size_bytes']??0),
 'download_url'=>'https://agent.ontrackegy.com/downloads/'.rawurlencode($filename),
 'release_notes'=>(string)($meta['release_notes']??''),
 'signing_certificate_sha256'=>(string)($meta['signing_certificate_sha256']??''),
 'published_at'=>(string)($meta['published_at']??'')
], JSON_UNESCAPED_UNICODE|JSON_UNESCAPED_SLASHES);
