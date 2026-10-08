<?php
require __DIR__ . '/../../app/bootstrap.php';

$device = current_device();
$in = json_input();
$pdo = db();

$sessionId = (int)($in['platform_session_id'] ?? 0);
$token = trim((string)($in['platform_session_token'] ?? ''));
$state = trim((string)($in['state'] ?? ''));
$inputText = trim((string)($in['input_transcript'] ?? ''));
$outputText = trim((string)($in['output_transcript'] ?? ''));
$error = trim((string)($in['error'] ?? ''));

$allowed = ['connected','active','ended','failed'];
if ($sessionId <= 0 || $token === '' || !in_array($state, $allowed, true)) {
    json_response(['ok' => false, 'error' => 'Invalid AI session event'], 422);
}

$stmt = $pdo->prepare(
    "SELECT * FROM ai_sessions
     WHERE id=? AND device_id=?
     LIMIT 1"
);
$stmt->execute([$sessionId, $device['id']]);
$session = $stmt->fetch();

if (!$session || !hash_equals((string)$session['client_token_hash'], hash('sha256', $token))) {
    json_response(['ok' => false, 'error' => 'AI session not found'], 404);
}

$ended = in_array($state, ['ended','failed'], true) ? now_utc() : null;

$pdo->prepare(
    "UPDATE ai_sessions
     SET status=?,
         input_transcript=CASE WHEN ?<>'' THEN COALESCE(input_transcript,'') || ? ELSE input_transcript END,
         output_transcript=CASE WHEN ?<>'' THEN COALESCE(output_transcript,'') || ? ELSE output_transcript END,
         last_error=CASE WHEN ?<>'' THEN ? ELSE last_error END,
         ended_at=COALESCE(?,ended_at)
     WHERE id=?"
)->execute([
    $state,
    $inputText,
    $inputText !== '' ? $inputText . "
" : '',
    $outputText,
    $outputText !== '' ? $outputText . "
" : '',
    $error,
    $error !== '' ? mb_substr($error, 0, 1000) : '',
    $ended,
    $sessionId,
]);

$callId = (int)($session['call_id'] ?? 0);

if ($callId > 0) {
    if ($state === 'connected' || $state === 'active') {
        $pdo->prepare(
            "UPDATE calls
             SET media_status='connected',
                 media_connected_at=COALESCE(media_connected_at,?),
                 media_error=NULL
             WHERE id=? AND device_id=?"
        )->execute([now_utc(), $callId, $device['id']]);

    } elseif ($state === 'failed') {
        $pdo->prepare(
            "UPDATE calls
             SET media_status='failed',
                 media_error=?
             WHERE id=? AND device_id=?"
        )->execute([
            $error !== '' ? mb_substr($error, 0, 500) : 'AI session failed',
            $callId,
            $device['id']
        ]);

    } elseif ($state === 'ended') {
        $pdo->prepare(
            "UPDATE calls
             SET media_status=CASE
                   WHEN media_status IN ('connected','recording') THEN 'disconnected'
                   ELSE media_status
                 END,
                 media_disconnected_at=CASE
                   WHEN media_connected_at IS NOT NULL
                   THEN COALESCE(media_disconnected_at,?)
                   ELSE media_disconnected_at
                 END
             WHERE id=? AND device_id=?"
        )->execute([now_utc(), $callId, $device['id']]);
    }
}

json_response(['ok' => true]);
