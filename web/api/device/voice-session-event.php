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

json_response(['ok' => true]);
