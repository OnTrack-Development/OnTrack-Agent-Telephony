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
 *   SIM downlink -> local shell bridge -> OnTrack Platform -> assigned Voice Agent
 *   Voice Agent audio -> OnTrack Platform -> local shell bridge -> SIM TELEPHONY_TX
 *
 * The handset never connects directly to the AI provider.
 */
final class TelephonyAiCoordinator {
    private static final String TAG = "OnTrackTelephonyAI";

    private final Context context;
    private final int callId;
    private final String direction;

    private volatile boolean stopping;
    private volatile boolean started;

    private LocalCallMediaBridge media;
    private PlatformVoiceSession live;

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
                                PlatformVoiceSession current = live;
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

                                // Gemini must not produce the opening greeting
                                // before TELEPHONY_TX is ready, otherwise the
                                // first model audio can be silently dropped.
                                try {
                                    PlatformVoiceSession current = live;
                                    if (current == null) {
                                        throw new IllegalStateException(
                                                "Live session object unavailable");
                                    }
                                    current.connect();
                                } catch (Throwable error) {
                                    fail(error);
                                }
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

                live = new PlatformVoiceSession(
                        context,
                        session,
                        new PlatformVoiceSession.Listener() {
                            @Override public void onReady() {
                                callMediaState("connected", null);
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

                // Strict ordering:
                // 1) establish RX + TX on the handset,
                // 2) only then connect the handset to the OnTrack platform relay.
                // The platform owns provider credentials, tenant/agent identity,
                // future tools/business-data access and the provider WebSocket.
                callMediaState("requested", null);
                media.start();

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

        callMediaState("ended", null);

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

        callMediaState("failed", message);

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

    private void callMediaState(
            String state,
            String error) {

        if (callId <= 0 || !AppState.paired(context)) {
            return;
        }

        new Thread(() -> {
            try {
                JSONObject body = new JSONObject()
                        .put("call_id", callId)
                        .put("state", state);

                if (error != null && !error.trim().isEmpty()) {
                    body.put("error", error.trim());
                }

                ApiClient.post(
                        AppState.server(context),
                        "/api/device/media-state.php",
                        body,
                        AppState.token(context));

            } catch (Throwable reportError) {
                Log.w(
                        TAG,
                        "Could not report call media state",
                        reportError);
            }
        }, "OnTrackCallMediaState").start();
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
