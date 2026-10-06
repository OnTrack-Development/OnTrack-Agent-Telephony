package com.ontrack.agentphone;

import android.net.Uri;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.telecom.Call;
import android.telecom.PhoneAccountHandle;
import android.telecom.TelecomManager;
import android.util.Log;

import org.json.JSONObject;

import java.util.List;

/**
 * Coordinates the carrier conference media leg.
 *
 * Flow:
 * 1) Original cellular customer call is answered.
 * 2) Dial the configured PSTN bridge number on the SAME PhoneAccount/SIM.
 * 3) When bridge answers, send the 8-digit media PIN using DTMF.
 * 4) Wait until Telecom exposes the two calls as conferenceable.
 * 5) Merge them. The gateway is the source of truth for MEDIA CONNECTED.
 */
final class MediaBridgeCoordinator {
    private static final String TAG = "OnTrackMediaBridge";

    private final OnTrackInCallService service;
    private final Handler handler = new Handler(Looper.getMainLooper());

    private Call customerCall;
    private Call bridgeCall;

    private int callId;
    private String bridgeNumber = "";
    private String pin = "";
    private boolean autoMerge;

    private boolean configured;
    private boolean activated;
    private boolean dialStarted;
    private boolean pinSent;
    private boolean mergeRequested;
    private boolean finished;

    MediaBridgeCoordinator(OnTrackInCallService service) {
        this.service = service;
    }

    synchronized void configureInbound(
            Call call,
            int callId,
            JSONObject media) {

        if (media == null || !media.optBoolean("enabled", false)) {
            return;
        }

        String number = normalize(media.optString("phone_number", ""));
        String mediaPin = media.optString("pin", "").replaceAll("[^0-9]", "");

        if (number.length() < 5 || !mediaPin.matches("\\d{8}")) {
            reportAsync(callId, "failed", "Invalid media bridge plan");
            return;
        }

        reset();

        this.customerCall = call;
        this.callId = callId;
        this.bridgeNumber = number;
        this.pin = mediaPin;
        this.autoMerge = media.optBoolean("auto_merge", true);
        this.configured = true;

        reportAsync(callId, "requested", null);
    }

    synchronized void activateForAi(Call call) {
        if (!configured || finished || call == null || call != customerCall) return;

        activated = true;

        if (isUsableCustomerState(call.getState())) {
            handler.postDelayed(() -> maybeStartBridge(0), 700L);
        }
    }

    synchronized boolean isExpectedBridgeNumber(String number) {
        if (!configured || finished || dialStarted == false) return false;

        String actual = tail(normalize(number));
        String expected = tail(bridgeNumber);

        return !actual.isEmpty()
                && !expected.isEmpty()
                && (actual.endsWith(expected) || expected.endsWith(actual));
    }

    synchronized boolean isBridgeCall(Call call) {
        return call != null && call == bridgeCall;
    }

    synchronized Call customerCall() {
        return customerCall;
    }

    synchronized void onBridgeCallAdded(Call call, String number) {
        if (!configured || finished) return;

        bridgeCall = call;
        Log.i(TAG, "Bridge leg attached: " + number);
        reportAsync(callId, "bridge_leg_dialing", null);

        int state = call.getState();
        if (state == Call.STATE_ACTIVE) {
            onBridgeAnswered();
        }
    }

    synchronized void onCallStateChanged(Call call, int state) {
        if (!configured || finished || call == null) return;

        if (call == customerCall) {
            if (state == Call.STATE_ACTIVE || state == Call.STATE_HOLDING) {
                if (activated && !dialStarted) {
                    handler.postDelayed(() -> maybeStartBridge(0), 700L);
                }
            } else if (state == Call.STATE_DISCONNECTED) {
                finish(true, null);
            }
            return;
        }

        if (call == bridgeCall) {
            if (state == Call.STATE_DIALING || state == Call.STATE_CONNECTING) {
                reportAsync(callId, "bridge_leg_dialing", null);
            } else if (state == Call.STATE_ACTIVE) {
                onBridgeAnswered();
            } else if (state == Call.STATE_DISCONNECTED && !finished) {
                finish(false, "Bridge leg disconnected");
            }
        }
    }

    synchronized void onConferenceableChanged(Call call) {
        if (!configured || finished || !pinSent || mergeRequested || !autoMerge) {
            return;
        }

        handler.post(() -> attemptMerge(0));
    }

    synchronized void onCallRemoved(Call call) {
        if (!configured || finished || call == null) return;

        if (call == customerCall) {
            finish(true, null);
        } else if (call == bridgeCall) {
            finish(false, "Bridge leg removed");
        }
    }

    private void maybeStartBridge(int attempt) {
        synchronized (this) {
            if (!configured || !activated || finished || dialStarted || customerCall == null) return;

            int state = customerCall.getState();
            if (!isUsableCustomerState(state)) {
                return;
            }

            boolean canAdd;
            try {
                canAdd = service.canAddCall();
            } catch (Throwable error) {
                canAdd = false;
            }

            if (!canAdd) {
                if (attempt == 0) {
                    reportAsync(callId, "waiting_for_add_call", null);
                }

                if (attempt < 12) {
                    int next = attempt + 1;
                    handler.postDelayed(() -> maybeStartBridge(next), 750L);
                } else {
                    reportAsync(
                            callId,
                            "add_call_unavailable",
                            "Carrier/Telecom did not allow a second call");
                }
                return;
            }

            TelecomManager telecom =
                    (TelecomManager)service.getSystemService(android.content.Context.TELECOM_SERVICE);

            if (telecom == null) {
                reportAsync(callId, "failed", "Telecom service unavailable");
                return;
            }

            try {
                Bundle extras = new Bundle();

                Call.Details details = customerCall.getDetails();
                PhoneAccountHandle account = details == null
                        ? null
                        : details.getAccountHandle();

                if (account != null) {
                    extras.putParcelable(
                            TelecomManager.EXTRA_PHONE_ACCOUNT_HANDLE,
                            account);
                }

                dialStarted = true;
                reportAsync(callId, "bridge_leg_dialing", null);

                telecom.placeCall(
                        Uri.parse("tel:" + bridgeNumber),
                        extras);

                Log.i(TAG, "Dialing media bridge on same phone account");

            } catch (Throwable error) {
                dialStarted = false;
                reportAsync(callId, "failed", "Could not dial media bridge: " + error.getMessage());
                Log.e(TAG, "Could not dial bridge", error);
            }
        }
    }

    private void onBridgeAnswered() {
        synchronized (this) {
            if (!configured || finished || bridgeCall == null) return;
            if (pinSent) return;
            reportAsync(callId, "bridge_leg_answered", null);
        }

        // Give the gateway's DTMF reader a moment to be ready.
        handler.postDelayed(() -> sendPinDigit(0), 650L);
    }

    private void sendPinDigit(int index) {
        final Call call;
        final String digits;
        final int id;

        synchronized (this) {
            if (!configured || finished || bridgeCall == null || pinSent) return;
            call = bridgeCall;
            digits = pin;
            id = callId;
        }

        if (index >= digits.length()) {
            synchronized (this) {
                pinSent = true;
            }

            reportAsync(id, "dtmf_sent", null);

            if (autoMerge) {
                reportAsync(id, "merge_waiting", null);
                handler.postDelayed(() -> attemptMerge(0), 700L);
            } else {
                reportAsync(id, "merge_waiting", "Auto merge disabled");
            }
            return;
        }

        char digit = digits.charAt(index);

        try {
            call.playDtmfTone(digit);

            handler.postDelayed(() -> {
                try {
                    call.stopDtmfTone();
                } catch (Throwable ignored) { }

                handler.postDelayed(
                        () -> sendPinDigit(index + 1),
                        120L);
            }, 180L);

        } catch (Throwable error) {
            try {
                call.stopDtmfTone();
            } catch (Throwable ignored) { }

            reportAsync(id, "failed", "DTMF PIN failed: " + error.getMessage());
            Log.e(TAG, "DTMF failed", error);
        }
    }

    private void attemptMerge(int attempt) {
        final Call customer;
        final Call bridge;
        final int id;

        synchronized (this) {
            if (!configured || finished || !autoMerge || mergeRequested) return;
            customer = customerCall;
            bridge = bridgeCall;
            id = callId;
        }

        if (customer == null || bridge == null) return;

        if (isConferenceable(customer, bridge)) {
            try {
                customer.conference(bridge);

                synchronized (this) {
                    mergeRequested = true;
                }

                reportAsync(id, "merge_requested", null);
                Log.i(TAG, "Carrier merge requested");
                return;

            } catch (Throwable error) {
                reportAsync(id, "failed", "Conference merge failed: " + error.getMessage());
                Log.e(TAG, "Merge failed", error);
                return;
            }
        }

        if (attempt < 20) {
            int next = attempt + 1;
            handler.postDelayed(() -> attemptMerge(next), 500L);
        } else {
            reportAsync(
                    id,
                    "merge_unavailable",
                    "Two calls existed but carrier did not expose them as conferenceable");
        }
    }

    private boolean isConferenceable(Call a, Call b) {
        try {
            List<Call> first = a.getConferenceableCalls();
            if (first != null && first.contains(b)) return true;
        } catch (Throwable ignored) { }

        try {
            List<Call> second = b.getConferenceableCalls();
            return second != null && second.contains(a);
        } catch (Throwable ignored) {
            return false;
        }
    }

    private void finish(boolean customerEnded, String error) {
        Call leg;
        int id;

        synchronized (this) {
            if (finished) return;
            finished = true;
            id = callId;
            leg = bridgeCall;
        }

        reportAsync(id, "ended", error);

        if (customerEnded && leg != null) {
            try {
                int state = leg.getState();
                if (state != Call.STATE_DISCONNECTED
                        && state != Call.STATE_DISCONNECTING) {
                    leg.disconnect();
                }
            } catch (Throwable ignored) { }
        }

        handler.postDelayed(this::reset, 700L);
    }

    private synchronized void reset() {
        customerCall = null;
        bridgeCall = null;
        callId = 0;
        bridgeNumber = "";
        pin = "";
        autoMerge = false;
        configured = false;
        activated = false;
        dialStarted = false;
        pinSent = false;
        mergeRequested = false;
        finished = false;
    }

    private boolean isUsableCustomerState(int state) {
        return state == Call.STATE_ACTIVE || state == Call.STATE_HOLDING;
    }

    private void reportAsync(int id, String state, String error) {
        if (id <= 0 || !AppState.paired(service)) return;

        new Thread(() -> {
            try {
                JSONObject body = new JSONObject();
                body.put("call_id", id);
                body.put("state", state);

                if (error != null && !error.trim().isEmpty()) {
                    body.put("error", error);
                }

                ApiClient.post(
                        AppState.server(service),
                        "/api/device/media-state.php",
                        body,
                        AppState.token(service));

            } catch (Throwable reportError) {
                Log.w(TAG, "Media state report failed", reportError);
            }
        }, "OnTrackMediaState").start();
    }

    private static String normalize(String value) {
        return value == null ? "" : value.replaceAll("[^0-9+]", "");
    }

    private static String tail(String value) {
        String digits = normalize(value).replace("+", "");
        return digits.length() > 10
                ? digits.substring(digits.length() - 10)
                : digits;
    }
}
