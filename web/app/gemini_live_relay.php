<?php
declare(strict_types=1);

/**
 * Minimal outbound Gemini Live WebSocket client for shared hosting.
 *
 * This file is server-side only. Provider credentials and ephemeral provider
 * tokens never leave the OnTrack platform.
 */

function gemini_live_ephemeral_token(
    string $apiKey,
    string $model,
    int $uses = 1
): array {
    $now = new DateTimeImmutable('now', new DateTimeZone('UTC'));
    $expireTime = $now->modify('+30 minutes')->format('Y-m-d\\TH:i:s\\Z');
    $newSessionExpireTime = $now->modify('+2 minutes')->format('Y-m-d\\TH:i:s\\Z');

    $body = [
        'uses' => max(1, $uses),
        'expireTime' => $expireTime,
        'newSessionExpireTime' => $newSessionExpireTime,
        'liveConnectConstraints' => [
            'model' => 'models/' . ltrim($model, '/'),
            'config' => [
                'responseModalities' => ['AUDIO'],
                'sessionResumption' => (object)[],
            ],
        ],
    ];

    $ch = curl_init('https://generativelanguage.googleapis.com/v1beta/auth_tokens');
    curl_setopt_array($ch, [
        CURLOPT_POST => true,
        CURLOPT_POSTFIELDS => json_encode(
            $body,
            JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES
        ),
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_CONNECTTIMEOUT => 8,
        CURLOPT_TIMEOUT => 20,
        CURLOPT_HTTPHEADER => [
            'Content-Type: application/json',
            'x-goog-api-key: ' . $apiKey,
            'User-Agent: OnTrackAgentTelephonyPlatformRelay/0.7.0',
        ],
    ]);

    $raw = curl_exec($ch);
    $http = (int)curl_getinfo($ch, CURLINFO_RESPONSE_CODE);
    $error = curl_error($ch);
    curl_close($ch);

    $data = is_string($raw)
        ? (json_decode($raw, true) ?: [])
        : [];

    if ($raw === false || $http < 200 || $http >= 300) {
        $detail = $error !== ''
            ? $error
            : (string)($data['error']['message'] ?? 'Unable to create Live token');

        throw new RuntimeException(
            'Gemini Live token failed (' . $http . '): ' . $detail
        );
    }

    $token = trim((string)($data['name'] ?? ''));
    if ($token === '') {
        throw new RuntimeException('Gemini Live token response was empty');
    }

    return [
        'token' => $token,
        'expires_at' => $expireTime,
    ];
}

final class GeminiRelayWebSocket {
    /** @var resource|null */
    private $stream = null;

    private string $host = '';
    private string $path = '';

    public function connect(string $baseUrl, string $accessToken): void {
        if ($this->stream !== null) {
            throw new RuntimeException('WebSocket is already connected');
        }

        $parts = parse_url($baseUrl);
        if (!is_array($parts)
            || strtolower((string)($parts['scheme'] ?? '')) !== 'wss'
            || empty($parts['host'])) {
            throw new InvalidArgumentException('Invalid Gemini WebSocket URL');
        }

        $this->host = (string)$parts['host'];
        $port = (int)($parts['port'] ?? 443);

        $path = (string)($parts['path'] ?? '/');
        $query = (string)($parts['query'] ?? '');
        $query .= ($query === '' ? '' : '&')
            . 'access_token=' . rawurlencode($accessToken);

        $this->path = $path . '?' . $query;

        $context = stream_context_create([
            'ssl' => [
                'verify_peer' => true,
                'verify_peer_name' => true,
                'peer_name' => $this->host,
                'SNI_enabled' => true,
            ],
        ]);

        $errno = 0;
        $errstr = '';

        $stream = @stream_socket_client(
            'ssl://' . $this->host . ':' . $port,
            $errno,
            $errstr,
            12,
            STREAM_CLIENT_CONNECT,
            $context
        );

        if (!is_resource($stream)) {
            throw new RuntimeException(
                'Gemini WebSocket TCP/TLS connect failed: '
                . ($errstr !== '' ? $errstr : ('errno ' . $errno))
            );
        }

        stream_set_timeout($stream, 3);
        stream_set_blocking($stream, true);

        $key = base64_encode(random_bytes(16));

        $request =
            "GET {$this->path} HTTP/1.1\r\n"
            . "Host: {$this->host}\r\n"
            . "Upgrade: websocket\r\n"
            . "Connection: Upgrade\r\n"
            . "Sec-WebSocket-Key: {$key}\r\n"
            . "Sec-WebSocket-Version: 13\r\n"
            . "User-Agent: OnTrackAgentTelephonyPlatformRelay/0.7.0\r\n"
            . "\r\n";

        $this->writeAll($stream, $request);

        $status = fgets($stream);
        if (!is_string($status) || !str_contains($status, ' 101 ')) {
            $response = is_string($status) ? trim($status) : 'no response';

            // Drain a small amount of header/body text to make diagnostics useful.
            for ($i = 0; $i < 12; $i++) {
                $line = fgets($stream);
                if (!is_string($line)) break;
                $response .= ' ' . trim($line);
                if (trim($line) === '') break;
            }

            fclose($stream);
            throw new RuntimeException(
                'Gemini WebSocket upgrade failed: ' . $response
            );
        }

        $accept = '';
        while (($line = fgets($stream)) !== false) {
            $trim = trim($line);
            if ($trim === '') break;

            if (stripos($trim, 'Sec-WebSocket-Accept:') === 0) {
                $accept = trim(substr($trim, strlen('Sec-WebSocket-Accept:')));
            }
        }

        $expected = base64_encode(
            sha1($key . '258EAFA5-E914-47DA-95CA-C5AB0DC85B11', true)
        );

        if ($accept !== '' && !hash_equals($expected, $accept)) {
            fclose($stream);
            throw new RuntimeException('Gemini WebSocket handshake checksum mismatch');
        }

        stream_set_blocking($stream, true);
        stream_set_timeout($stream, 2);

        $this->stream = $stream;
    }

    public function sendJson(array $payload): void {
        $json = json_encode(
            $payload,
            JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES
        );

        if (!is_string($json)) {
            throw new RuntimeException('Could not encode Gemini WebSocket payload');
        }

        $this->sendFrame(0x1, $json);
    }

    public function readText(int $timeoutMs = 10): ?string {
        if (!is_resource($this->stream)) {
            throw new RuntimeException('Gemini WebSocket is not connected');
        }

        $frame = $this->readFrame($timeoutMs);
        if ($frame === null) return null;

        if ($frame['opcode'] === 0x8) {
            $reason = trim((string)$frame['payload']);
            throw new RuntimeException(
                'Gemini WebSocket closed'
                . ($reason !== '' ? ': ' . $reason : '')
            );
        }

        if ($frame['opcode'] === 0x9) {
            $this->sendFrame(0xA, (string)$frame['payload']);
            return null;
        }

        if ($frame['opcode'] !== 0x1) {
            return null;
        }

        $message = (string)$frame['payload'];

        if (!empty($frame['fin'])) {
            return $message;
        }

        // Fragmented text message.
        while (true) {
            $next = $this->readFrame(1500);
            if ($next === null) {
                throw new RuntimeException('Timed out reading fragmented Gemini message');
            }

            if ($next['opcode'] === 0x9) {
                $this->sendFrame(0xA, (string)$next['payload']);
                continue;
            }

            if ($next['opcode'] === 0x8) {
                throw new RuntimeException('Gemini WebSocket closed mid-message');
            }

            if ($next['opcode'] !== 0x0) {
                throw new RuntimeException('Unexpected WebSocket continuation opcode');
            }

            $message .= (string)$next['payload'];

            if (!empty($next['fin'])) {
                return $message;
            }
        }
    }

    public function close(): void {
        if (!is_resource($this->stream)) return;

        try {
            $this->sendFrame(0x8, '');
        } catch (Throwable) {
        }

        @fclose($this->stream);
        $this->stream = null;
    }

    private function sendFrame(int $opcode, string $payload): void {
        if (!is_resource($this->stream)) {
            throw new RuntimeException('Gemini WebSocket is not connected');
        }

        $length = strlen($payload);
        $first = chr(0x80 | ($opcode & 0x0F));

        if ($length <= 125) {
            $header = $first . chr(0x80 | $length);
        } elseif ($length <= 65535) {
            $header = $first . chr(0x80 | 126) . pack('n', $length);
        } else {
            $header = $first . chr(0x80 | 127) . pack('J', $length);
        }

        $mask = random_bytes(4);
        $masked = '';

        for ($i = 0; $i < $length; $i++) {
            $masked .= $payload[$i] ^ $mask[$i % 4];
        }

        $this->writeAll($this->stream, $header . $mask . $masked);
    }

    private function readFrame(int $timeoutMs): ?array {
        if (!is_resource($this->stream)) {
            throw new RuntimeException('Gemini WebSocket is not connected');
        }

        $read = [$this->stream];
        $write = [];
        $except = [];

        $seconds = intdiv(max(0, $timeoutMs), 1000);
        $microseconds = (max(0, $timeoutMs) % 1000) * 1000;

        $ready = @stream_select(
            $read,
            $write,
            $except,
            $seconds,
            $microseconds
        );

        if ($ready === false) {
            throw new RuntimeException('Gemini WebSocket select failed');
        }

        if ($ready === 0) return null;

        $head = $this->readExact(2);
        $b1 = ord($head[0]);
        $b2 = ord($head[1]);

        $fin = ($b1 & 0x80) !== 0;
        $opcode = $b1 & 0x0F;
        $masked = ($b2 & 0x80) !== 0;
        $length = $b2 & 0x7F;

        if ($length === 126) {
            $length = unpack('n', $this->readExact(2))[1];
        } elseif ($length === 127) {
            $parts = unpack('N2', $this->readExact(8));
            $length = ((int)$parts[1] << 32) | (int)$parts[2];
        }

        if ($length < 0 || $length > 16 * 1024 * 1024) {
            throw new RuntimeException('Gemini WebSocket frame is too large');
        }

        $mask = $masked ? $this->readExact(4) : '';
        $payload = $length > 0 ? $this->readExact($length) : '';

        if ($masked) {
            $decoded = '';
            for ($i = 0; $i < $length; $i++) {
                $decoded .= $payload[$i] ^ $mask[$i % 4];
            }
            $payload = $decoded;
        }

        return [
            'fin' => $fin,
            'opcode' => $opcode,
            'payload' => $payload,
        ];
    }

    private function readExact(int $length): string {
        if (!is_resource($this->stream)) {
            throw new RuntimeException('Gemini WebSocket is not connected');
        }

        $out = '';

        while (strlen($out) < $length) {
            $chunk = fread($this->stream, $length - strlen($out));

            if ($chunk === false) {
                throw new RuntimeException('Gemini WebSocket read failed');
            }

            if ($chunk === '') {
                $meta = stream_get_meta_data($this->stream);

                if (!empty($meta['timed_out'])) {
                    throw new RuntimeException('Gemini WebSocket read timed out');
                }

                if (!empty($meta['eof'])) {
                    throw new RuntimeException('Gemini WebSocket reached EOF');
                }

                usleep(1000);
                continue;
            }

            $out .= $chunk;
        }

        return $out;
    }

    /** @param resource $stream */
    private function writeAll($stream, string $data): void {
        $offset = 0;
        $length = strlen($data);

        while ($offset < $length) {
            $written = fwrite($stream, substr($data, $offset));

            if ($written === false || $written === 0) {
                throw new RuntimeException('Gemini WebSocket write failed');
            }

            $offset += $written;
        }
    }
}
