<?php
require __DIR__ . '/../../app/bootstrap.php';
require __DIR__ . '/../../app/voice_session_auth.php';
require __DIR__ . '/../../app/gemini_live_relay.php';

ignore_user_abort(true);
@set_time_limit(0);

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
        'error' => 'Platform AI session is already closed'
    ], 409);
}

$lockDir = __DIR__ . '/../../storage/relay-locks';
if (!is_dir($lockDir)) @mkdir($lockDir, 0775, true);

$lockPath = $lockDir . '/session-' . $sessionId . '.lock';
$lock = fopen($lockPath, 'c+');

if (!$lock || !flock($lock, LOCK_EX | LOCK_NB)) {
    if (is_resource($lock)) fclose($lock);

    json_response([
        'ok' => true,
        'relay' => 'already_running',
        'platform_session_id' => $sessionId,
    ]);
}

$pdo = db();
$ws = null;
$lastInputId = 0;
$connected = false;
$startedAt = microtime(true);

try {
    $apiKey = setting_value('gemini_api_key', '');
    if ($apiKey === '') {
        throw new RuntimeException('Gemini API key is not configured');
    }

    $model = trim((string)($session['agent_model'] ?? $session['model'] ?? ''));
    $voice = trim((string)($session['agent_voice'] ?? $session['voice_name'] ?? 'Puck'));

    if ($model === '') {
        throw new RuntimeException('Assigned Voice Agent has no Live model');
    }

    $pdo->prepare(
        "UPDATE ai_sessions
         SET status='connecting',last_error=NULL
         WHERE id=?"
    )->execute([$sessionId]);

    $token = gemini_live_ephemeral_token(
        $apiKey,
        $model,
        1
    );

    $ws = new GeminiRelayWebSocket();
    $ws->connect(
        'wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContentConstrained',
        (string)$token['token']
    );

    $systemInstruction =
        trim((string)($session['system_prompt'] ?? ''))
        . platform_call_context($session);

    $generationConfig = [
        'responseModalities' => ['AUDIO'],
    ];

    if ($voice !== '') {
        $generationConfig['speechConfig'] = [
            'voiceConfig' => [
                'prebuiltVoiceConfig' => [
                    'voiceName' => $voice,
                ],
            ],
        ];
    }

    $ws->sendJson([
        'setup' => [
            'model' => 'models/' . ltrim($model, '/'),
            'generationConfig' => $generationConfig,
            'systemInstruction' => [
                'parts' => [
                    ['text' => $systemInstruction],
                ],
            ],
            'inputAudioTranscription' => (object)[],
            'outputAudioTranscription' => (object)[],
        ],
    ]);

    $openingSent = false;
    $direction = (string)($session['direction'] ?? 'inbound');
    $lastStatusCheck = 0.0;

    while (true) {
        // 1) Send queued caller PCM to Gemini.
        if ($connected) {
            $inputStmt = $pdo->prepare(
                "SELECT id,sample_rate,channels,pcm
                 FROM ai_media_in
                 WHERE session_id=? AND id>?
                 ORDER BY id ASC
                 LIMIT 20"
            );
            $inputStmt->execute([$sessionId, $lastInputId]);
            $inputRows = $inputStmt->fetchAll();

            foreach ($inputRows as $row) {
                $pcm = $row['pcm'];
                if (!is_string($pcm) || $pcm === '') {
                    $lastInputId = max($lastInputId, (int)$row['id']);
                    continue;
                }

                $sampleRate = (int)($row['sample_rate'] ?? 16000);

                $ws->sendJson([
                    'realtimeInput' => [
                        'audio' => [
                            'data' => base64_encode($pcm),
                            'mimeType' => 'audio/pcm;rate=' . $sampleRate,
                        ],
                    ],
                ]);

                $lastInputId = (int)$row['id'];
            }

            if ($lastInputId > 0) {
                $deleteIn = $pdo->prepare(
                    "DELETE FROM ai_media_in
                     WHERE session_id=? AND id<=?"
                );
                $deleteIn->execute([$sessionId, $lastInputId]);
            }
        }

        // 2) Receive model events/audio without blocking the queue loop.
        for ($i = 0; $i < 8; $i++) {
            $text = $ws->readText(8);
            if ($text === null) break;

            $message = json_decode($text, true);
            if (!is_array($message)) continue;

            if (array_key_exists('setupComplete', $message)) {
                if (!$connected) {
                    $connected = true;

                    $now = now_utc();

                    $pdo->prepare(
                        "UPDATE ai_sessions
                         SET status='connected',
                             started_at=COALESCE(started_at,?),
                             last_error=NULL
                         WHERE id=?"
                    )->execute([$now, $sessionId]);

                    $pdo->prepare(
                        "UPDATE calls
                         SET media_status='connected',
                             media_connected_at=COALESCE(media_connected_at,?),
                             media_error=NULL
                         WHERE id=? AND device_id=?"
                    )->execute([
                        $now,
                        (int)$session['call_id'],
                        (int)$device['id']
                    ]);
                }

                if (!$openingSent && $direction === 'inbound') {
                    $openingSent = true;

                    $ws->sendJson([
                        'realtimeInput' => [
                            'text' => 'ابدأ المكالمة الآن بتحية قصيرة وطبيعية حسب شخصيتك ودورك، ثم توقف واسمع العميل.',
                        ],
                    ]);
                }

                continue;
            }

            $content = $message['serverContent'] ?? null;
            if (!is_array($content)) continue;

            if (!empty($content['interrupted'])) {
                $pdo->prepare(
                    "INSERT INTO ai_media_out(
                        session_id,kind,sample_rate,channels,pcm,created_at
                     ) VALUES(?,'flush',NULL,NULL,NULL,?)"
                )->execute([$sessionId, now_utc()]);
            }

            $inputTranscript = trim((string)(
                $content['inputTranscription']['text'] ?? ''
            ));

            $outputTranscript = trim((string)(
                $content['outputTranscription']['text'] ?? ''
            ));

            if ($inputTranscript !== '' || $outputTranscript !== '') {
                $pdo->prepare(
                    "UPDATE ai_sessions
                     SET status='active',
                         input_transcript=CASE
                           WHEN ?<>'' THEN COALESCE(input_transcript,'') || ?
                           ELSE input_transcript END,
                         output_transcript=CASE
                           WHEN ?<>'' THEN COALESCE(output_transcript,'') || ?
                           ELSE output_transcript END
                     WHERE id=?"
                )->execute([
                    $inputTranscript,
                    $inputTranscript !== '' ? $inputTranscript . "\n" : '',
                    $outputTranscript,
                    $outputTranscript !== '' ? $outputTranscript . "\n" : '',
                    $sessionId,
                ]);
            }

            $parts = $content['modelTurn']['parts'] ?? null;
            if (!is_array($parts)) continue;

            foreach ($parts as $part) {
                if (!is_array($part)) continue;

                $inline = $part['inlineData'] ?? null;
                if (!is_array($inline)) continue;

                $mime = (string)($inline['mimeType'] ?? 'audio/pcm;rate=24000');
                if (!str_starts_with($mime, 'audio/pcm')) continue;

                $encoded = (string)($inline['data'] ?? '');
                if ($encoded === '') continue;

                $pcm = base64_decode($encoded, true);
                if (!is_string($pcm) || $pcm === '') continue;

                $rate = 24000;
                if (preg_match('/rate=([0-9]+)/', $mime, $m)) {
                    $rate = max(8000, min(192000, (int)$m[1]));
                }

                $pdo->prepare(
                    "INSERT INTO ai_media_out(
                        session_id,kind,sample_rate,channels,pcm,created_at
                     ) VALUES(?,'audio',?,1,?,?)"
                )->execute([
                    $sessionId,
                    $rate,
                    $pcm,
                    now_utc(),
                ]);
            }
        }

        // 3) Keep output queue bounded if the handset stops polling.
        $pdo->prepare(
            "DELETE FROM ai_media_out
             WHERE session_id=?
               AND id NOT IN (
                 SELECT id FROM ai_media_out
                 WHERE session_id=?
                 ORDER BY id DESC
                 LIMIT 160
               )"
        )->execute([$sessionId, $sessionId]);

        // 4) Stop when the call/session is ended by the handset/platform.
        $nowFloat = microtime(true);
        if (($nowFloat - $lastStatusCheck) >= 0.5) {
            $lastStatusCheck = $nowFloat;

            $stateStmt = $pdo->prepare(
                "SELECT s.status,c.ended_at
                 FROM ai_sessions s
                 JOIN calls c ON c.id=s.call_id
                 WHERE s.id=? AND s.device_id=?
                 LIMIT 1"
            );
            $stateStmt->execute([$sessionId, $device['id']]);
            $state = $stateStmt->fetch() ?: [];

            if (in_array(
                (string)($state['status'] ?? ''),
                ['ended','failed'],
                true
            ) || !empty($state['ended_at'])) {
                break;
            }
        }

        usleep(10000);
    }

    try {
        if ($connected) {
            $ws->sendJson([
                'realtimeInput' => [
                    'audioStreamEnd' => true,
                ],
            ]);
        }
    } catch (Throwable) {
    }

    $ws->close();

    $ended = now_utc();

    $pdo->prepare(
        "UPDATE ai_sessions
         SET status=CASE WHEN status='failed' THEN status ELSE 'ended' END,
             ended_at=COALESCE(ended_at,?)
         WHERE id=?"
    )->execute([$ended, $sessionId]);

    json_response([
        'ok' => true,
        'relay' => 'ended',
        'platform_session_id' => $sessionId,
        'connected' => $connected,
        'runtime_seconds' => round(microtime(true) - $startedAt, 3),
    ]);

} catch (Throwable $error) {
    $message = $error->getMessage();
    if ($message === '') $message = get_class($error);

    $message = mb_substr($message, 0, 1000);
    $ended = now_utc();

    try {
        if ($ws instanceof GeminiRelayWebSocket) {
            $ws->close();
        }
    } catch (Throwable) {
    }

    $pdo->prepare(
        "UPDATE ai_sessions
         SET status='failed',
             last_error=?,
             ended_at=COALESCE(ended_at,?)
         WHERE id=?"
    )->execute([$message, $ended, $sessionId]);

    $pdo->prepare(
        "UPDATE calls
         SET media_status='failed',
             media_error=?,
             media_disconnected_at=COALESCE(media_disconnected_at,?)
         WHERE id=? AND device_id=?"
    )->execute([
        mb_substr($message, 0, 500),
        $ended,
        (int)$session['call_id'],
        (int)$device['id'],
    ]);

    json_response([
        'ok' => false,
        'error' => 'platform_relay_failed',
        'detail' => $message,
    ], 502);

} finally {
    if (is_resource($lock)) {
        @flock($lock, LOCK_UN);
        @fclose($lock);
    }
}
