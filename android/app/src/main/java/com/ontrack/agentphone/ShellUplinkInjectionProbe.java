package com.ontrack.agentphone;

import android.content.Context;
import android.media.AudioAttributes;
import android.media.AudioFormat;
import android.media.AudioManager;
import android.media.AudioTrack;
import android.os.Looper;
import android.os.Process;

import java.lang.reflect.Method;
import java.util.Locale;

/**
 * Runs only through the local ADB bootstrap as uid=2000(shell).
 *
 * It tests Android's PSTN call-uplink injection path with one short test tone.
 * The remote party must confirm whether the tone was actually heard.
 */
public final class ShellUplinkInjectionProbe {
    private static final int[] RATES = new int[]{8000, 16000, 48000};
    private static final double FREQ_HZ = 700.0;
    private static final int DURATION_MS = 650;
    private static final int AMPLITUDE = 4200;

    private ShellUplinkInjectionProbe() {}

    public static void main(String[] args) {
        System.out.println("ONTRACK_INJECT|meta|uid=" + Process.myUid()
                + "|pid=" + Process.myPid());

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

            Method injectionMethod =
                    AudioManager.class.getDeclaredMethod(
                            "getCallUplinkInjectionAudioTrack",
                            AudioFormat.class);
            injectionMethod.setAccessible(true);

            int lastError = 0;

            for (int rate : RATES) {
                AudioTrack track = null;

                try {
                    AudioFormat format = new AudioFormat.Builder()
                            .setSampleRate(rate)
                            .setEncoding(AudioFormat.ENCODING_PCM_16BIT)
                            .setChannelMask(AudioFormat.CHANNEL_OUT_MONO)
                            .build();

                    track = (AudioTrack) injectionMethod.invoke(
                            audioManager,
                            format);

                    if (track == null
                            || track.getState() != AudioTrack.STATE_INITIALIZED) {
                        System.out.println(
                                "ONTRACK_INJECT|attempt|rate=" + rate
                                        + "|initialized=false");
                        continue;
                    }

                    short[] tone = makeTone(rate);

                    System.out.println(
                            "ONTRACK_INJECT|attempt|rate=" + rate
                                    + "|initialized=true"
                                    + "|buffer_frames=" + track.getBufferSizeInFrames()
                                    + "|sample_rate=" + track.getSampleRate()
                                    + "|play_state=" + track.getPlayState());

                    // Prime before play. Android explicitly allows filling a
                    // streaming AudioTrack before play(), which avoids starting
                    // an empty call-assistant track on vendor HALs.
                    int primeTarget = Math.min(
                            tone.length,
                            Math.max(160, track.getBufferSizeInFrames() / 2));

                    int primed = track.write(
                            tone,
                            0,
                            primeTarget,
                            AudioTrack.WRITE_NON_BLOCKING);

                    System.out.println(
                            "ONTRACK_INJECT|attempt|rate=" + rate
                                    + "|prime_written=" + primed);

                    if (primed == AudioTrack.ERROR_DEAD_OBJECT) {
                        lastError = primed;
                        continue;
                    }

                    if (primed < 0) {
                        lastError = primed;
                        continue;
                    }

                    track.play();

                    int totalWritten = primed;
                    int offset = Math.max(0, primed);

                    while (offset < tone.length) {
                        int written = track.write(
                                tone,
                                offset,
                                tone.length - offset,
                                AudioTrack.WRITE_NON_BLOCKING);

                        if (written > 0) {
                            offset += written;
                            totalWritten += written;
                            continue;
                        }

                        if (written == 0) {
                            try {
                                Thread.sleep(12L);
                            } catch (InterruptedException ignored) {
                                Thread.currentThread().interrupt();
                                break;
                            }
                            continue;
                        }

                        lastError = written;
                        System.out.println(
                                "ONTRACK_INJECT|attempt|rate=" + rate
                                        + "|stream_write_error=" + written);
                        break;
                    }

                    try {
                        Thread.sleep(DURATION_MS + 180L);
                    } catch (InterruptedException ignored) {
                        Thread.currentThread().interrupt();
                    }

                    System.out.println(String.format(
                            Locale.US,
                            "ONTRACK_INJECT|attempt|rate=%d|samples=%d|total_written=%d|freq_hz=%.1f|duration_ms=%d|underruns=%d|play_state=%d",
                            rate,
                            tone.length,
                            totalWritten,
                            FREQ_HZ,
                            DURATION_MS,
                            track.getUnderrunCount(),
                            track.getPlayState()));

                    if (totalWritten > 0 && lastError >= 0) {
                        System.out.println(
                                "ONTRACK_INJECT|result=written"
                                        + "|rate=" + rate
                                        + "|remote_confirmation_required=true");
                        System.out.println("ONTRACK_INJECT|done");
                        return;
                    }

                } catch (Throwable attemptError) {
                    Throwable root = root(attemptError);
                    String message = safeMessage(root);

                    System.out.println(
                            "ONTRACK_INJECT|attempt|rate=" + rate
                                    + "|error=" + root.getClass().getName()
                                    + ":" + message);
                } finally {
                    if (track != null) {
                        try { track.stop(); } catch (Throwable ignored) {}
                        try { track.flush(); } catch (Throwable ignored) {}
                        try { track.release(); } catch (Throwable ignored) {}
                    }
                }
            }

            System.out.println(
                    "ONTRACK_INJECT|result=all_attempts_failed"
                            + "|last_error=" + lastError);

        } catch (Throwable error) {
            Throwable root = root(error);

            System.out.println(
                    "ONTRACK_INJECT|error="
                            + root.getClass().getName()
                            + ":" + safeMessage(root));
        } finally {
            System.out.println("ONTRACK_INJECT|done");
        }
    }

    private static short[] makeTone(int rate) {
        int count = rate * DURATION_MS / 1000;
        short[] pcm = new short[count];

        int fade = Math.max(1, rate * 30 / 1000);

        for (int i = 0; i < count; i++) {
            double env = 1.0;

            if (i < fade) {
                env = (double) i / fade;
            } else if (i > count - fade) {
                env = (double) (count - i) / fade;
            }

            double phase = 2.0 * Math.PI * FREQ_HZ * i / rate;
            pcm[i] = (short) Math.round(
                    Math.sin(phase) * AMPLITUDE * env);
        }

        return pcm;
    }

    private static Context createShellContext() throws Exception {
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
        } catch (Throwable ignored) {}
    }

    private static Throwable root(Throwable error) {
        Throwable root = error;

        while (root.getCause() != null
                && root.getCause() != root) {
            root = root.getCause();
        }

        return root;
    }

    private static String safeMessage(Throwable error) {
        String message = error.getMessage();
        if (message == null) message = "";

        return message
                .replace('|', '/')
                .replace('\n', ' ')
                .replace('\r', ' ');
    }
}
