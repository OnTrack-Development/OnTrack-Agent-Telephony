package com.ontrack.agentphone;

import android.content.Context;
import android.media.AudioAttributes;
import android.media.AudioDeviceInfo;
import android.media.AudioFormat;
import android.media.AudioManager;
import android.media.AudioTrack;
import android.os.Looper;
import android.os.Process;

import java.lang.reflect.Method;
import java.util.Arrays;

/**
 * Generic PSTN uplink injection probe.
 *
 * Runs only through the local ADB bootstrap as uid=2000(shell).
 * No handset model table is used: the probe queries the active Android
 * TELEPHONY_TX device and builds formats only from capabilities advertised
 * by that device.
 */
public final class ShellUplinkInjectionProbe {
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
            AudioManager audio =
                    (AudioManager) context.getSystemService(Context.AUDIO_SERVICE);

            if (audio == null) {
                throw new IllegalStateException("AudioManager unavailable");
            }

            System.out.println("ONTRACK_INJECT|mode=" + audio.getMode()
                    + "|package=" + context.getPackageName()
                    + "|op_package=" + context.getOpPackageName());

            Method interceptableMethod =
                    AudioManager.class.getDeclaredMethod("isPstnCallAudioInterceptable");
            interceptableMethod.setAccessible(true);

            boolean interceptable =
                    (Boolean) interceptableMethod.invoke(audio);

            System.out.println(
                    "ONTRACK_INJECT|pstn_interceptable=" + interceptable);

            if (!interceptable) {
                System.out.println(
                        "ONTRACK_INJECT|result=unsupported|reason=pstn_not_interceptable");
                return;
            }

            AudioDeviceInfo telephonyTx = findTelephonyTx(audio);

            if (telephonyTx == null) {
                System.out.println(
                        "ONTRACK_INJECT|result=unsupported|reason=telephony_tx_not_exposed");
                return;
            }

            int[] rates = telephonyTx.getSampleRates();
            int[] channelCounts = telephonyTx.getChannelCounts();
            int[] encodings = telephonyTx.getEncodings();

            System.out.println(
                    "ONTRACK_INJECT|telephony_tx"
                            + "|id=" + telephonyTx.getId()
                            + "|rates=" + compact(rates)
                            + "|channels=" + compact(channelCounts)
                            + "|encodings=" + compact(encodings));

            if (rates == null || rates.length == 0) {
                System.out.println(
                        "ONTRACK_INJECT|result=unsupported|reason=no_advertised_tx_sample_rates");
                return;
            }

            if (channelCounts == null || channelCounts.length == 0) {
                System.out.println(
                        "ONTRACK_INJECT|result=unsupported|reason=no_advertised_tx_channel_counts");
                return;
            }

            if (!contains(encodings, AudioFormat.ENCODING_PCM_16BIT)) {
                System.out.println(
                        "ONTRACK_INJECT|result=unsupported|reason=pcm16_not_advertised_by_tx");
                return;
            }

            int lastError = 0;
            int attempts = 0;

            // Use exactly what TELEPHONY_TX advertises. Prefer higher rates first
            // because the Android audio policy commonly exposes telephony TX at
            // 48 kHz / 44.1 kHz even when the modem voice codec is narrowband.
            int[] orderedRates = preferredRates(rates);

            for (int rate : orderedRates) {
                if (rate < 8000 || rate > 48000) {
                    continue;
                }

                for (int channels : channelCounts) {
                    if (channels != 1 && channels != 2) {
                        continue;
                    }

                    attempts++;
                    AudioTrack track = null;
                    int attemptError = 0;

                    try {
                        int channelMask = channels == 2
                                ? AudioFormat.CHANNEL_OUT_STEREO
                                : AudioFormat.CHANNEL_OUT_MONO;

                        AudioFormat format = new AudioFormat.Builder()
                                .setSampleRate(rate)
                                .setEncoding(AudioFormat.ENCODING_PCM_16BIT)
                                .setChannelMask(channelMask)
                                .build();

                        track = createShellAttributedTrack(context, format);

                        if (track == null
                                || track.getState() != AudioTrack.STATE_INITIALIZED) {
                            System.out.println(
                                    "ONTRACK_INJECT|attempt"
                                            + "|rate=" + rate
                                            + "|channels=" + channels
                                            + "|initialized=false");
                            continue;
                        }

                        short[] tone = makeTone(rate, channels);

                        System.out.println(
                                "ONTRACK_INJECT|attempt"
                                        + "|rate=" + rate
                                        + "|channels=" + channels
                                        + "|initialized=true"
                                        + "|buffer_frames=" + track.getBufferSizeInFrames()
                                        + "|actual_rate=" + track.getSampleRate()
                                        + "|play_state=" + track.getPlayState());

                        int primeTargetSamples = Math.min(
                                tone.length,
                                Math.max(
                                        160 * channels,
                                        (track.getBufferSizeInFrames() * channels) / 2));

                        int primed = track.write(
                                tone,
                                0,
                                primeTargetSamples,
                                AudioTrack.WRITE_NON_BLOCKING);

                        System.out.println(
                                "ONTRACK_INJECT|attempt"
                                        + "|rate=" + rate
                                        + "|channels=" + channels
                                        + "|prime_written=" + primed);

                        if (primed < 0) {
                            attemptError = primed;
                            lastError = primed;
                            continue;
                        }

                        track.play();

                        int totalWritten = primed;
                        int offset = Math.max(0, primed);
                        long deadline = System.currentTimeMillis() + 2200L;

                        while (offset < tone.length
                                && System.currentTimeMillis() < deadline) {

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
                                    Thread.sleep(10L);
                                } catch (InterruptedException ignored) {
                                    Thread.currentThread().interrupt();
                                    break;
                                }
                                continue;
                            }

                            attemptError = written;
                            lastError = written;

                            System.out.println(
                                    "ONTRACK_INJECT|attempt"
                                            + "|rate=" + rate
                                            + "|channels=" + channels
                                            + "|stream_write_error=" + written
                                            + "|state=" + track.getState()
                                            + "|play_state=" + track.getPlayState());
                            break;
                        }

                        try {
                            Thread.sleep(DURATION_MS + 150L);
                        } catch (InterruptedException ignored) {
                            Thread.currentThread().interrupt();
                        }

                        System.out.println(
                                "ONTRACK_INJECT|attempt"
                                        + "|rate=" + rate
                                        + "|channels=" + channels
                                        + "|samples=" + tone.length
                                        + "|total_written=" + totalWritten
                                        + "|attempt_error=" + attemptError
                                        + "|underruns=" + track.getUnderrunCount()
                                        + "|play_state=" + track.getPlayState());

                        if (offset >= tone.length && attemptError >= 0) {
                            System.out.println(
                                    "ONTRACK_INJECT|result=written"
                                            + "|rate=" + rate
                                            + "|channels=" + channels
                                            + "|remote_confirmation_required=true");
                            return;
                        }

                    } catch (Throwable attemptFailure) {
                        Throwable root = root(attemptFailure);

                        System.out.println(
                                "ONTRACK_INJECT|attempt"
                                        + "|rate=" + rate
                                        + "|channels=" + channels
                                        + "|error=" + root.getClass().getName()
                                        + ":" + safeMessage(root));
                    } finally {
                        if (track != null) {
                            try { track.stop(); } catch (Throwable ignored) {}
                            try { track.flush(); } catch (Throwable ignored) {}
                            try { track.release(); } catch (Throwable ignored) {}
                        }
                    }
                }
            }

            System.out.println(
                    "ONTRACK_INJECT|call_assistant_failed"
                            + "|attempts=" + attempts
                            + "|last_error=" + lastError);

            boolean incallMusicWorked = runInCallMusicFallback(
                    context,
                    telephonyTx,
                    orderedRates,
                    channelCounts);

            if (incallMusicWorked) {
                return;
            }

            System.out.println(
                    "ONTRACK_INJECT|result=all_framework_routes_failed"
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

    private static boolean runInCallMusicFallback(
            Context context,
            AudioDeviceInfo telephonyTx,
            int[] orderedRates,
            int[] channelCounts) {

        System.out.println("ONTRACK_INJECT|incall_music|begin=true");

        for (int rate : orderedRates) {
            if (rate < 8000 || rate > 48000) continue;

            for (int channels : channelCounts) {
                if (channels != 1 && channels != 2) continue;

                AudioTrack track = null;

                try {
                    int channelMask = channels == 2
                            ? AudioFormat.CHANNEL_OUT_STEREO
                            : AudioFormat.CHANNEL_OUT_MONO;

                    AudioFormat format = new AudioFormat.Builder()
                            .setSampleRate(rate)
                            .setEncoding(AudioFormat.ENCODING_PCM_16BIT)
                            .setChannelMask(channelMask)
                            .build();

                    AudioAttributes attributes =
                            new AudioAttributes.Builder()
                                    .setUsage(AudioAttributes.USAGE_VOICE_COMMUNICATION)
                                    .setContentType(AudioAttributes.CONTENT_TYPE_SPEECH)
                                    .build();

                    track = new AudioTrack.Builder()
                            .setContext(context)
                            .setAudioAttributes(attributes)
                            .setAudioFormat(format)
                            .build();

                    if (track.getState() != AudioTrack.STATE_INITIALIZED) {
                        System.out.println(
                                "ONTRACK_INJECT|incall_music_attempt"
                                        + "|rate=" + rate
                                        + "|channels=" + channels
                                        + "|initialized=false");
                        continue;
                    }

                    boolean preferred =
                            track.setPreferredDevice(telephonyTx);

                    System.out.println(
                            "ONTRACK_INJECT|incall_music_attempt"
                                    + "|rate=" + rate
                                    + "|channels=" + channels
                                    + "|preferred_device_set=" + preferred
                                    + "|buffer_frames=" + track.getBufferSizeInFrames());

                    if (!preferred) {
                        continue;
                    }

                    short[] tone = makeTone(rate, channels);

                    int primeTargetSamples = Math.min(
                            tone.length,
                            Math.max(
                                    160 * channels,
                                    (track.getBufferSizeInFrames() * channels) / 2));

                    int primed = track.write(
                            tone,
                            0,
                            primeTargetSamples,
                            AudioTrack.WRITE_NON_BLOCKING);

                    System.out.println(
                            "ONTRACK_INJECT|incall_music_attempt"
                                    + "|rate=" + rate
                                    + "|channels=" + channels
                                    + "|prime_written=" + primed);

                    if (primed < 0) {
                        continue;
                    }

                    track.play();

                    try {
                        Thread.sleep(80L);
                    } catch (InterruptedException ignored) {
                        Thread.currentThread().interrupt();
                    }

                    AudioDeviceInfo routed = null;
                    try { routed = track.getRoutedDevice(); } catch (Throwable ignored) {}

                    System.out.println(
                            "ONTRACK_INJECT|incall_music_attempt"
                                    + "|rate=" + rate
                                    + "|channels=" + channels
                                    + "|routed_id=" + (routed == null ? -1 : routed.getId())
                                    + "|routed_type=" + (routed == null ? -1 : routed.getType()));

                    int offset = Math.max(0, primed);
                    int totalWritten = primed;
                    int error = 0;
                    long deadline = System.currentTimeMillis() + 2200L;

                    while (offset < tone.length
                            && System.currentTimeMillis() < deadline) {

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
                                Thread.sleep(10L);
                            } catch (InterruptedException ignored) {
                                Thread.currentThread().interrupt();
                                break;
                            }
                            continue;
                        }

                        error = written;
                        break;
                    }

                    System.out.println(
                            "ONTRACK_INJECT|incall_music_attempt"
                                    + "|rate=" + rate
                                    + "|channels=" + channels
                                    + "|total_written=" + totalWritten
                                    + "|error=" + error
                                    + "|play_state=" + track.getPlayState());

                    if (offset >= tone.length && error >= 0) {
                        System.out.println(
                                "ONTRACK_INJECT|result=incall_music_written"
                                        + "|rate=" + rate
                                        + "|channels=" + channels
                                        + "|remote_confirmation_required=true");
                        return true;
                    }

                } catch (Throwable failure) {
                    Throwable root = root(failure);
                    System.out.println(
                            "ONTRACK_INJECT|incall_music_attempt"
                                    + "|rate=" + rate
                                    + "|channels=" + channels
                                    + "|error=" + root.getClass().getName()
                                    + ":" + safeMessage(root));
                } finally {
                    if (track != null) {
                        try { track.stop(); } catch (Throwable ignored) {}
                        try { track.flush(); } catch (Throwable ignored) {}
                        try { track.release(); } catch (Throwable ignored) {}
                    }
                }
            }
        }

        System.out.println("ONTRACK_INJECT|incall_music|result=failed");
        return false;
    }

    private static AudioDeviceInfo findTelephonyTx(AudioManager audio) {
        AudioDeviceInfo[] devices =
                audio.getDevices(AudioManager.GET_DEVICES_OUTPUTS);

        if (devices == null) return null;

        for (AudioDeviceInfo device : devices) {
            if (device != null
                    && device.getType() == AudioDeviceInfo.TYPE_TELEPHONY
                    && device.isSink()) {
                return device;
            }
        }

        return null;
    }

    private static AudioTrack createShellAttributedTrack(
            Context context,
            AudioFormat format) throws Exception {

        AudioAttributes.Builder attributes =
                new AudioAttributes.Builder();

        Method setSystemUsage =
                AudioAttributes.Builder.class.getDeclaredMethod(
                        "setSystemUsage",
                        int.class);
        setSystemUsage.setAccessible(true);

        // AudioAttributes.USAGE_CALL_ASSISTANT
        setSystemUsage.invoke(attributes, 17);

        AudioTrack.Builder builder =
                new AudioTrack.Builder()
                        .setContext(context)
                        .setAudioAttributes(
                                attributes
                                        .setContentType(
                                                AudioAttributes.CONTENT_TYPE_SPEECH)
                                        .build())
                        .setAudioFormat(format);

        Method setCallMode =
                AudioTrack.Builder.class.getDeclaredMethod(
                        "setCallRedirectionMode",
                        int.class);
        setCallMode.setAccessible(true);

        // AudioManager.CALL_REDIRECT_PSTN
        setCallMode.invoke(builder, 1);

        return builder.build();
    }

    private static int[] preferredRates(int[] advertised) {
        int[] copy = advertised == null
                ? new int[0]
                : Arrays.copyOf(advertised, advertised.length);

        // Small array; deterministic descending order avoids vendor/model tables.
        for (int i = 0; i < copy.length; i++) {
            for (int j = i + 1; j < copy.length; j++) {
                if (copy[j] > copy[i]) {
                    int t = copy[i];
                    copy[i] = copy[j];
                    copy[j] = t;
                }
            }
        }

        return copy;
    }

    private static short[] makeTone(int rate, int channels) {
        int frames = rate * DURATION_MS / 1000;
        short[] pcm = new short[frames * channels];

        int fadeFrames = Math.max(1, rate * 30 / 1000);

        for (int frame = 0; frame < frames; frame++) {
            double env = 1.0;

            if (frame < fadeFrames) {
                env = (double) frame / fadeFrames;
            } else if (frame > frames - fadeFrames) {
                env = (double) (frames - frame) / fadeFrames;
            }

            double phase =
                    2.0 * Math.PI * FREQ_HZ * frame / rate;

            short sample = (short) Math.round(
                    Math.sin(phase) * AMPLITUDE * env);

            int base = frame * channels;
            for (int channel = 0; channel < channels; channel++) {
                pcm[base + channel] = sample;
            }
        }

        return pcm;
    }

    private static boolean contains(int[] values, int target) {
        if (values == null) return false;

        for (int value : values) {
            if (value == target) return true;
        }

        return false;
    }

    private static String compact(int[] values) {
        if (values == null) return "[]";
        return Arrays.toString(values).replace(" ", "");
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
                            "Landroid/media/AudioManager;",
                            "Landroid/media/AudioTrack$Builder;",
                            "Landroid/media/AudioAttributes$Builder;"
                    });
        } catch (Throwable ignored) {}
    }

    private static Throwable root(Throwable error) {
        Throwable value = error;

        while (value.getCause() != null
                && value.getCause() != value) {
            value = value.getCause();
        }

        return value;
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
