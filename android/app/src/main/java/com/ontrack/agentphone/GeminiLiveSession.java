package com.ontrack.agentphone;

import android.util.Base64;
import android.util.Log;

import org.json.JSONArray;
import org.json.JSONObject;

import java.util.concurrent.TimeUnit;

import okhttp3.HttpUrl;
import okhttp3.OkHttpClient;
import okhttp3.Request;
import okhttp3.Response;
import okhttp3.WebSocket;
import okhttp3.WebSocketListener;

/**
 * Client-side Live API session authenticated only with a short-lived token
 * provisioned by the OnTrack platform.
 *
 * The permanent provider API key never reaches the handset.
 */
final class GeminiLiveSession {
    private static final String TAG = "OnTrackGeminiLive";

    interface Listener {
        void onReady();
        void onModelAudio(byte[] pcm16le, int sampleRate, int channels);
        void onInputTranscript(String text);
        void onOutputTranscript(String text);
        void onInterrupted();
        void onError(Throwable error);
        void onClosed(String reason);
    }

    private final JSONObject config;
    private final Listener listener;
    private final OkHttpClient client;

    private volatile WebSocket socket;
    private volatile boolean setupComplete;
    private volatile boolean closed;

    GeminiLiveSession(JSONObject config, Listener listener) {
        this.config = config;
        this.listener = listener;
        this.client = new OkHttpClient.Builder()
                .connectTimeout(12, TimeUnit.SECONDS)
                .readTimeout(0, TimeUnit.SECONDS)
                .writeTimeout(20, TimeUnit.SECONDS)
                .pingInterval(20, TimeUnit.SECONDS)
                .build();
    }

    void connect() throws Exception {
        String token = config.getString("token");
        String base = config.getString("websocket_url");

        HttpUrl parsed = HttpUrl.parse(base);
        if (parsed == null) {
            throw new IllegalArgumentException("Invalid Live API WebSocket URL");
        }

        HttpUrl url = parsed.newBuilder()
                .addQueryParameter("access_token", token)
                .build();

        Request request = new Request.Builder()
                .url(url)
                .build();

        socket = client.newWebSocket(
                request,
                new WebSocketListener() {
                    @Override public void onOpen(
                            WebSocket webSocket,
                            Response response) {
                        try {
                            webSocket.send(buildSetup().toString());
                        } catch (Throwable error) {
                            fail(error);
                        }
                    }

                    @Override public void onMessage(
                            WebSocket webSocket,
                            String text) {
                        try {
                            handleMessage(text);
                        } catch (Throwable error) {
                            fail(error);
                        }
                    }

                    @Override public void onFailure(
                            WebSocket webSocket,
                            Throwable t,
                            Response response) {
                        fail(t);
                    }

                    @Override public void onClosed(
                            WebSocket webSocket,
                            int code,
                            String reason) {
                        closed = true;

                        if (listener != null) {
                            try {
                                listener.onClosed(reason == null ? "" : reason);
                            } catch (Throwable ignored) {}
                        }
                    }
                });
    }

    private JSONObject buildSetup() throws Exception {
        JSONObject generation = new JSONObject();
        generation.put(
                "responseModalities",
                new JSONArray().put("AUDIO"));

        String voice = config.optString("voice_name", "Puck");
        if (!voice.isEmpty()) {
            JSONObject prebuilt = new JSONObject()
                    .put("voiceName", voice);

            JSONObject voiceConfig = new JSONObject()
                    .put("prebuiltVoiceConfig", prebuilt);

            generation.put(
                    "speechConfig",
                    new JSONObject().put(
                            "voiceConfig",
                            voiceConfig));
        }

        JSONObject instruction = new JSONObject()
                .put(
                        "parts",
                        new JSONArray().put(
                                new JSONObject().put(
                                        "text",
                                        config.optString(
                                                "system_instruction",
                                                ""))));

        JSONObject setup = new JSONObject()
                .put(
                        "model",
                        "models/" + config.getString("model"))
                .put("generationConfig", generation)
                .put("systemInstruction", instruction)
                .put("inputAudioTranscription", new JSONObject())
                .put("outputAudioTranscription", new JSONObject());

        return new JSONObject().put("setup", setup);
    }

    private void handleMessage(String text) throws Exception {
        if (closed) return;

        JSONObject message = new JSONObject(text);

        if (message.has("setupComplete")) {
            setupComplete = true;

            if (listener != null) {
                listener.onReady();
            }

            String opening = config.optString("opening_text", "");
            if (!opening.trim().isEmpty()) {
                sendText(opening);
            }

            return;
        }

        JSONObject content = message.optJSONObject("serverContent");
        if (content == null) return;

        if (content.optBoolean("interrupted", false)) {
            if (listener != null) listener.onInterrupted();
        }

        JSONObject inputTranscript =
                content.optJSONObject("inputTranscription");

        if (inputTranscript != null && listener != null) {
            String value =
                    inputTranscript.optString("text", "").trim();

            if (!value.isEmpty()) {
                listener.onInputTranscript(value);
            }
        }

        JSONObject outputTranscript =
                content.optJSONObject("outputTranscription");

        if (outputTranscript != null && listener != null) {
            String value =
                    outputTranscript.optString("text", "").trim();

            if (!value.isEmpty()) {
                listener.onOutputTranscript(value);
            }
        }

        JSONObject turn = content.optJSONObject("modelTurn");
        JSONArray parts = turn == null
                ? null
                : turn.optJSONArray("parts");

        if (parts == null) return;

        for (int i = 0; i < parts.length(); i++) {
            JSONObject part = parts.optJSONObject(i);
            if (part == null) continue;

            JSONObject inline = part.optJSONObject("inlineData");
            if (inline == null) continue;

            String mime =
                    inline.optString(
                            "mimeType",
                            "audio/pcm;rate=24000");

            if (!mime.startsWith("audio/pcm")) continue;

            String data = inline.optString("data", "");
            if (data.isEmpty()) continue;

            int rate = parseRate(mime, 24000);
            byte[] pcm =
                    Base64.decode(
                            data,
                            Base64.DEFAULT);

            if (listener != null) {
                listener.onModelAudio(
                        pcm,
                        rate,
                        1);
            }
        }
    }

    void sendCallerAudio(
            byte[] pcm16le,
            int sampleRate,
            int channels) {

        if (!setupComplete
                || closed
                || socket == null
                || pcm16le == null
                || pcm16le.length == 0) {
            return;
        }

        try {
            JSONObject audio = new JSONObject()
                    .put(
                            "data",
                            Base64.encodeToString(
                                    pcm16le,
                                    Base64.NO_WRAP))
                    .put(
                            "mimeType",
                            "audio/pcm;rate=" + sampleRate);

            JSONObject realtime = new JSONObject()
                    .put("audio", audio);

            boolean ok = socket.send(
                    new JSONObject()
                            .put("realtimeInput", realtime)
                            .toString());

            if (!ok) {
                throw new IllegalStateException(
                        "Live WebSocket send queue rejected caller audio");
            }

        } catch (Throwable error) {
            fail(error);
        }
    }

    private void sendText(String text) {
        if (!setupComplete
                || closed
                || socket == null
                || text == null
                || text.trim().isEmpty()) {
            return;
        }

        try {
            JSONObject realtime =
                    new JSONObject().put(
                            "text",
                            text);

            socket.send(
                    new JSONObject()
                            .put("realtimeInput", realtime)
                            .toString());

        } catch (Throwable error) {
            fail(error);
        }
    }

    void close() {
        if (closed) return;
        closed = true;

        try {
            WebSocket ws = socket;

            if (ws != null) {
                try {
                    ws.send(
                            new JSONObject()
                                    .put(
                                            "realtimeInput",
                                            new JSONObject()
                                                    .put(
                                                            "audioStreamEnd",
                                                            true))
                                    .toString());
                } catch (Throwable ignored) {}

                ws.close(1000, "call ended");
            }
        } catch (Throwable ignored) {}

        client.dispatcher().executorService().shutdown();
        client.connectionPool().evictAll();
    }

    private void fail(Throwable error) {
        if (closed) return;

        Log.e(TAG, "Gemini Live session failed", error);

        if (listener != null) {
            try { listener.onError(error); } catch (Throwable ignored) {}
        }
    }

    private static int parseRate(
            String mime,
            int fallback) {

        try {
            int at = mime.indexOf("rate=");
            if (at < 0) return fallback;

            String value =
                    mime.substring(at + 5)
                            .replaceAll("[^0-9].*$", "");

            return Integer.parseInt(value);

        } catch (Throwable ignored) {
            return fallback;
        }
    }
}
