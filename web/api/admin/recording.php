<?php
require __DIR__ . '/../../app/bootstrap.php';
require_admin_api();

$callId = (int)($_GET['call_id'] ?? 0);

if ($callId <= 0) {
    http_response_code(400);
    exit('Invalid call');
}

$stmt = db()->prepare(
    "SELECT recording_file,recording_status
     FROM calls
     WHERE id=?
     LIMIT 1"
);
$stmt->execute([$callId]);
$row = $stmt->fetch();

if (!$row || ($row['recording_status'] ?? '') !== 'ready') {
    http_response_code(404);
    exit('Recording not found');
}

$path = (string)($row['recording_file'] ?? '');
$real = $path !== '' ? realpath($path) : false;
$base = realpath(__DIR__ . '/../../storage/recordings');

if (!$real || !$base || !str_starts_with($real, $base . DIRECTORY_SEPARATOR) || !is_file($real)) {
    http_response_code(404);
    exit('Recording not found');
}

$size = filesize($real);
if ($size === false) {
    http_response_code(500);
    exit('Recording unavailable');
}

$start = 0;
$end = $size - 1;
$status = 200;

header('Content-Type: audio/wav');
header('Accept-Ranges: bytes');
header('Cache-Control: private, no-store');
header('Content-Disposition: inline; filename="call-' . $callId . '.wav"');

$range = (string)($_SERVER['HTTP_RANGE'] ?? '');

if ($range !== '' && preg_match('/bytes=(\d*)-(\d*)/', $range, $m)) {
    if ($m[1] !== '') $start = max(0, (int)$m[1]);
    if ($m[2] !== '') $end = min($end, (int)$m[2]);

    if ($start > $end || $start >= $size) {
        header('Content-Range: bytes */' . $size);
        http_response_code(416);
        exit;
    }

    $status = 206;
    header('Content-Range: bytes ' . $start . '-' . $end . '/' . $size);
}

$length = $end - $start + 1;

http_response_code($status);
header('Content-Length: ' . $length);

$fp = fopen($real, 'rb');
if (!$fp) {
    http_response_code(500);
    exit;
}

fseek($fp, $start);
$remaining = $length;

while ($remaining > 0 && !feof($fp)) {
    $chunk = fread($fp, min(64 * 1024, $remaining));
    if ($chunk === false || $chunk === '') break;
    echo $chunk;
    $remaining -= strlen($chunk);
    flush();
}

fclose($fp);
exit;
