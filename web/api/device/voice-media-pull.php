<?php
require __DIR__ . '/../../app/bootstrap.php';
require __DIR__ . '/../../app/voice_session_auth.php';

$device = current_device();
$in = json_input();

$sessionId = (int)($in['platform_session_id'] ?? 0);
$sessionToken = trim((string)($in['platform_session_token'] ?? ''));
$after = max(0, (int)($in['after'] ?? 0));

$session = require_device_ai_session(
    $device,
    $sessionId,
    $sessionToken
);

$pdo = db();

// Rows acknowledged by the handset can be discarded immediately.
if ($after > 0) {
    $delete = $pdo->prepare(
        "DELETE FROM ai_media_out
         WHERE session_id=? AND id<=?"
    );
    $delete->execute([$sessionId, $after]);
}

$rows = [];
$deadline = microtime(true) + 0.85;

do {
    $stmt = $pdo->prepare(
        "SELECT id,kind,sample_rate,channels,pcm
         FROM ai_media_out
         WHERE session_id=? AND id>?
         ORDER BY id ASC
         LIMIT 12"
    );
    $stmt->execute([$sessionId, $after]);
    $rows = $stmt->fetchAll();

    if ($rows) break;

    $statusStmt = $pdo->prepare(
        "SELECT status,last_error
         FROM ai_sessions
         WHERE id=? AND device_id=?
         LIMIT 1"
    );
    $statusStmt->execute([$sessionId, $device['id']]);
    $liveState = $statusStmt->fetch() ?: [];

    if (in_array(
        (string)($liveState['status'] ?? ''),
        ['ended','failed'],
        true
    )) {
        break;
    }

    usleep(50000);
} while (microtime(true) < $deadline);

$out = [];

foreach ($rows as $row) {
    $kind = (string)($row['kind'] ?? 'audio');

    $item = [
        'id' => (int)$row['id'],
        'kind' => $kind,
    ];

    if ($kind === 'audio') {
        $pcm = $row['pcm'];

        if (!is_string($pcm)) $pcm = '';

        $item['sample_rate'] = (int)($row['sample_rate'] ?? 24000);
        $item['channels'] = (int)($row['channels'] ?? 1);
        $item['data'] = base64_encode($pcm);
    }

    $out[] = $item;
}

$statusStmt = $pdo->prepare(
    "SELECT status,last_error
     FROM ai_sessions
     WHERE id=? AND device_id=?
     LIMIT 1"
);
$statusStmt->execute([$sessionId, $device['id']]);
$current = $statusStmt->fetch() ?: [];

json_response([
    'ok' => true,
    'frames' => $out,
    'session_status' => (string)($current['status'] ?? $session['status']),
    'last_error' => (string)($current['last_error'] ?? ''),
]);
