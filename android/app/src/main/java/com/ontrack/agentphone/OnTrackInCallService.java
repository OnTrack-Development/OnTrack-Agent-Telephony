package com.ontrack.agentphone;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
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

import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

public class OnTrackInCallService extends InCallService {
    private static final String TAG = "OnTrackInCall";
    private static final String CALL_CHANNEL = "ontrack_calls_v1";
    private static final int CALL_NOTIFICATION_ID = 2201;

    private static volatile OnTrackInCallService instance;
    private static volatile Call activeCall;
    private static volatile String activeNumber = "";
    private static volatile String activeContactName = "";

    private final Map<Call, Integer> inboundIds = new ConcurrentHashMap<>();
    private final Map<Call, Integer> outboundIds = new ConcurrentHashMap<>();
    private final Map<Call, Runnable> pendingAutoAnswers = new ConcurrentHashMap<>();
    private final Map<Call, Boolean> trackedCalls = new ConcurrentHashMap<>();
    private final Handler mainHandler = new Handler(Looper.getMainLooper());

    @Override public void onCreate() {
        super.onCreate();
        instance = this;
        createCallNotificationChannel();
    }

    @Override public void onDestroy() {
        if (instance == this) instance = null;
        super.onDestroy();
    }

    @Override public void onCallAdded(Call call) {
        super.onCallAdded(call);

        try {
            trackedCalls.put(call, Boolean.TRUE);
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
                postCallNotification(true);
                registerInbound(call, number, contactName);
            } else {
                postCallNotification(false);
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
                        activeCall = choosePrimaryCall(changedCall);

                        if (activeCall != null) {
                            activeNumber = number(activeCall.getDetails() == null
                                    ? null
                                    : activeCall.getDetails().getHandle());

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

                        if (state == Call.STATE_RINGING) {
                            postCallNotification(true);
                        } else if (state == Call.STATE_ACTIVE
                                || state == Call.STATE_DIALING
                                || state == Call.STATE_CONNECTING
                                || state == Call.STATE_HOLDING) {
                            postCallNotification(false);
                        }

                        if (state == Call.STATE_DISCONNECTED) {
                            mainHandler.postDelayed(() -> {
                                if (activeCall == changedCall) {
                                    activeCall = choosePrimaryCall(null);
                                }
                            }, 400L);
                        }

                        reportCapabilitiesAsync();

                    } catch (Throwable error) {
                        Log.e(TAG, "Call state callback failed", error);
                    }
                }

                @Override public void onConferenceableCallsChanged(
                        Call changedCall,
                        List<Call> conferenceableCalls) {
                    reportCapabilitiesAsync();
                }
            });

            reportCapabilitiesAsync();

        } catch (Throwable error) {
            Log.e(TAG, "onCallAdded failed", error);

            trackedCalls.put(call, Boolean.TRUE);
            activeCall = call;

            try {
                Call.Details details = call.getDetails();
                activeNumber = number(details == null ? null : details.getHandle());
            } catch (Throwable ignored) { }

            launchInCallUi();
            reportCapabilitiesAsync();
        }
    }

    @Override public void onCallRemoved(Call call) {
        try {
            cancelAutoAnswer(call);
            trackedCalls.remove(call);

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
                activeCall = choosePrimaryCall(null);
                if (activeCall == null) {
                    activeNumber = "";
                    activeContactName = "";
                }
            }

            if (trackedCalls.isEmpty()) {
                cancelCallNotification();
            }

            reportCapabilitiesAsync();

        } catch (Throwable error) {
            Log.e(TAG, "onCallRemoved failed", error);
        }

        super.onCallRemoved(call);
    }

    @Override public void onCanAddCallChanged(boolean canAddCall) {
        super.onCanAddCallChanged(canAddCall);
        reportCapabilitiesAsync();
    }

    private Call choosePrimaryCall(Call preferred) {
        if (preferred != null
                && preferred.getState() != Call.STATE_DISCONNECTED
                && preferred.getState() != Call.STATE_DISCONNECTING) {
            return preferred;
        }

        Call best = null;
        for (Call call : trackedCalls.keySet()) {
            int state = call.getState();
            if (state == Call.STATE_ACTIVE) return call;
            if (state == Call.STATE_RINGING) best = call;
            else if (best == null && state != Call.STATE_DISCONNECTED) best = call;
        }
        return best;
    }

    private void reportCapabilitiesAsync() {
        if (!AppState.paired(this)) return;

        new Thread(() -> {
            try {
                boolean canAdd = false;
                try {
                    canAdd = canAddCall();
                } catch (Throwable ignored) { }

                int activeCount = 0;
                int conferenceableCount = 0;

                for (Call call : trackedCalls.keySet()) {
                    int state = call.getState();
                    if (state != Call.STATE_DISCONNECTED && state != Call.STATE_DISCONNECTING) {
                        activeCount++;
                    }

                    try {
                        List<Call> conferenceable = call.getConferenceableCalls();
                        if (conferenceable != null) {
                            conferenceableCount += conferenceable.size();
                        }
                    } catch (Throwable ignored) { }
                }

                String status;
                if (conferenceableCount > 0 && activeCount >= 2) {
                    status = "merge_ready";
                } else if (canAdd) {
                    status = "add_call_ready";
                } else if (activeCount > 0) {
                    status = "unavailable";
                } else {
                    status = "unknown";
                }

                JSONObject body = new JSONObject();
                body.put("can_add_call", canAdd);
                body.put("conferenceable_count", conferenceableCount);
                body.put("active_call_count", activeCount);
                body.put("conference_status", status);

                ApiClient.post(
                        AppState.server(this),
                        "/api/device/capabilities.php",
                        body,
                        AppState.token(this));

            } catch (Throwable error) {
                Log.w(TAG, "Capability report failed", error);
            }
        }, "OnTrackConferenceCapabilities").start();
    }

    static boolean canAddCallNow() {
        OnTrackInCallService service = instance;
        if (service == null) return false;

        try {
            return service.canAddCall();
        } catch (Throwable ignored) {
            return false;
        }
    }

    static int activeCallCountNow() {
        OnTrackInCallService service = instance;
        if (service == null) return 0;

        int count = 0;
        for (Call call : service.trackedCalls.keySet()) {
            int state = call.getState();
            if (state != Call.STATE_DISCONNECTED && state != Call.STATE_DISCONNECTING) {
                count++;
            }
        }
        return count;
    }

    static int conferenceableCountNow() {
        OnTrackInCallService service = instance;
        if (service == null) return 0;

        int count = 0;
        for (Call call : service.trackedCalls.keySet()) {
            try {
                List<Call> list = call.getConferenceableCalls();
                if (list != null) count += list.size();
            } catch (Throwable ignored) { }
        }
        return count;
    }

    static boolean mergeConferenceNow() {
        OnTrackInCallService service = instance;
        if (service == null) return false;

        try {
            for (Call call : service.trackedCalls.keySet()) {
                List<Call> conferenceable = call.getConferenceableCalls();
                if (conferenceable != null && !conferenceable.isEmpty()) {
                    call.conference(conferenceable.get(0));
                    service.reportCapabilitiesAsync();
                    return true;
                }
            }
        } catch (Throwable error) {
            Log.e(TAG, "Conference merge failed", error);
        }
        return false;
    }

    private void createCallNotificationChannel() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;

        try {
            NotificationManager manager = getSystemService(NotificationManager.class);
            if (manager == null) return;

            NotificationChannel channel = new NotificationChannel(
                    CALL_CHANNEL,
                    "Phone calls",
                    NotificationManager.IMPORTANCE_HIGH);

            channel.setDescription("Incoming and ongoing phone calls");
            channel.setLockscreenVisibility(Notification.VISIBILITY_PUBLIC);
            channel.setSound(null, null);

            manager.createNotificationChannel(channel);

        } catch (Throwable error) {
            Log.e(TAG, "Could not create call notification channel", error);
        }
    }

    private void postCallNotification(boolean incoming) {
        try {
            Intent uiIntent = new Intent(this, InCallActivity.class);
            uiIntent.addFlags(
                    Intent.FLAG_ACTIVITY_NEW_TASK |
                    Intent.FLAG_ACTIVITY_SINGLE_TOP |
                    Intent.FLAG_ACTIVITY_CLEAR_TOP);

            PendingIntent pending = PendingIntent.getActivity(
                    this,
                    77,
                    uiIntent,
                    PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);

            String title = activeContactName == null || activeContactName.isEmpty()
                    ? (activeNumber == null || activeNumber.isEmpty()
                        ? "Phone call"
                        : activeNumber)
                    : activeContactName;

            String text;
            if (incoming) {
                text = activeNumber == null || activeNumber.isEmpty()
                        ? "Incoming call"
                        : "Incoming call · " + activeNumber;
            } else {
                Call call = activeCall;
                int state = call == null ? Call.STATE_NEW : call.getState();

                if (state == Call.STATE_ACTIVE) {
                    text = activeNumber == null || activeNumber.isEmpty()
                            ? "Call in progress"
                            : "Call in progress · " + activeNumber;
                } else {
                    text = activeNumber == null || activeNumber.isEmpty()
                            ? "Calling…"
                            : "Calling · " + activeNumber;
                }
            }

            Notification.Builder builder = new Notification.Builder(this, CALL_CHANNEL)
                    .setSmallIcon(com.ontrack.agentphone.R.drawable.ic_stat_ontrack)
                    .setContentTitle(title)
                    .setContentText(text)
                    .setCategory(Notification.CATEGORY_CALL)
                    .setVisibility(Notification.VISIBILITY_PUBLIC)
                    .setOngoing(true)
                    .setAutoCancel(false)
                    .setContentIntent(pending)
                    .setPriority(Notification.PRIORITY_MAX);

            if (incoming) {
                builder.setFullScreenIntent(pending, true);
            }

            NotificationManager manager = getSystemService(NotificationManager.class);
            if (manager != null) {
                manager.notify(CALL_NOTIFICATION_ID, builder.build());
            }

        } catch (Throwable error) {
            Log.e(TAG, "Could not post call notification", error);
        }
    }

    private void cancelCallNotification() {
        try {
            NotificationManager manager = getSystemService(NotificationManager.class);
            if (manager != null) manager.cancel(CALL_NOTIFICATION_ID);
        } catch (Throwable error) {
            Log.e(TAG, "Could not cancel call notification", error);
        }
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
                if (instruction == null) return;

                String action = instruction.optString("action", "ring_human");
                int delaySeconds = Math.max(
                        0,
                        instruction.optInt("delay_seconds", 0));

                if ("answer_and_bridge_ai".equals(action)) {
                    scheduleAutoAnswer(call, 0L);
                } else if ("ring_then_ai".equals(action)) {
                    scheduleAutoAnswer(call, delaySeconds * 1000L);
                } else {
                    cancelAutoAnswer(call);
                }

            } catch (Throwable error) {
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
                    if (call.getState() != Call.STATE_RINGING) return;
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
        if (task != null) mainHandler.removeCallbacks(task);
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

                if (phone != null) body.put("phone_number", phone);

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
        if (state == Call.STATE_RINGING) return "ringing";
        if (state == Call.STATE_ACTIVE) return "answered";
        if (state == Call.STATE_DISCONNECTED) return "completed";
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
