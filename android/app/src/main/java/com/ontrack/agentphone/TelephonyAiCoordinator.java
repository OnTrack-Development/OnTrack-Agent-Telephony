package com.ontrack.agentphone;

import android.content.Context;
import android.util.Log;

import org.json.JSONObject;

/**
 * One customer call == one platform AI session.
 *
 * Control plane:
 *   handset authenticates to OnTrack -> assigned tenant/agent is resolved ->
 *   OnTrack provisions a short-lived Live token and call-specific context.
 *
 * Media plane:
 *   SIM downlink -> local shell bridge -> Gemini Live
 *   Gemini audio -> local shell bridge -> SIM TELEPHONY_TX
 */
final class TelephonyAiCoordinator {
    private static final String TAG = "OnTrackTelephonyAI";

    private final Context context;
    private final int callId;
    private final String direction;

    private volatile boolean stopping;
    private volatile boolean started;

    private LocalCallMediaBridge media;
    private GeminiLiveSession live;

    private int platformSessionId;
    private String platformSessionToken = "";

    TelephonyAiCoordinator(
            Context context,
            int callId,
            String direction) {

        this.context = context.getApplicationContext();
        this.callId = callId;
        this.direction = direction;
    }

    void start() {
        if (started || stopping) return;
        started = true;

        new Thread(() -> {
            try {
                if (!AppState.paired(context)) {
                    throw new IllegalStateException(
                            "Phone is not paired with OnTrack");
                }

                if (!LocalAdb.wasPaired(context)) {
                    throw new IllegalStateException(
                            "Local shell audio bridge is not paired");
                }

                JSONObject request = new JSONObject()
                        .put("call_id", callId)
                        .put("direction", direction);

                JSONObject session =
                        ApiClient.post(
                                AppState.server(context),
                                "/api/device/voice-session.php",
                                request,
                                AppState.token(context));

                platformSessionId =
                        session.getInt("platform_session_id");
                platformSessionToken =
                        session.getString("platform_session_token");

                media = new LocalCallMediaBridge(
                        context,
                        new LocalCallMediaBridge.Listener() {
                            @Override public void onCallerAudio(
                                    byte[] pcm16le,
                                    int sampleRate,
                                    int channels) {
                                GeminiLiveSession current = live;
                                if (current != null) {
                                    current.sendCallerAudio(
                                            pcm16le,
                                            sampleRate,
                                            channels);
                                }
                            }

                            @Override public void onReady(
                                    int rxRate,
                                    int rxChannels,
                                    int txRate,
                                    int txChannels) {
                                Log.i(
                                        TAG,
                                        "Local SIM media ready RX "
                                                + rxRate + "/" + rxChannels
                                                + " TX "
                                                + txRate + "/" + txChannels);
                            }

                            @Override public void onError(Throwable error) {
                                fail(error);
                            }

                            @Override public void onClosed() {
                                if (!stopping) {
                                    fail(
                                            new IllegalStateException(
                                                    "Local SIM media bridge closed"));
                                }
                            }
                        });

                live = new GeminiLiveSession(
                        session,
                        new GeminiLiveSession.Listener() {
                            @Override public void onReady() {
                                event(
                                        "connected",
                                        null,
                                        null,
                                        null);
                            }

                            @Override public void onModelAudio(
                                    byte[] pcm16le,
                                    int sampleRate,
                                    int channels) {
                                try {
                                    LocalCallMediaBridge current = media;
                                    if (current != null) {
                                        current.sendAiAudio(
                                                pcm16le,
                                                sampleRate,
                                                channels);
                                    }
                                } catch (Throwable error) {
                                    fail(error);
                                }
                            }

                            @Override public void onInputTranscript(String text) {
                                event(
                                        "active",
                                        text,
                                        null,
                                        null);
                            }

                            @Override public void onOutputTranscript(String text) {
                                event(
                                        "active",
                                        null,
                                        text,
                                        null);
                            }

                            @Override public void onInterrupted() {
                                LocalCallMediaBridge current = media;
                                if (current != null) {
                                    current.flushAiAudio();
                                }
                            }

                            @Override public void onError(Throwable error) {
                                fail(error);
                            }

                            @Override public void onClosed(String reason) {
                                if (!stopping) {
                                    event(
                                            "failed",
                                            null,
                                            null,
                                            reason == null || reason.isEmpty()
                                                    ? "Live session closed"
                                                    : reason);
                                }
                            }
                        });

                // Start local SIM media first. Captured frames are ignored until
                // the Live setup completes, while TX is ready before the first
                // model audio arrives.
                media.start();
                live.connect();

            } catch (Throwable error) {
                fail(error);
            }
        }, "OnTrackAiSessionStart").start();
    }

    void stop() {
        if (stopping) return;
        stopping = true;

        try {
            if (live != null) live.close();
        } catch (Throwable ignored) {}

        try {
            if (media != null) media.stop();
        } catch (Throwable ignored) {}

        event(
                "ended",
                null,
                null,
                null);
    }

    private void fail(Throwable error) {
        if (stopping) return;

        String message =
                error == null
                        ? "Unknown AI session error"
                        : (
                                error.getMessage() == null
                                        ? error.getClass().getSimpleName()
                                        : error.getMessage()
                        );

        Log.e(TAG, "AI call failed: " + message, error);

        event(
                "failed",
                null,
                null,
                message);

        try {
            if (live != null) live.close();
        } catch (Throwable ignored) {}

        try {
            if (media != null) media.stop();
        } catch (Throwable ignored) {}
    }

    private void event(
            String state,
            String inputTranscript,
            String outputTranscript,
            String error) {

        if (platformSessionId <= 0
                || platformSessionToken.isEmpty()
                || !AppState.paired(context)) {
            return;
        }

        new Thread(() -> {
            try {
                JSONObject body = new JSONObject()
                        .put(
                                "platform_session_id",
                                platformSessionId)
                        .put(
                                "platform_session_token",
                                platformSessionToken)
                        .put("state", state);

                if (inputTranscript != null
                        && !inputTranscript.trim().isEmpty()) {
                    body.put(
                            "input_transcript",
                            inputTranscript.trim());
                }

                if (outputTranscript != null
                        && !outputTranscript.trim().isEmpty()) {
                    body.put(
                            "output_transcript",
                            outputTranscript.trim());
                }

                if (error != null
                        && !error.trim().isEmpty()) {
                    body.put("error", error.trim());
                }

                ApiClient.post(
                        AppState.server(context),
                        "/api/device/voice-session-event.php",
                        body,
                        AppState.token(context));

            } catch (Throwable reportError) {
                Log.w(
                        TAG,
                        "Could not report AI session event",
                        reportError);
            }
        }, "OnTrackAiSessionEvent").start();
    }
}
