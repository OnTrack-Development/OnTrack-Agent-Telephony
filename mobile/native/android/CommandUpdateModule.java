package com.ontrackdevelopment.command.update;

import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.os.Environment;
import android.provider.Settings;
import androidx.core.content.FileProvider;
import com.facebook.react.bridge.*;
import com.facebook.react.modules.core.DeviceEventManagerModule;
import java.io.*;
import java.net.*;
import java.security.MessageDigest;
import java.util.Locale;

public final class CommandUpdateModule extends ReactContextBaseJavaModule implements LifecycleEventListener {
    private final ReactApplicationContext context;
    private static final String HOST = "agent.ontrackegy.com";
    private static final long MAX_BYTES = 105L * 1024 * 1024;
    private volatile boolean downloading = false;
    private volatile String pendingPath = "";
    private volatile String pendingSha = "";

    public CommandUpdateModule(ReactApplicationContext ctx) {
        super(ctx);
        context = ctx;
        ctx.addLifecycleEventListener(this);
    }
    @Override public String getName() { return "CommandUpdateInstaller"; }

    private void progress(long written, long total) {
        WritableMap map = Arguments.createMap();
        map.putDouble("written", written);
        map.putDouble("total", total);
        context.getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter.class).emit("commandUpdateProgress", map);
    }

    private static String sha256(File apk) throws Exception {
        MessageDigest md = MessageDigest.getInstance("SHA-256");
        try (InputStream in = new FileInputStream(apk)) {
            byte[] bytes = new byte[32768]; int read;
            while ((read = in.read(bytes)) >= 0) if (read > 0) md.update(bytes, 0, read);
        }
        StringBuilder s = new StringBuilder(64);
        for (byte b : md.digest()) s.append(String.format(Locale.US, "%02x", b & 255));
        return s.toString();
    }

    @ReactMethod public void downloadAndInstall(String link, String checksum, String version, Promise promise) {
        if (downloading) { promise.reject("BUSY", "Update download is already running"); return; }
        final String fileName = "WHMCS-v" + version + "-ARM64-release-signed.apk";
        final Uri remote = Uri.parse(link);
        if (!version.matches("[0-9]+\\.[0-9]+\\.[0-9]+")
           || !checksum.matches("(?i)[0-9a-f]{64}")
           || !"https".equals(remote.getScheme())
           || !HOST.equals(remote.getHost())
           || !("/downloads/" + fileName).equals(remote.getEncodedPath())
           || remote.getPort() != -1 || remote.getQuery() != null || remote.getFragment() != null) {
            promise.reject("INVALID_UPDATE", "Update must be a signed release from agent.ontrackegy.com");
            return;
        }
        downloading = true;
        new Thread(() -> {
            HttpURLConnection connection = null;
            File partial = null;
            try {
                File dir = new File(context.getCacheDir(), "updates");
                if (!dir.isDirectory() && !dir.mkdirs()) throw new IOException("Cannot create update cache");
                File apk = new File(dir, fileName);
                if (!apk.isFile() || !checksum.equalsIgnoreCase(sha256(apk))) {
                    partial = new File(dir, fileName + ".part");
                    connection = (HttpURLConnection) new URL(link).openConnection();
                    connection.setInstanceFollowRedirects(false);
                    connection.setConnectTimeout(15000);
                    connection.setReadTimeout(30000);
                    connection.setRequestProperty("Accept", "application/vnd.android.package-archive");
                    if (connection.getResponseCode() != 200) throw new IOException("APK HTTP " + connection.getResponseCode());
                    long len = connection.getContentLengthLong();
                    if (len > MAX_BYTES) throw new IOException("APK file exceeds size limit");
                    long written = 0L;
                    try (InputStream in = connection.getInputStream(); OutputStream out = new FileOutputStream(partial)) {
                        byte[] buffer = new byte[32768]; int count;
                        while ((count = in.read(buffer)) >= 0) {
                            if (count == 0) continue;
                            written += count;
                            if (written > MAX_BYTES) throw new IOException("APK file exceeds size limit");
                            out.write(buffer, 0, count);
                            if (written % 262144 < count) progress(written, len);
                        }
                        out.flush();
                    }
                    if (len > 0 && written != len) throw new IOException("Incomplete APK download");
                    if (!checksum.equalsIgnoreCase(sha256(partial))) throw new SecurityException("APK SHA256 mismatch");
                    if (apk.exists() && !apk.delete()) throw new IOException("Cannot replace cached APK");
                    if (!partial.renameTo(apk)) throw new IOException("Cannot finalize APK download");
                }
                progress(apk.length(), apk.length());
                pendingPath = apk.getAbsolutePath();
                pendingSha = checksum;
                context.runOnUiQueueThread(() -> {
                    try { launchInstaller(apk); promise.resolve(true); }
                    catch (Exception e) { promise.reject("INSTALLER", e.getMessage(), e); }
                });
            } catch (Exception e) {
                if (partial != null) partial.delete();
                promise.reject("DOWNLOAD_FAILED", e.getMessage(), e);
            } finally {
                if (connection != null) connection.disconnect();
                downloading = false;
            }
        }, "CommandApkDownload").start();
    }

    private void launchInstaller(File apk) throws Exception {
        if (!apk.isFile() || !apk.getCanonicalPath().startsWith(new File(context.getCacheDir(), "updates").getCanonicalPath() + File.separator)) {
            throw new SecurityException("Untrusted APK path");
        }
        if (Build.VERSION.SDK_INT >= 26 && !context.getPackageManager().canRequestPackageInstalls()) {
            Intent settings = new Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES,
              Uri.parse("package:" + context.getPackageName()));
            settings.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            context.startActivity(settings);
            return;
        }
        Uri content = FileProvider.getUriForFile(context,
          context.getPackageName() + ".commandupdateprovider", apk);
        Intent intent = new Intent(Intent.ACTION_VIEW);
        intent.setDataAndType(content, "application/vnd.android.package-archive");
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_GRANT_READ_URI_PERMISSION);
        context.startActivity(intent);
        pendingPath = "";
        pendingSha = "";
    }

    @Override public void onHostResume() {
        if (pendingPath.isEmpty()) return;
        String path = pendingPath, hash = pendingSha;
        if (Build.VERSION.SDK_INT >= 26 && !context.getPackageManager().canRequestPackageInstalls()) return;
        new Thread(() -> {
            try {
                File f = new File(path);
                if (!f.isFile() || !hash.equalsIgnoreCase(sha256(f))) return;
                context.runOnUiQueueThread(() -> {
                    try { launchInstaller(f); } catch (Exception ignored) {}
                });
            } catch (Exception ignored) {}
        }, "ResumeCommandApkInstall").start();
    }
    @Override public void onHostPause() {}
    @Override public void onHostDestroy() {}
}
