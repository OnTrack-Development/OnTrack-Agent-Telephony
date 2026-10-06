package com.ontrack.agentphone;

import android.Manifest;
import android.content.Context;
import android.content.pm.PackageManager;
import android.media.AudioDeviceInfo;
import android.media.AudioManager;
import android.os.Build;
import android.os.Looper;
import android.os.Process;

import java.lang.reflect.Method;
import java.util.Arrays;

/**
 * Generic device capability inspector. Runs as uid=2000(shell).
 * It only queries Android/framework state; it does not modify audio routing.
 */
public final class ShellAudioCapabilityProbe {
    private ShellAudioCapabilityProbe() {}

    public static void main(String[] args) {
        try {
            relaxHiddenApiChecks();

            Context context = createShellContext();
            AudioManager audio =
                    (AudioManager) context.getSystemService(Context.AUDIO_SERVICE);

            System.out.println("ONTRACK_CAP|identity"
                    + "|uid=" + Process.myUid()
                    + "|pid=" + Process.myPid()
                    + "|manufacturer=" + clean(Build.MANUFACTURER)
                    + "|brand=" + clean(Build.BRAND)
                    + "|model=" + clean(Build.MODEL)
                    + "|device=" + clean(Build.DEVICE)
                    + "|sdk=" + Build.VERSION.SDK_INT
                    + "|release=" + clean(Build.VERSION.RELEASE));

            System.out.println("ONTRACK_CAP|context"
                    + "|package=" + clean(context.getPackageName())
                    + "|op_package=" + clean(context.getOpPackageName())
                    + "|app_uid=" + context.getApplicationInfo().uid);

            permission(context, "android.permission.CALL_AUDIO_INTERCEPTION");
            permission(context, "android.permission.MODIFY_AUDIO_ROUTING");
            permission(context, "android.permission.MODIFY_AUDIO_SETTINGS_PRIVILEGED");
            permission(context, "android.permission.CAPTURE_AUDIO_OUTPUT");
            permission(context, "android.permission.CAPTURE_VOICE_COMMUNICATION_OUTPUT");
            permission(context, Manifest.permission.RECORD_AUDIO);

            if (audio == null) {
                System.out.println("ONTRACK_CAP|audio_manager=missing");
                System.out.println("ONTRACK_CAP|done");
                return;
            }

            System.out.println("ONTRACK_CAP|audio"
                    + "|mode=" + audio.getMode()
                    + "|music_active=" + audio.isMusicActive());

            boolean telephonyInput = false;
            boolean telephonyOutput = false;

            AudioDeviceInfo[] devices =
                    audio.getDevices(AudioManager.GET_DEVICES_ALL);

            for (AudioDeviceInfo device : devices) {
                if (device.getType() != AudioDeviceInfo.TYPE_TELEPHONY) {
                    continue;
                }

                if (device.isSource()) telephonyInput = true;
                if (device.isSink()) telephonyOutput = true;

                System.out.println("ONTRACK_CAP|telephony_device"
                        + "|id=" + device.getId()
                        + "|source=" + device.isSource()
                        + "|sink=" + device.isSink()
                        + "|product=" + clean(String.valueOf(device.getProductName()))
                        + "|sample_rates=" + ints(device.getSampleRates())
                        + "|channel_counts=" + ints(device.getChannelCounts())
                        + "|encodings=" + ints(device.getEncodings()));
            }

            System.out.println("ONTRACK_CAP|telephony_summary"
                    + "|rx_input=" + telephonyInput
                    + "|tx_output=" + telephonyOutput);

            try {
                Method method =
                        AudioManager.class.getDeclaredMethod(
                                "isPstnCallAudioInterceptable");
                method.setAccessible(true);

                Object value = method.invoke(audio);

                System.out.println(
                        "ONTRACK_CAP|pstn_interceptable=" + value);
            } catch (Throwable error) {
                System.out.println(
                        "ONTRACK_CAP|pstn_interceptable_error="
                                + root(error).getClass().getName()
                                + ":" + clean(message(root(error))));
            }

        } catch (Throwable error) {
            Throwable root = root(error);
            System.out.println(
                    "ONTRACK_CAP|fatal="
                            + root.getClass().getName()
                            + ":" + clean(message(root)));
        } finally {
            System.out.println("ONTRACK_CAP|done");
        }
    }

    private static void permission(Context context, String permission) {
        int result = context.checkPermission(
                permission,
                Process.myPid(),
                Process.myUid());

        System.out.println("ONTRACK_CAP|permission"
                + "|name=" + permission
                + "|granted="
                + (result == PackageManager.PERMISSION_GRANTED));
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
        Throwable value = error;
        while (value.getCause() != null
                && value.getCause() != value) {
            value = value.getCause();
        }
        return value;
    }

    private static String message(Throwable error) {
        return error.getMessage() == null ? "" : error.getMessage();
    }

    private static String clean(String value) {
        if (value == null) return "";
        return value
                .replace('|', '/')
                .replace('\n', ' ')
                .replace('\r', ' ');
    }

    private static String ints(int[] values) {
        return values == null ? "[]" : Arrays.toString(values).replace(" ", "");
    }
}
