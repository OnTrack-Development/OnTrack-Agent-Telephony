package com.ontrack.agentphone;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageInfo;
import android.net.Uri;
import android.os.Build;
import android.os.Environment;
import android.os.Handler;
import android.provider.Settings;
import android.util.Log;

import androidx.core.content.FileProvider;

import org.json.JSONObject;

import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.security.MessageDigest;
import java.util.Locale;

final class UpdateManager {
    private static final String TAG = "OnTrackUpdate";
    private static final String CHANNEL = "ontrack_updates";
    private static final int NOTIFICATION_ID = 3301;
    private static final long CHECK_INTERVAL_MS = 6L * 60L * 60L * 1000L;
    private static final String GITHUB_RAW_BASE =
            "https://raw.githubusercontent.com/OnTrack-Development/OnTrack-Agent-Telephony/main/web/downloads/";
    private static final String GITHUB_LATEST_URL =
            GITHUB_RAW_BASE + "latest.json";

    interface Callback {
        void done(Result result);
    }

    static final class Result {
        final boolean ok;
        final boolean updateAvailable;
        final boolean downloaded;
        final String versionName;
        final String message;
        final File apk;

        Result(boolean ok, boolean updateAvailable, boolean downloaded,
               String versionName, String message, File apk) {
            this.ok = ok;
            this.updateAvailable = updateAvailable;
            this.downloaded = downloaded;
            this.versionName = versionName;
            this.message = message;
            this.apk = apk;
        }
    }

    private UpdateManager() {}

    static void checkInBackground(Context context, boolean force, Callback callback) {
        Context app = context.getApplicationContext();

        new Thread(() -> {
            Result result;
            try {
                if (!force) {
                    long last = AppState.prefs(app).getLong("update_checked_at", 0L);
                    if (System.currentTimeMillis() - last < CHECK_INTERVAL_MS) {
                        result = new Result(true, false, false, "", "Checked recently", null);
                        deliver(callback, result);
                        return;
                    }
                }

                AppState.prefs(app).edit()
                        .putLong("update_checked_at", System.currentTimeMillis())
                        .apply();

                result = checkAndDownload(app);

                if (result.updateAvailable && result.downloaded && result.apk != null) {
                    notifyUpdateReady(app, result);
                }

            } catch (Exception error) {
                Log.w(TAG, "Update check failed", error);
                result = new Result(false, false, false, "", error.getMessage(), null);
            }

            deliver(callback, result);
        }, "OnTrackUpdateCheck").start();
    }

    private static Result checkAndDownload(Context context) throws Exception {
        String base = AppState.server(context);

        JSONObject platformLatest = null;
        Exception platformError = null;

        try {
            platformLatest = ApiClient.get(
                    base,
                    "/api/app/latest.php",
                    null);
        } catch (Exception error) {
            platformError = error;
            Log.w(TAG, "Platform update metadata unavailable", error);
        }

        JSONObject githubLatest = null;
        Exception githubError = null;

        try {
            githubLatest = getJson(GITHUB_LATEST_URL);
        } catch (Exception error) {
            githubError = error;
            Log.w(TAG, "GitHub update metadata unavailable", error);
        }

        JSONObject latest = chooseNewest(
                platformLatest,
                githubLatest);

        if (latest == null) {
            if (platformError != null) throw platformError;
            if (githubError != null) throw githubError;
            throw new IllegalStateException(
                    "No update metadata source is available");
        }

        int latestCode = latest.optInt("version_code", 0);
        String latestName = latest.optString("version_name", "");
        String downloadUrl = latest.optString("download_url", "");

        if (downloadUrl.isEmpty()) {
            String filename = latest.optString("filename", "");
            if (!filename.isEmpty()) {
                downloadUrl = GITHUB_RAW_BASE + filename;
            }
        }

        String expectedSha =
                latest.optString("sha256", "")
                        .toLowerCase(Locale.ROOT);

        int currentCode = currentVersionCode(context);

        if (latestCode <= currentCode) {
            return new Result(
                    true, false, false, latestName,
                    "OnTrack AI Phone is up to date", null);
        }

        if (!downloadUrl.startsWith("https://")) {
            throw new IllegalStateException("Invalid update URL");
        }

        if (expectedSha.length() != 64) {
            throw new IllegalStateException("Missing update checksum");
        }

        File root = new File(
                context.getExternalFilesDir(Environment.DIRECTORY_DOWNLOADS),
                "updates");

        if (!root.exists() && !root.mkdirs()) {
            throw new IllegalStateException("Cannot create update directory");
        }

        File apk = new File(root, "OnTrack-AI-Phone-v" + latestName + ".apk");

        if (!apk.exists() || !expectedSha.equalsIgnoreCase(sha256(apk))) {
            download(downloadUrl, apk);
        }

        String actualSha = sha256(apk);

        if (!expectedSha.equalsIgnoreCase(actualSha)) {
            apk.delete();
            throw new SecurityException("Downloaded APK checksum does not match");
        }

        return new Result(
                true, true, true, latestName,
                "Update v" + latestName + " is ready to install", apk);
    }

    private static JSONObject chooseNewest(
            JSONObject first,
            JSONObject second) {

        if (first == null) return second;
        if (second == null) return first;

        int firstCode = first.optInt("version_code", 0);
        int secondCode = second.optInt("version_code", 0);

        return secondCode > firstCode ? second : first;
    }

    private static JSONObject getJson(String urlValue)
            throws Exception {

        HttpURLConnection connection =
                (HttpURLConnection)new URL(urlValue).openConnection();

        connection.setConnectTimeout(15000);
        connection.setReadTimeout(20000);
        connection.setRequestProperty(
                "Accept",
                "application/json");
        connection.setUseCaches(false);

        int code = connection.getResponseCode();

        if (code < 200 || code >= 300) {
            throw new IllegalStateException(
                    "Update metadata HTTP " + code);
        }

        try (InputStream input = connection.getInputStream()) {
            java.io.ByteArrayOutputStream out =
                    new java.io.ByteArrayOutputStream();

            byte[] buffer = new byte[8192];
            int count;

            while ((count = input.read(buffer)) >= 0) {
                if (count > 0) {
                    out.write(buffer, 0, count);
                }
            }

            return new JSONObject(
                    out.toString("UTF-8"));
        } finally {
            connection.disconnect();
        }
    }

    static void install(Context context, File apk) {
        if (apk == null || !apk.exists()) return;

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O
                && !context.getPackageManager().canRequestPackageInstalls()) {

            AppState.prefs(context).edit()
                    .putString("pending_update_install", apk.getAbsolutePath())
                    .apply();

            Intent settings = new Intent(
                    Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES,
                    Uri.parse("package:" + context.getPackageName()));
            settings.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            context.startActivity(settings);
            return;
        }

        Uri uri = FileProvider.getUriForFile(
                context,
                context.getPackageName() + ".fileprovider",
                apk);

        Intent install = new Intent(Intent.ACTION_VIEW);
        install.setDataAndType(uri, "application/vnd.android.package-archive");
        install.addFlags(
                Intent.FLAG_ACTIVITY_NEW_TASK |
                Intent.FLAG_GRANT_READ_URI_PERMISSION);
        context.startActivity(install);
    }

    static void resumePendingInstall(Context context) {
        String path = AppState.prefs(context).getString("pending_update_install", "");
        if (path == null || path.isEmpty()) return;

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O
                && !context.getPackageManager().canRequestPackageInstalls()) {
            return;
        }

        AppState.prefs(context).edit().remove("pending_update_install").apply();

        File apk = new File(path);
        if (apk.exists()) install(context, apk);
    }

    static File newestDownloadedApk(Context context) {
        File root = new File(
                context.getExternalFilesDir(Environment.DIRECTORY_DOWNLOADS),
                "updates");

        File[] files = root.listFiles((dir, name) -> name.endsWith(".apk"));
        if (files == null || files.length == 0) return null;

        File newest = files[0];
        for (File file : files) {
            if (file.lastModified() > newest.lastModified()) newest = file;
        }
        return newest;
    }

    private static int currentVersionCode(Context context) throws Exception {
        PackageInfo info = context.getPackageManager()
                .getPackageInfo(context.getPackageName(), 0);

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
            return (int)Math.min(Integer.MAX_VALUE, info.getLongVersionCode());
        }

        return info.versionCode;
    }

    private static void download(String urlValue, File target) throws Exception {
        HttpURLConnection connection =
                (HttpURLConnection)new URL(urlValue).openConnection();

        connection.setConnectTimeout(15000);
        connection.setReadTimeout(30000);
        connection.setRequestProperty("Accept", "application/vnd.android.package-archive");

        int code = connection.getResponseCode();
        if (code < 200 || code >= 300) {
            throw new IllegalStateException("Update download HTTP " + code);
        }

        File temp = new File(target.getParentFile(), target.getName() + ".part");

        try (InputStream input = connection.getInputStream();
             FileOutputStream output = new FileOutputStream(temp)) {

            byte[] buffer = new byte[16 * 1024];
            int count;

            while ((count = input.read(buffer)) >= 0) {
                if (count > 0) output.write(buffer, 0, count);
            }
        }

        if (target.exists()) target.delete();

        if (!temp.renameTo(target)) {
            throw new IllegalStateException("Could not finalize downloaded update");
        }
    }

    private static String sha256(File file) throws Exception {
        MessageDigest digest = MessageDigest.getInstance("SHA-256");

        try (FileInputStream input = new FileInputStream(file)) {
            byte[] buffer = new byte[16 * 1024];
            int count;

            while ((count = input.read(buffer)) >= 0) {
                if (count > 0) digest.update(buffer, 0, count);
            }
        }

        StringBuilder out = new StringBuilder();

        for (byte value : digest.digest()) {
            out.append(String.format(Locale.US, "%02x", value & 0xff));
        }

        return out.toString();
    }

    private static void notifyUpdateReady(Context context, Result result) {
        createChannel(context);

        Intent installIntent = new Intent(context, UpdateInstallActivity.class);
        installIntent.putExtra("apk_path", result.apk.getAbsolutePath());

        PendingIntent pending = PendingIntent.getActivity(
                context,
                3302,
                installIntent,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);

        Notification.Builder builder = Build.VERSION.SDK_INT >= Build.VERSION_CODES.O
                ? new Notification.Builder(context, CHANNEL)
                : new Notification.Builder(context);

        Notification notification = builder
                .setSmallIcon(R.drawable.ic_stat_ontrack)
                .setContentTitle("OnTrack AI Phone update ready")
                .setContentText("Version " + result.versionName + " downloaded. Tap to install.")
                .setContentIntent(pending)
                .setAutoCancel(true)
                .setPriority(Notification.PRIORITY_DEFAULT)
                .build();

        NotificationManager manager =
                (NotificationManager)context.getSystemService(Context.NOTIFICATION_SERVICE);

        if (manager != null) manager.notify(NOTIFICATION_ID, notification);
    }

    private static void createChannel(Context context) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;

        NotificationManager manager =
                (NotificationManager)context.getSystemService(Context.NOTIFICATION_SERVICE);

        if (manager == null) return;

        NotificationChannel channel = new NotificationChannel(
                CHANNEL,
                "App updates",
                NotificationManager.IMPORTANCE_DEFAULT);

        channel.setDescription("New OnTrack AI Phone versions");
        manager.createNotificationChannel(channel);
    }

    private static void deliver(Callback callback, Result result) {
        if (callback == null) return;

        new Handler(android.os.Looper.getMainLooper()).post(() ->
                callback.done(result));
    }
}
