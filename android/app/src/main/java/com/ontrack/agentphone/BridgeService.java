package com.ontrack.agentphone;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.os.IBinder;
import android.telecom.TelecomManager;
import android.util.Log;

import org.json.JSONObject;

public class BridgeService extends Service {
    static final String CHANNEL = "ontrack_bridge";
    private volatile boolean running;
    private Thread worker;

    @Override public void onCreate() {
        super.onCreate();
        createChannel();
        startForeground(1101, notification("Connected to OnTrack dashboard"));
    }

    @Override public int onStartCommand(Intent intent, int flags, int startId) {
        if (!running) {
            running = true;
            worker = new Thread(this::loop, "OnTrackBridgeLoop");
            worker.start();
        }
        return START_STICKY;
    }

    private void loop() {
        long lastHeartbeat = 0;
        long lastContactsSyncCheck = 0;
        while (running) {
            try {
                if (!AppState.paired(this)) { Thread.sleep(3000); continue; }
                long now = System.currentTimeMillis();
                if (now - lastHeartbeat > 20000) { heartbeat(); lastHeartbeat = now; }

                if (ContactHelper.allowed(this)
                        && now - lastContactsSyncCheck > 60L * 60L * 1000L
                        && now - AppState.lastContactSync(this) > 6L * 60L * 60L * 1000L) {
                    try {
                        ContactHelper.sync(this);
                    } catch (Exception e) {
                        Log.w("OnTrackBridge", "contacts sync", e);
                    }
                    lastContactsSyncCheck = now;
                }

                JSONObject poll = ApiClient.get(AppState.server(this), "/api/device/poll.php", AppState.token(this));
                JSONObject job = poll.optJSONObject("job");
                if (job != null && "place_ai_call".equals(job.optString("action"))) placeJob(job);
                int sec = poll.optInt("poll_after_seconds", 3);
                Thread.sleep(Math.max(2, Math.min(15, sec)) * 1000L);
            } catch (InterruptedException e) { return; }
            catch (Exception e) { Log.w("OnTrackBridge", "loop", e); sleepQuiet(5000); }
        }
    }

    private void heartbeat() throws Exception {
        JSONObject b = new JSONObject(); b.put("phone_number", AppState.phone(this)); b.put("app_version", "0.2.0-poc");
        ApiClient.post(AppState.server(this), "/api/device/heartbeat.php", b, AppState.token(this));
    }

    private void placeJob(JSONObject job) throws Exception {
        int callId = job.getInt("call_id"); String number = job.getString("phone_number");
        getSharedPreferences("ontrack_agent_phone", MODE_PRIVATE).edit()
                .putInt("pending_call_id", callId).putString("pending_call_phone", normalize(number)).apply();
        updateCall(callId, "dialing", null);
        TelecomManager telecom = (TelecomManager) getSystemService(TELECOM_SERVICE);
        if (telecom == null) throw new IllegalStateException("Telecom service unavailable");
        telecom.placeCall(Uri.parse("tel:" + number), new android.os.Bundle());
    }

    static void updateCallAsync(android.content.Context c, int callId, String state, String error) {
        if (callId <= 0 || !AppState.paired(c)) return;
        new Thread(() -> {
            try {
                JSONObject b = new JSONObject(); b.put("call_id", callId); b.put("status", state); if (error != null) b.put("error", error);
                ApiClient.post(AppState.server(c), "/api/device/call-update.php", b, AppState.token(c));
            } catch (Exception e) { Log.w("OnTrackBridge", "call update", e); }
        }, "OnTrackCallUpdate").start();
    }

    private void updateCall(int callId, String state, String error) throws Exception {
        JSONObject b = new JSONObject(); b.put("call_id", callId); b.put("status", state); if (error != null) b.put("error", error);
        ApiClient.post(AppState.server(this), "/api/device/call-update.php", b, AppState.token(this));
    }

    private String normalize(String s) { return s == null ? "" : s.replaceAll("[^0-9+]", ""); }
    private void sleepQuiet(long ms) { try { Thread.sleep(ms); } catch (InterruptedException ignored) { Thread.currentThread().interrupt(); } }

    private Notification notification(String text) {
        Intent open = new Intent(this, MainActivity.class);
        PendingIntent pi = PendingIntent.getActivity(this, 0, open, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
        Notification.Builder b = Build.VERSION.SDK_INT >= 26 ? new Notification.Builder(this, CHANNEL) : new Notification.Builder(this);
        return b.setContentTitle("OnTrack AI Phone Bridge").setContentText(text).setSmallIcon(android.R.drawable.sym_call_incoming).setOngoing(true).setContentIntent(pi).build();
    }

    private void createChannel() {
        if (Build.VERSION.SDK_INT >= 26) {
            NotificationManager nm = getSystemService(NotificationManager.class);
            if (nm != null) nm.createNotificationChannel(new NotificationChannel(CHANNEL, "OnTrack Phone Bridge", NotificationManager.IMPORTANCE_LOW));
        }
    }

    @Override public void onDestroy() {
        running = false;
        AppState.setBridgeEnabled(this, false);
        if (worker != null) worker.interrupt();
        super.onDestroy();
    }
    @Override public IBinder onBind(Intent intent) { return null; }
}
