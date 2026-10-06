package com.ontrack.agentphone;

import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.os.Handler;
import android.os.Looper;
import android.telecom.Call;
import android.telecom.CallAudioState;
import android.telecom.InCallService;
import android.telecom.VideoProfile;
import android.util.Log;

import org.json.JSONObject;

import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

public class OnTrackInCallService extends InCallService {
    private static final String TAG = "OnTrackInCall";

    private static volatile OnTrackInCallService instance;
    private static volatile Call activeCall;
    private static volatile String activeNumber = "";
    private static volatile String activeContactName = "";

    private final Map<Call, Integer> inboundIds = new ConcurrentHashMap<>();
    private final Map<Call, Integer> outboundIds = new ConcurrentHashMap<>();
    private final Map<Call, Runnable> pendingAutoAnswers = new ConcurrentHashMap<>();
    private final Handler mainHandler = new Handler(Looper.getMainLooper());

    @Override public void onCreate() {
        super.onCreate();
        instance = this;
    }

    @Override public void onDestroy() {
        if (instance == this) instance = null;
        super.onDestroy();
    }

    @Override public void onCallAdded(Call call) {
        super.onCallAdded(call);

        try {
            activeCall = call;

            Call.Details details = call.getDetails();
            String number = number(details == null ? null : details.getHandle());
            String contactName = ContactHelper.findName(this, number);

            activeNumber = number;
            activeContactName = contactName;

            launchInCallUi();

            boolean incoming;
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q && details != null) {
                incoming = details.getCallDirection() == Call.Details.DIRECTION_INCOMING;
            } else {
                incoming = call.getState() == Call.STATE_RINGING;
            }

            if (incoming || call.getState() == Call.STATE_RINGING) {
                registerInbound(call, number, contactName);
            } else {
                int id = pendingOutbound(number);
                if (id > 0) {
                    outboundIds.put(call, id);
                    BridgeService.updateCallAsync(
                            this,
                            id,
                            stateToApi(call.getState()),
                            null);
                }
            }

            call.registerCallback(new Call.Callback() {
                @Override public void onStateChanged(Call changedCall, int state) {
                    try {
                        if (activeCall == changedCall) {
                            activeNumber = number(changedCall.getDetails() == null
                                    ? null
                                    : changedCall.getDetails().getHandle());

                            String name = ContactHelper.findName(
                                    OnTrackInCallService.this,
                                    activeNumber);

                            if (!name.isEmpty()) activeContactName = name;
                        }

                        Integer out = outboundIds.get(changedCall);
                        if (out != null) {
                            BridgeService.updateCallAsync(
                                    OnTrackInCallService.this,
                                    out,
                                    stateToApi(state),
                                    null);
                        }

                        Integer in = inboundIds.get(changedCall);
                        if (in != null) {
                            updateInbound(in, state);
                        }

                        if (state != Call.STATE_RINGING) {
                            cancelAutoAnswer(changedCall);
                        }

                        if (state == Call.STATE_DISCONNECTED) {
                            mainHandler.postDelayed(() -> {
                                if (activeCall == changedCall) {
                                    activeCall = null;
                                    activeNumber = "";
                                    activeContactName = "";
                                }
                            }, 1200L);
                        }

                    } catch (Throwable error) {
                        Log.e(TAG, "Call state callback failed", error);
                    }
                }
            });

        } catch (Throwable error) {
            // A default dialer must not let InCallService crash. If this throws,
            // Android Telecom can fall back to the preloaded dialer.
            Log.e(TAG, "onCallAdded failed", error);

            activeCall = call;
            try {
                Call.Details details = call.getDetails();
                activeNumber = number(details == null ? null : details.getHandle());
            } catch (Throwable ignored) { }

            launchInCallUi();
        }
    }

    @Override public void onCallRemoved(Call call) {
        try {
            cancelAutoAnswer(call);

            Integer out = outboundIds.remove(call);
            if (out != null) {
                BridgeService.updateCallAsync(this, out, "completed", null);

                getSharedPreferences("ontrack_agent_phone", MODE_PRIVATE)
                        .edit()
                        .remove("pending_call_id")
                        .remove("pending_call_phone")
                        .apply();
            }

            Integer in = inboundIds.remove(call);
            if (in != null) {
                sendInboundState(in, "ended", null);
            }

            if (activeCall == call) {
                activeCall = null;
                activeNumber = "";
                activeContactName = "";
            }

        } catch (Throwable error) {
            Log.e(TAG, "onCallRemoved failed", error);
        }

        super.onCallRemoved(call);
    }

    private void registerInbound(Call call, String phone, String contactName) {
        if (!AppState.paired(this)) {
            Log.w(TAG, "Incoming call detected but device is not paired");
            return;
        }

        new Thread(() -> {
            try {
                JSONObject body = new JSONObject();
                body.put("state", "ringing");
                body.put("phone_number", phone.isEmpty() ? "unknown" : phone);

                if (contactName != null && !contactName.isEmpty()) {
                    body.put("contact_name", contactName);
                }

                JSONObject response = ApiClient.post(
                        AppState.server(this),
                        "/api/device/incoming-event.php",
                        body,
                        AppState.token(this));

                int id = response.getInt("call_id");
                inboundIds.put(call, id);

                JSONObject instruction = response.optJSONObject("instruction");
                if (instruction == null) {
                    Log.i(TAG, "No incoming policy returned");
                    return;
                }

                String action = instruction.optString("action", "ring_human");
                int delaySeconds = Math.max(
                        0,
                        instruction.optInt("delay_seconds", 0));

                Log.i(TAG,
                        "Incoming policy action=" + action +
                        " delay=" + delaySeconds + "s");

                if ("answer_and_bridge_ai".equals(action)) {
                    scheduleAutoAnswer(call, 0L);
                } else if ("ring_then_ai".equals(action)) {
                    scheduleAutoAnswer(call, delaySeconds * 1000L);
                } else {
                    cancelAutoAnswer(call);
                }

            } catch (Throwable error) {
                // Never crash the InCallService because the dashboard/API failed.
                Log.e(TAG, "Incoming registration failed", error);
            }
        }, "OnTrackIncomingRegister").start();
    }

    private void scheduleAutoAnswer(Call call, long delayMs) {
        mainHandler.post(() -> {
            cancelAutoAnswer(call);

            Runnable task = () -> {
                pendingAutoAnswers.remove(call);

                try {
                    if (call.getState() != Call.STATE_RINGING) {
                        Log.i(TAG, "Auto-answer skipped; call is not ringing");
                        return;
                    }

                    Log.i(TAG, "Auto-answering incoming call");
                    call.answer(VideoProfile.STATE_AUDIO_ONLY);

                } catch (Throwable error) {
                    Log.e(TAG, "Auto-answer failed", error);
                }
            };

            pendingAutoAnswers.put(call, task);
            mainHandler.postDelayed(task, Math.max(0L, delayMs));
        });
    }

    private void cancelAutoAnswer(Call call) {
        Runnable task = pendingAutoAnswers.remove(call);
        if (task != null) {
            mainHandler.removeCallbacks(task);
        }
    }

    private void updateInbound(int id, int state) {
        if (state == Call.STATE_ACTIVE) {
            sendInboundState(id, "answered", null);
        } else if (state == Call.STATE_DISCONNECTED) {
            sendInboundState(id, "ended", null);
        }
    }

    private void sendInboundState(int id, String state, String phone) {
        new Thread(() -> {
            try {
                JSONObject body = new JSONObject();
                body.put("state", state);
                body.put("call_id", id);

                if (phone != null) {
                    body.put("phone_number", phone);
                }

                ApiClient.post(
                        AppState.server(this),
                        "/api/device/incoming-event.php",
                        body,
                        AppState.token(this));

            } catch (Throwable error) {
                Log.e(TAG, "Incoming state update failed", error);
            }
        }, "OnTrackIncomingState").start();
    }

    private int pendingOutbound(String number) {
        android.content.SharedPreferences prefs =
                getSharedPreferences("ontrack_agent_phone", MODE_PRIVATE);

        int id = prefs.getInt("pending_call_id", 0);
        String expected = prefs.getString("pending_call_phone", "");

        if (id <= 0) return 0;
        if (expected.isEmpty()) return id;

        String actualTail = trimCountry(number);
        String expectedTail = trimCountry(expected);

        return !actualTail.isEmpty()
                && (actualTail.endsWith(expectedTail)
                || expectedTail.endsWith(actualTail))
                ? id
                : 0;
    }

    private void launchInCallUi() {
        mainHandler.post(() -> {
            try {
                Intent intent = new Intent(this, InCallActivity.class);
                intent.addFlags(
                        Intent.FLAG_ACTIVITY_NEW_TASK |
                        Intent.FLAG_ACTIVITY_SINGLE_TOP |
                        Intent.FLAG_ACTIVITY_CLEAR_TOP);
                startActivity(intent);
            } catch (Throwable error) {
                Log.e(TAG, "Could not launch in-call UI", error);
            }
        });
    }

    static Call currentCall() {
        return activeCall;
    }

    static String currentNumber() {
        return activeNumber == null ? "" : activeNumber;
    }

    static String currentContactName() {
        return activeContactName == null ? "" : activeContactName;
    }

    static void answerCurrentCall() {
        Call call = activeCall;
        if (call == null) return;

        try {
            if (call.getState() == Call.STATE_RINGING) {
                call.answer(VideoProfile.STATE_AUDIO_ONLY);
            }
        } catch (Throwable error) {
            Log.e(TAG, "Manual answer failed", error);
        }
    }

    static void rejectCurrentCall() {
        Call call = activeCall;
        if (call == null) return;

        try {
            call.reject(false, null);
        } catch (Throwable error) {
            Log.e(TAG, "Reject failed", error);
        }
    }

    static void disconnectCurrentCall() {
        Call call = activeCall;
        if (call == null) return;

        try {
            call.disconnect();
        } catch (Throwable error) {
            Log.e(TAG, "Disconnect failed", error);
        }
    }

    static CallAudioState audioState() {
        OnTrackInCallService service = instance;
        if (service == null) return null;

        try {
            return service.getCallAudioState();
        } catch (Throwable ignored) {
            return null;
        }
    }

    static void toggleMute() {
        OnTrackInCallService service = instance;
        if (service == null) return;

        try {
            CallAudioState state = service.getCallAudioState();
            service.setMuted(state == null || !state.isMuted());
        } catch (Throwable error) {
            Log.e(TAG, "Mute toggle failed", error);
        }
    }

    static void toggleSpeaker() {
        OnTrackInCallService service = instance;
        if (service == null) return;

        try {
            CallAudioState state = service.getCallAudioState();
            boolean speaker =
                    state != null &&
                    (state.getRoute() & CallAudioState.ROUTE_SPEAKER) != 0;

            service.setAudioRoute(
                    speaker
                            ? CallAudioState.ROUTE_EARPIECE
                            : CallAudioState.ROUTE_SPEAKER);

        } catch (Throwable error) {
            Log.e(TAG, "Speaker toggle failed", error);
        }
    }

    private static String stateToApi(int state) {
        if (state == Call.STATE_DIALING || state == Call.STATE_CONNECTING) {
            return "dialing";
        }

        if (state == Call.STATE_RINGING) {
            return "ringing";
        }

        if (state == Call.STATE_ACTIVE) {
            return "answered";
        }

        if (state == Call.STATE_DISCONNECTED) {
            return "completed";
        }

        return "dialing";
    }

    private static String number(Uri uri) {
        return uri == null ? "" : normalize(uri.getSchemeSpecificPart());
    }

    private static String normalize(String value) {
        return value == null ? "" : value.replaceAll("[^0-9+]", "");
    }

    private static String trimCountry(String value) {
        String digits = normalize(value).replace("+", "");
        return digits.length() > 10
                ? digits.substring(digits.length() - 10)
                : digits;
    }
}
