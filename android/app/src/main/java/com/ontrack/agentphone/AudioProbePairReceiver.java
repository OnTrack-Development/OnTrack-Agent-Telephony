package com.ontrack.agentphone;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.RemoteInput;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.os.Build;

/** Receives the six-digit Wireless Debugging pairing code from a notification reply. */
public class AudioProbePairReceiver extends BroadcastReceiver {
    static final String ACTION_PAIR = "com.ontrack.agentphone.AUDIO_PROBE_PAIR";
    private static final String CHANNEL = "ontrack_audio_probe";
    private static final int NOTIFICATION_ID = 4317;
    private static final String KEY_CODE = "pair_code";

    static void showPairPrompt(Context context) {
        NotificationManager nm = context.getSystemService(NotificationManager.class);
        if (Build.VERSION.SDK_INT >= 26) {
            NotificationChannel channel = new NotificationChannel(
                    CHANNEL,
                    "SIM Audio Probe",
                    NotificationManager.IMPORTANCE_HIGH);
            channel.setDescription("Local Wireless Debugging pairing for the SIM audio probe");
            nm.createNotificationChannel(channel);
        }

        Intent intent = new Intent(context, AudioProbePairReceiver.class).setAction(ACTION_PAIR);
        int flags = PendingIntent.FLAG_UPDATE_CURRENT;
        if (Build.VERSION.SDK_INT >= 31) flags |= PendingIntent.FLAG_MUTABLE;
        PendingIntent pending = PendingIntent.getBroadcast(context, 4317, intent, flags);

        RemoteInput input = new RemoteInput.Builder(KEY_CODE)
                .setLabel("6-digit pairing code")
                .build();

        Notification.Action action = new Notification.Action.Builder(
                android.R.drawable.ic_menu_send,
                "Enter pairing code",
                pending)
                .addRemoteInput(input)
                .build();

        Notification.Builder builder = Build.VERSION.SDK_INT >= 26
                ? new Notification.Builder(context, CHANNEL)
                : new Notification.Builder(context);

        Notification notification = builder
                .setSmallIcon(R.mipmap.ic_launcher)
                .setContentTitle("OnTrack SIM Audio Probe")
                .setContentText("Keep Android's pairing-code dialog open, then reply here with the 6 digits.")
                .setStyle(new Notification.BigTextStyle().bigText(
                        "Open Developer options → Wireless debugging → Pair device with pairing code. " +
                        "Keep that dialog open and reply to this notification with the six digits."))
                .setOngoing(true)
                .addAction(action)
                .build();

        nm.notify(NOTIFICATION_ID, notification);
    }

    @Override public void onReceive(Context context, Intent intent) {
        if (intent == null || !ACTION_PAIR.equals(intent.getAction())) return;

        android.os.Bundle results = RemoteInput.getResultsFromIntent(intent);
        CharSequence entered = results == null ? null : results.getCharSequence(KEY_CODE);
        String code = entered == null ? "" : entered.toString().replaceAll("[^0-9]", "");
        PendingResult pending = goAsync();

        new Thread(() -> {
            try {
                if (code.length() != 6) {
                    postResult(context, "Pairing code must contain exactly six digits", true);
                    return;
                }
                postResult(context, "Pairing with local Android shell…", false);
                String id = LocalAdb.pairAndVerify(context, code);
                postResult(context, "PAIRED · " + id, false);
            } catch (Throwable error) {
                String message = error.getMessage() == null
                        ? error.getClass().getSimpleName()
                        : error.getMessage();
                postResult(context, "PAIR FAILED · " + message, true);
            } finally {
                pending.finish();
            }
        }, "OnTrackAudioProbePair").start();
    }

    private static void postResult(Context context, String text, boolean allowReply) {
        NotificationManager nm = context.getSystemService(NotificationManager.class);

        Notification.Builder builder = Build.VERSION.SDK_INT >= 26
                ? new Notification.Builder(context, CHANNEL)
                : new Notification.Builder(context);

        builder.setSmallIcon(R.mipmap.ic_launcher)
                .setContentTitle("OnTrack SIM Audio Probe")
                .setContentText(text)
                .setStyle(new Notification.BigTextStyle().bigText(text))
                .setOngoing(false)
                .setAutoCancel(true);

        if (allowReply) {
            Intent retry = new Intent(context, AudioProbePairReceiver.class).setAction(ACTION_PAIR);
            int flags = PendingIntent.FLAG_UPDATE_CURRENT;
            if (Build.VERSION.SDK_INT >= 31) flags |= PendingIntent.FLAG_MUTABLE;
            PendingIntent pending = PendingIntent.getBroadcast(context, 4318, retry, flags);
            RemoteInput input = new RemoteInput.Builder(KEY_CODE)
                    .setLabel("6-digit pairing code")
                    .build();
            builder.addAction(new Notification.Action.Builder(
                    android.R.drawable.ic_menu_send,
                    "Try code again",
                    pending).addRemoteInput(input).build());
        }

        nm.notify(NOTIFICATION_ID, builder.build());
    }
}
