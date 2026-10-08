<?php
require __DIR__ . '/../../app/bootstrap.php';
require __DIR__ . '/../../app/voice_session_auth.php';

$device = current_device();
$in = json_input();

$sessionId = (int)($in['platform_session_id'] ?? 0);
$sessionToken = trim((string)($in['platform_session_token'] ?? ''));

$session = require_device_ai_session(
    $device,
    $sessionId,
    $sessionToken
);

if (in_array((string)$session['status'], ['ended','failed'], true)) {
    json_response([
        'ok' => false,
        'error' => 'Platform AI session is closed'
    ], 409);
}

$frames = $in['frames'] ?? null;

if (!is_array($frames)) {
    $frames = [[
        'sample_rate' => (int)($in['sample_rate'] ?? 0),
        'channels' => (int)($in['channels'] ?? 0),
        'data' => (string)($in['data'] ?? ''),
    ]];
}

if (count($frames) < 1 || count($frames) > 10) {
    json_response(['ok' => false, 'error' => 'Invalid media frame batch'], 422);
}

$pdo = db();
$insert = $pdo->prepare(
    "INSERT INTO ai_media_in(
        session_id,sample_rate,channels,pcm,created_at
     ) VALUES(?,?,?,?,?)"
);

$accepted = 0;

$pdo->beginTransaction();

try {
    foreach ($frames as $frame) {
        if (!is_array($frame)) continue;

        $sampleRate = (int)($frame['sample_rate'] ?? 0);
        $channels = (int)($frame['channels'] ?? 0);
        $encoded = (string)($frame['data'] ?? '');

        if ($sampleRate < 8000 || $sampleRate > 192000
            || $channels < 1 || $channels > 2
            || $encoded === '') {
            continue;
        }

        $pcm = base64_decode($encoded, true);

        if (!is_string($pcm)
            || $pcm === ''
            || strlen($pcm) > 512 * 1024
            || (strlen($pcm) % 2) !== 0) {
            continue;
        }

        $insert->execute([
            $sessionId,
            $sampleRate,
            $channels,
            $pcm,
            now_utc(),
        ]);

        $accepted++;
    }

    // Keep the live queue bounded if the upstream worker stalls.
    $trim = $pdo->prepare(
        "DELETE FROM ai_media_in
         WHERE session_id=?
           AND id NOT IN (
             SELECT id FROM ai_media_in
             WHERE session_id=?
             ORDER BY id DESC
             LIMIT 120
           )"
    );
    $trim->execute([$sessionId, $sessionId]);

    $pdo->commit();

} catch (Throwable $error) {
    if ($pdo->inTransaction()) $pdo->rollBack();
    throw $error;
}

if ($accepted <= 0) {
    json_response(['ok' => false, 'error' => 'No valid PCM frames'], 422);
}

json_response([
    'ok' => true,
    'accepted' => $accepted,
    'session_status' => (string)$session['status'],
]);
