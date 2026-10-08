package com.ontrack.agentphone;

import android.content.Context;
import android.util.Base64;
import android.util.Log;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.BufferedReader;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.ArrayBlockingQueue;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicBoolean;

/**
 * Phone-side client for the OnTrack platform media relay.
 *
 * The handset never connects to the AI provider. Caller PCM is uploaded to
 * OnTrack, the shared-hosting relay owns the provider WebSocket, and model PCM
 * is pulled back from OnTrack for TELEPHONY_TX injection.
 */
final class PlatformVoiceSession {
    private static final String TAG = "OnTrackPlatformVoice";

    interface Listener {
        void onReady();
        void onModelAudio(byte[] pcm16le, int sampleRate, int channels);
        void onInputTranscript(String text);
        void onOutputTranscript(String text);
        void onInterrupted();
        void onError(Throwable error);
        void onClosed(String reason);
    }

    private static final class AudioChunk {
        final byte[] pcm;
        final int sampleRate;
        final int channels;

        AudioChunk(byte[] pcm, int sampleRate, int channels) {
            this.pcm = pcm;
            this.sampleRate = sampleRate;
            this.channels = channels;
        }
    }

    private final Context context;
    private final JSONObject config;
    private final Listener listener;
    private final ArrayBlockingQueue<AudioChunk> uploadQueue =
            new ArrayBlockingQueue<>(80);

    private final AtomicBoolean failed = new AtomicBoolean(false);
    private final AtomicBoolean readyNotified = new AtomicBoolean(false);

    private volatile boolean started;
    private volatile boolean closed;

    private Thread relayThread;
    private Thread uploadThread;
    private Thread pullThread;

    PlatformVoiceSession(
            Context context,
            JSONObject config,
            Listener listener) {

        this.context = context.getApplicationContext();
        this.config = config;
        this.listener = listener;
    }

    void connect() throws Exception {
        if (started || closed) return;

        if (!AppState.paired(context)) {
            throw new IllegalStateException("Phone is not paired with OnTrack");
        }

        // Validate the session contract before spawning threads.
        config.getInt("platform_session_id");
        config.getString("platform_session_token");

        JSONObject relay = config.optJSONObject("relay");
        if (relay == null
                || relay.optString("run", "").isEmpty()
                || relay.optString("push", "").isEmpty()
                || relay.optString("pull", "").isEmpty()) {
            throw new IllegalStateException("Platform relay endpoints are missing");
        }

        started = true;

        relayThread = new Thread(this::runRelay, "OnTrackPlatformRelay");
        uploadThread = new Thread(this::runUploader, "OnTrackPlatformUpload");
        pullThread = new Thread(this::runPuller, "OnTrackPlatformPull");

        relayThread.start();
        uploadThread.start();
        pullThread.start();
    }

    void sendCallerAudio(
            byte[] pcm16le,
            int sampleRate,
            int channels) {

        if (!started
                || closed
                || pcm16le == null
                || pcm16le.length == 0) {
            return;
        }

        byte[] copy = new byte[pcm16le.length];
        System.arraycopy(pcm16le, 0, copy, 0, pcm16le.length);

        AudioChunk chunk = new AudioChunk(
                copy,
                sampleRate,
                channels);

        if (!uploadQueue.offer(chunk)) {
            // Real-time voice must favor freshness over backlog.
            uploadQueue.poll();
            uploadQueue.offer(chunk);
        }
    }

    void close() {
        if (closed) return;
        closed = true;

        uploadQueue.clear();

        try {
            if (relayThread != null) relayThread.interrupt();
        } catch (Throwable ignored) {}

        try {
            if (uploadThread != null) uploadThread.interrupt();
        } catch (Throwable ignored) {}

        try {
            if (pullThread != null) pullThread.interrupt();
        } catch (Throwable ignored) {}
    }

    private void runRelay() {
        try {
            JSONObject body = sessionCredentials();
            JSONObject relay = config.getJSONObject("relay");

            JSONObject response = postLong(
                    relay.getString("run"),
                    body);

            if (closed) return;

            String state = response.optString("relay", "");

            if ("already_running".equals(state)) {
                return;
            }

            if ("ended".equals(state)) {
                if (listener != null) {
                    listener.onClosed("Platform relay ended");
                }
                return;
            }

            if (!response.optBoolean("ok", true)) {
                throw new IllegalStateException(
                        response.optString(
                                "detail",
                                response.optString(
                                        "error",
                                        "Platform relay failed")));
            }

        } catch (Throwable error) {
            if (!closed) fail(error);
        }
    }

    private void runUploader() {
        while (!closed) {
            try {
                AudioChunk first =
                        uploadQueue.poll(
                                140,
                                TimeUnit.MILLISECONDS);

                if (first == null) {
                    continue;
                }

                List<AudioChunk> batch = new ArrayList<>();
                batch.add(first);
                uploadQueue.drainTo(batch, 4);

                JSONArray frames = new JSONArray();

                for (AudioChunk chunk : batch) {
                    frames.put(
                            new JSONObject()
                                    .put(
                                            "sample_rate",
                                            chunk.sampleRate)
                                    .put(
                                            "channels",
                                            chunk.channels)
                                    .put(
                                            "data",
                                            Base64.encodeToString(
                                                    chunk.pcm,
                                                    Base64.NO_WRAP)));
                }

                JSONObject body = sessionCredentials();
                body.put("frames", frames);

                JSONObject relay = config.getJSONObject("relay");

                ApiClient.post(
                        AppState.server(context),
                        relay.getString("push"),
                        body,
                        AppState.token(context));

            } catch (InterruptedException interrupted) {
                if (closed) return;
            } catch (Throwable error) {
                if (!closed) {
                    fail(error);
                    return;
                }
            }
        }
    }

    private void runPuller() {
        int after = 0;

        while (!closed) {
            try {
                JSONObject body = sessionCredentials();
                body.put("after", after);

                JSONObject relay = config.getJSONObject("relay");

                JSONObject response = ApiClient.post(
                        AppState.server(context),
                        relay.getString("pull"),
                        body,
                        AppState.token(context));

                String status =
                        response.optString(
                                "session_status",
                                "");

                if (("connected".equals(status)
                        || "active".equals(status))
                        && readyNotified.compareAndSet(false, true)) {

                    if (listener != null) {
                        listener.onReady();
                    }
                }

                if ("failed".equals(status)) {
                    throw new IllegalStateException(
                            response.optString(
                                    "last_error",
                                    "Platform AI session failed"));
                }

                if ("ended".equals(status)) {
                    if (!closed && listener != null) {
                        listener.onClosed("Platform AI session ended");
                    }
                    return;
                }

                JSONArray frames = response.optJSONArray("frames");

                if (frames == null) continue;

                for (int i = 0; i < frames.length(); i++) {
                    JSONObject frame = frames.optJSONObject(i);
                    if (frame == null) continue;

                    int id = frame.optInt("id", 0);
                    if (id > after) after = id;

                    String kind = frame.optString("kind", "audio");

                    if ("flush".equals(kind)) {
                        if (listener != null) {
                            listener.onInterrupted();
                        }
                        continue;
                    }

                    if (!"audio".equals(kind)) {
                        continue;
                    }

                    String encoded =
                            frame.optString("data", "");

                    if (encoded.isEmpty()) continue;

                    byte[] pcm = Base64.decode(
                            encoded,
                            Base64.DEFAULT);

                    if (pcm.length == 0) continue;

                    if (listener != null) {
                        listener.onModelAudio(
                                pcm,
                                frame.optInt("sample_rate", 24000),
                                frame.optInt("channels", 1));
                    }
                }

            } catch (Throwable error) {
                if (!closed) {
                    fail(error);
                }
                return;
            }
        }
    }

    private JSONObject sessionCredentials() throws Exception {
        return new JSONObject()
                .put(
                        "platform_session_id",
                        config.getInt("platform_session_id"))
                .put(
                        "platform_session_token",
                        config.getString("platform_session_token"));
    }

    private JSONObject postLong(
            String path,
            JSONObject body) throws Exception {

        String base = AppState.server(context);
        while (base.endsWith("/")) {
            base = base.substring(0, base.length() - 1);
        }

        if (!base.startsWith("https://")) {
            throw new IllegalArgumentException(
                    "Server must use HTTPS");
        }

        HttpURLConnection c =
                (HttpURLConnection)new URL(base + path)
                        .openConnection();

        c.setRequestMethod("POST");
        c.setConnectTimeout(12000);
        c.setReadTimeout(0);
        c.setDoOutput(true);
        c.setRequestProperty("Accept", "application/json");
        c.setRequestProperty(
                "Content-Type",
                "application/json; charset=utf-8");
        c.setRequestProperty(
                "Authorization",
                "Bearer " + AppState.token(context));

        byte[] bytes =
                body.toString()
                        .getBytes(StandardCharsets.UTF_8);

        try (OutputStream out = c.getOutputStream()) {
            out.write(bytes);
            out.flush();
        }

        int code = c.getResponseCode();

        InputStream stream =
                code >= 200 && code < 400
                        ? c.getInputStream()
                        : c.getErrorStream();

        StringBuilder text = new StringBuilder();

        if (stream != null) {
            try (BufferedReader reader =
                         new BufferedReader(
                                 new InputStreamReader(
                                         stream,
                                         StandardCharsets.UTF_8))) {

                String line;
                while ((line = reader.readLine()) != null) {
                    text.append(line);
                }
            }
        }

        JSONObject json =
                text.length() == 0
                        ? new JSONObject()
                        : new JSONObject(text.toString());

        if (code < 200 || code >= 300) {
            String detail =
                    json.optString(
                            "detail",
                            json.optString(
                                    "error",
                                    "HTTP " + code));

            throw new IllegalStateException(detail);
        }

        return json;
    }

    private void fail(Throwable error) {
        if (closed || !failed.compareAndSet(false, true)) {
            return;
        }

        Log.e(TAG, "Platform voice session failed", error);

        if (listener != null) {
            try {
                listener.onError(error);
            } catch (Throwable ignored) {}
        }
    }
}
