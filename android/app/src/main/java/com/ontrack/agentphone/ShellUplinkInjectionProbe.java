package com.ontrack.agentphone;

import android.content.Context;
import android.media.AudioFormat;
import android.media.AudioManager;
import android.media.AudioTrack;
import android.os.Process;
import android.os.Looper;

import java.lang.reflect.Method;
import java.util.Locale;

/**
 * Runs only through the local ADB bootstrap as uid=2000(shell).
 *
 * It tests Android's call-uplink injection path with a short low-level tone.
 * The remote party must confirm whether the tone was actually heard.
 */
public final class ShellUplinkInjectionProbe {
    private static final int RATE = 16000;
    private static final double FREQ_HZ = 700.0;
    private static final int DURATION_MS = 700;
    private static final int AMPLITUDE = 4500;

    private ShellUplinkInjectionProbe() {}

    public static void main(String[] args) {
        System.out.println("ONTRACK_INJECT|meta|uid=" + Process.myUid()
                + "|pid=" + Process.myPid());

        AudioTrack track = null;

        try {
            relaxHiddenApiChecks();

            Context context = createShellContext();
            AudioManager audioManager =
                    (AudioManager) context.getSystemService(Context.AUDIO_SERVICE);

            if (audioManager == null) {
                throw new IllegalStateException("AudioManager unavailable");
            }

            int mode = audioManager.getMode();
            System.out.println("ONTRACK_INJECT|mode=" + mode
                    + "|package=" + context.getPackageName()
                    + "|op_package=" + context.getOpPackageName());

            Method interceptableMethod =
                    AudioManager.class.getDeclaredMethod("isPstnCallAudioInterceptable");
            interceptableMethod.setAccessible(true);

            boolean interceptable =
                    (Boolean) interceptableMethod.invoke(audioManager);

            System.out.println(
                    "ONTRACK_INJECT|pstn_interceptable=" + interceptable);

            if (!interceptable) {
                System.out.println(
                        "ONTRACK_INJECT|result=unsupported|reason=pstn_not_interceptable");
                System.out.println("ONTRACK_INJECT|done");
                return;
            }

            AudioFormat format = new AudioFormat.Builder()
                    .setSampleRate(RATE)
                    .setEncoding(AudioFormat.ENCODING_PCM_16BIT)
                    .setChannelMask(AudioFormat.CHANNEL_OUT_MONO)
                    .build();

            Method injectionMethod =
                    AudioManager.class.getDeclaredMethod(
                            "getCallUplinkInjectionAudioTrack",
                            AudioFormat.class);
            injectionMethod.setAccessible(true);

            track = (AudioTrack) injectionMethod.invoke(
                    audioManager,
                    format);

            if (track == null
                    || track.getState() != AudioTrack.STATE_INITIALIZED) {
                throw new IllegalStateException(
                        "Call uplink AudioTrack did not initialize");
            }

            short[] tone = makeTone();

            track.play();

            int written = track.write(
                    tone,
                    0,
                    tone.length,
                    AudioTrack.WRITE_BLOCKING);

            try {
                Thread.sleep(DURATION_MS + 120L);
            } catch (InterruptedException ignored) {
                Thread.currentThread().interrupt();
            }

            System.out.println(String.format(
                    Locale.US,
                    "ONTRACK_INJECT|track_initialized=true|samples=%d|written=%d|freq_hz=%.1f|duration_ms=%d",
                    tone.length,
                    written,
                    FREQ_HZ,
                    DURATION_MS));

            if (written > 0) {
                System.out.println(
                        "ONTRACK_INJECT|result=written|remote_confirmation_required=true");
            } else {
                System.out.println(
                        "ONTRACK_INJECT|result=write_failed|written=" + written);
            }

        } catch (Throwable error) {
            Throwable root = error;
            while (root.getCause() != null && root.getCause() != root) {
                root = root.getCause();
            }

            String message = root.getMessage();
            if (message == null) message = "";
            message = message
                    .replace('|', '/')
                    .replace('\n', ' ')
                    .replace('\r', ' ');

            System.out.println(
                    "ONTRACK_INJECT|error="
                            + root.getClass().getName()
                            + ":" + message);
        } finally {
            if (track != null) {
                try { track.stop(); } catch (Throwable ignored) {}
                try { track.flush(); } catch (Throwable ignored) {}
                try { track.release(); } catch (Throwable ignored) {}
            }

            System.out.println("ONTRACK_INJECT|done");
        }
    }

    private static short[] makeTone() {
        int count = RATE * DURATION_MS / 1000;
        short[] pcm = new short[count];

        // 35 ms fade in/out avoids a click at either end.
        int fade = Math.max(1, RATE * 35 / 1000);

        for (int i = 0; i < count; i++) {
            double env = 1.0;

            if (i < fade) {
                env = (double) i / fade;
            } else if (i > count - fade) {
                env = (double) (count - i) / fade;
            }

            double phase = 2.0 * Math.PI * FREQ_HZ * i / RATE;
            pcm[i] = (short) Math.round(
                    Math.sin(phase) * AMPLITUDE * env);
        }

        return pcm;
    }

    private static Context createShellContext() throws Exception {
        // app_process does not prepare a Java Looper for us. ActivityThread
        // creates Handlers while attaching the system context, so prepare one
        // explicitly before calling systemMain().
        if (Looper.myLooper() == null) {
            Looper.prepare();
        }

        Class<?> activityThread =
                Class.forName("android.app.ActivityThread");

        Method systemMain =
                activityThread.getDeclaredMethod("systemMain");
        systemMain.setAccessible(true);

        Object thread = systemMain.invoke(null);

        Method getSystemContext =
                activityThread.getDeclaredMethod("getSystemContext");
        getSystemContext.setAccessible(true);

        Context system =
                (Context) getSystemContext.invoke(thread);

        // Public API, but the returned context is for com.android.shell so
        // binder attribution matches uid=2000 rather than package "android".
        return system.createPackageContext(
                "com.android.shell",
                Context.CONTEXT_IGNORE_SECURITY);
    }

    private static void relaxHiddenApiChecks() {
        try {
            Class<?> vmRuntime =
                    Class.forName("dalvik.system.VMRuntime");

            Method getRuntime =
                    vmRuntime.getDeclaredMethod("getRuntime");
            getRuntime.setAccessible(true);

            Object runtime = getRuntime.invoke(null);

            Method setExemptions =
                    vmRuntime.getDeclaredMethod(
                            "setHiddenApiExemptions",
                            String[].class);
            setExemptions.setAccessible(true);

            setExemptions.invoke(
                    runtime,
                    (Object) new String[]{
                            "Landroid/app/ActivityThread;",
                            "Landroid/media/AudioManager;"
                    });
        } catch (Throwable ignored) {
            // On shell/app_process this is often unnecessary. The actual
            // reflection call below will report a precise error if blocked.
        }
    }
}
