package com.ontrack.agentphone;

import android.content.Context;
import android.os.Build;

import org.bouncycastle.asn1.x500.X500Name;
import org.bouncycastle.cert.X509CertificateHolder;
import org.bouncycastle.cert.jcajce.JcaX509v3CertificateBuilder;
import org.bouncycastle.operator.ContentSigner;
import org.bouncycastle.operator.jcajce.JcaContentSignerBuilder;

import java.io.BufferedReader;
import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.InputStreamReader;
import java.io.OutputStream;
import java.math.BigInteger;
import java.net.InetAddress;
import java.nio.charset.StandardCharsets;
import java.security.KeyFactory;
import java.security.KeyPair;
import java.security.KeyPairGenerator;
import java.security.PrivateKey;
import java.security.SecureRandom;
import java.security.cert.Certificate;
import java.security.cert.CertificateFactory;
import java.security.spec.PKCS8EncodedKeySpec;
import java.util.Date;
import java.util.UUID;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;

import io.github.muntashirakon.adb.AbsAdbConnectionManager;
import io.github.muntashirakon.adb.AdbStream;
import io.github.muntashirakon.adb.android.AdbMdns;

/**
 * Local Wireless Debugging bootstrap used only by the SIM Audio Probe.
 *
 * Important: one persistent exec:sh stream is reused for every command.
 * libadb one-shot shell streams can leave half-closed ADB logical streams behind;
 * after several commands adbd starts answering with "Stream closed". Keeping one
 * shell avoids that transport failure and mirrors the proven JemRec approach.
 */
final class LocalAdb {
    private static final String LOOPBACK = "127.0.0.1";
    private static final String PREFS = "ontrack_audio_probe";
    private static final String KEY_PAIRED = "adb_paired";
    private static final Object LOCK = new Object();

    private static ProbeConnectionManager manager;
    private static PersistentShell shell;

    private LocalAdb() {}

    static boolean hasIdentity(Context context) {
        return Identity.exists(context.getApplicationContext());
    }

    static boolean wasPaired(Context context) {
        return context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
                .getBoolean(KEY_PAIRED, false) && hasIdentity(context);
    }

    static String pairAndVerify(Context context, String rawCode) throws Exception {
        Context app = context.getApplicationContext();
        String code = rawCode == null ? "" : rawCode.replaceAll("[^0-9]", "");

        if (code.length() != 6) {
            throw new IllegalArgumentException("Pairing code must be exactly 6 digits");
        }

        int pairingPort = discoverPort(
                app,
                AdbMdns.SERVICE_TYPE_TLS_PAIRING,
                12_000L);

        if (pairingPort <= 0) {
            throw new IllegalStateException(
                    "Pairing service not found. Keep 'Pair device with pairing code' open.");
        }

        synchronized (LOCK) {
            resetTransportLocked(false);

            ProbeConnectionManager mgr = managerLocked(app);
            boolean paired = mgr.pair(LOOPBACK, pairingPort, code);

            if (!paired) {
                throw new IllegalStateException("Android rejected the pairing code");
            }

            app.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
                    .edit()
                    .putBoolean(KEY_PAIRED, true)
                    .apply();
        }

        String id = exec(app, "id");

        if (!isShellId(id)) {
            throw new IllegalStateException(
                    "ADB connected, but shell uid was not confirmed: " + id);
        }

        return id.trim();
    }

    static String verifyShell(Context context) throws Exception {
        String id = exec(context.getApplicationContext(), "id");

        if (!isShellId(id)) {
            throw new IllegalStateException("Unexpected ADB identity: " + id);
        }

        return id.trim();
    }

    static String runAudioProbe(Context context) throws Exception {
        Context app = context.getApplicationContext();

        final String resultFile =
                "/data/local/tmp/ontrack-audio-probe-result.txt";
        final String probeApk =
                "/data/local/tmp/ontrack-audio-probe.apk";

        String bootstrap =
                "APK=$(pm path com.ontrack.agentphone | head -n 1 | cut -d: -f2); " +
                "test -n \"$APK\" || { echo ONTRACK_PROBE_BOOTSTRAP_APK_MISSING; exit; }; " +
                "rm -f " + resultFile + " " + probeApk + "; " +
                "cp \"$APK\" " + probeApk + " || { echo ONTRACK_PROBE_COPY_FAILED; exit; }; " +
                "chmod 0644 " + probeApk + "; " +
                "CLASSPATH=" + probeApk + " nohup app_process /system/bin " +
                "com.ontrack.agentphone.ShellAudioProbe >" + resultFile +
                " 2>&1 </dev/null & " +
                "echo ONTRACK_PROBE_STARTED";

        String started = exec(app, bootstrap);

        if (!started.contains("ONTRACK_PROBE_STARTED")) {
            throw new IllegalStateException(
                    "Probe bootstrap failed: " + started.trim());
        }

        // Three sources are sampled for ~1.4 seconds each.
        Thread.sleep(6500L);

        String output = "";
        for (int attempt = 0; attempt < 4; attempt++) {
            output = exec(
                    app,
                    "if [ -s " + resultFile + " ]; then cat " + resultFile +
                    "; else echo ONTRACK_PROBE_PENDING; fi");

            if (!output.contains("ONTRACK_PROBE_PENDING")
                    && !output.trim().isEmpty()) {
                break;
            }

            Thread.sleep(1200L);
        }

        if (output.contains("ONTRACK_PROBE_PENDING")
                || output.trim().isEmpty()) {
            throw new IllegalStateException(
                    "Shell probe started but did not produce results");
        }

        return output.trim();
    }

    static void forget(Context context) {
        synchronized (LOCK) {
            resetTransportLocked(true);
        }

        Identity.forget(context.getApplicationContext());
        context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
                .edit()
                .clear()
                .apply();
    }

    private static boolean isShellId(String value) {
        return value != null
                && (value.contains("uid=2000")
                || value.contains("uid=2000(shell)"));
    }

    /**
     * Execute through one persistent exec:sh session.
     *
     * If the persistent session itself dies, rebuild the transport once and retry.
     * Pairing credentials are files and are never removed by this recovery.
     */
    private static String exec(Context context, String command) throws Exception {
        synchronized (LOCK) {
            Exception first = null;

            for (int attempt = 0; attempt < 2; attempt++) {
                try {
                    ensureConnectedLocked(context);

                    if (shell == null) {
                        shell = new PersistentShell(
                                manager.openStream("exec:sh"));
                    }

                    return shell.run(command);

                } catch (Exception error) {
                    if (first == null) first = error;
                    resetTransportLocked(false);
                }
            }

            throw first != null
                    ? first
                    : new IllegalStateException("Local ADB command failed");
        }
    }

    private static void ensureConnectedLocked(Context context) throws Exception {
        ProbeConnectionManager mgr = managerLocked(context);

        if (mgr.isConnected()) {
            return;
        }

        int connectPort = discoverPort(
                context,
                AdbMdns.SERVICE_TYPE_TLS_CONNECT,
                10_000L);

        if (connectPort <= 0) {
            throw new IllegalStateException(
                    "Wireless debugging connect service not found. Keep Wireless debugging ON.");
        }

        boolean ok = mgr.connect(LOOPBACK, connectPort);

        if (!ok && !mgr.isConnected()) {
            throw new IllegalStateException(
                    "Could not connect to local adbd");
        }
    }

    private static ProbeConnectionManager managerLocked(Context context)
            throws Exception {
        if (manager == null) {
            manager = new ProbeConnectionManager(
                    context.getApplicationContext());
        }
        return manager;
    }

    private static void resetTransportLocked(boolean closeIdentityManager) {
        try {
            if (shell != null) shell.close();
        } catch (Throwable ignored) {}
        shell = null;

        try {
            if (manager != null) {
                if (closeIdentityManager) manager.close();
                else manager.disconnect();
            }
        } catch (Throwable ignored) {}

        manager = null;
    }

    private static int discoverPort(
            Context context,
            String serviceType,
            long timeoutMs) throws InterruptedException {

        AtomicInteger port = new AtomicInteger(-1);
        CountDownLatch found = new CountDownLatch(1);

        AdbMdns mdns = new AdbMdns(
                context.getApplicationContext(),
                serviceType,
                (InetAddress ignored, int discoveredPort) -> {
                    if (discoveredPort > 0
                            && port.compareAndSet(-1, discoveredPort)) {
                        found.countDown();
                    }
                });

        mdns.start();

        try {
            found.await(timeoutMs, TimeUnit.MILLISECONDS);
        } finally {
            try { mdns.stop(); } catch (Throwable ignored) {}
        }

        return port.get();
    }

    /**
     * Persistent shell protocol with BEGIN/END sentinels.
     * One line per command means shell echo can never be mistaken for output.
     */
    private static final class PersistentShell {
        private final AdbStream stream;
        private final OutputStream out;
        private final BufferedReader reader;
        private final String marker;

        PersistentShell(AdbStream stream) throws Exception {
            this.stream = stream;
            this.out = stream.openOutputStream();
            this.reader = new BufferedReader(
                    new InputStreamReader(
                            stream.openInputStream(),
                            StandardCharsets.UTF_8));
            this.marker =
                    "__ontrack_" +
                    UUID.randomUUID().toString().replace("-", "")
                            .substring(0, 12) +
                    "__";

            // Some adbd builds still attach a PTY. Disable echo once before
            // starting the sentinel protocol, then drain any prompt/echo bytes.
            try {
                out.write(
                        "stty -echo 2>/dev/null; PS1=''\n"
                                .getBytes(StandardCharsets.UTF_8));
                out.flush();

                long deadline = System.currentTimeMillis() + 450L;
                while (System.currentTimeMillis() < deadline) {
                    if (reader.ready()) {
                        reader.read();
                    } else {
                        Thread.sleep(15L);
                    }
                }
            } catch (Throwable ignored) {}
        }

        String run(String command) throws Exception {
            String begin = marker + "-BEGIN";
            String end = marker + "-END";
            String oneLine = command
                    .replace('\n', ';')
                    .replace('\r', ' ');

            String payload =
                    "echo " + begin +
                    "; ( " + oneLine +
                    " ) ; echo " + end + "\n";

            out.write(payload.getBytes(StandardCharsets.UTF_8));
            out.flush();

            // Drop everything before our exact BEGIN line. This safely removes
            // PTY echo even when a long command wrapped across terminal lines.
            while (true) {
                String line = reader.readLine();
                if (line == null) {
                    throw new java.io.IOException(
                            "persistent shell stream closed before BEGIN");
                }
                if (begin.equals(line.trim())) {
                    break;
                }
            }

            StringBuilder result = new StringBuilder();

            while (true) {
                String line = reader.readLine();

                if (line == null) {
                    throw new java.io.IOException(
                            "persistent shell stream closed before END");
                }

                if (end.equals(line.trim())) {
                    break;
                }

                if (result.length() > 0) {
                    result.append('\n');
                }
                result.append(line);
            }

            return result.toString().trim();
        }

        void close() {
            try { out.close(); } catch (Throwable ignored) {}
            try {
                if (!stream.isClosed()) stream.close();
            } catch (Throwable ignored) {}
        }
    }

    private static final class ProbeConnectionManager
            extends AbsAdbConnectionManager {

        private final Identity identity;

        ProbeConnectionManager(Context context) throws Exception {
            identity = Identity.getOrCreate(
                    context.getApplicationContext());
            setApi(Build.VERSION.SDK_INT);
            setHostAddress(LOOPBACK);
            setTimeout(15, TimeUnit.SECONDS);
            setThrowOnUnauthorised(true);
        }

        @Override protected PrivateKey getPrivateKey() {
            return identity.privateKey;
        }

        @Override protected Certificate getCertificate() {
            return identity.certificate;
        }

        @Override protected String getDeviceName() {
            return "OnTrack Audio Probe";
        }
    }

    private static final class Identity {
        private static final String KEY_FILE =
                "audio_probe_adb_key.der";
        private static final String CERT_FILE =
                "audio_probe_adb_cert.der";

        private static Identity cached;

        final PrivateKey privateKey;
        final Certificate certificate;

        Identity(
                PrivateKey privateKey,
                Certificate certificate) {
            this.privateKey = privateKey;
            this.certificate = certificate;
        }

        static synchronized Identity getOrCreate(
                Context context) throws Exception {

            if (cached != null) {
                return cached;
            }

            File key =
                    new File(context.getFilesDir(), KEY_FILE);
            File cert =
                    new File(context.getFilesDir(), CERT_FILE);

            if (key.isFile() && cert.isFile()) {
                try {
                    PrivateKey privateKey =
                            KeyFactory.getInstance("RSA")
                                    .generatePrivate(
                                            new PKCS8EncodedKeySpec(
                                                    readAll(key)));

                    Certificate certificate =
                            CertificateFactory
                                    .getInstance("X.509")
                                    .generateCertificate(
                                            new ByteArrayInputStream(
                                                    readAll(cert)));

                    cached =
                            new Identity(
                                    privateKey,
                                    certificate);

                    return cached;

                } catch (Throwable ignored) {
                    key.delete();
                    cert.delete();
                }
            }

            KeyPairGenerator generator =
                    KeyPairGenerator.getInstance("RSA");

            generator.initialize(
                    2048,
                    new SecureRandom());

            KeyPair pair =
                    generator.generateKeyPair();

            long now =
                    System.currentTimeMillis();

            X500Name subject =
                    new X500Name(
                            "CN=OnTrack Audio Probe,O=OnTrack Development,C=EG");

            JcaX509v3CertificateBuilder builder =
                    new JcaX509v3CertificateBuilder(
                            subject,
                            new BigInteger(
                                    64,
                                    new SecureRandom()),
                            new Date(
                                    now - 86_400_000L),
                            new Date(
                                    now +
                                    20L *
                                    365L *
                                    86_400_000L),
                            subject,
                            pair.getPublic());

            ContentSigner signer =
                    new JcaContentSignerBuilder(
                            "SHA256withRSA")
                            .build(
                                    pair.getPrivate());

            X509CertificateHolder holder =
                    builder.build(signer);

            Certificate certificate =
                    CertificateFactory
                            .getInstance("X.509")
                            .generateCertificate(
                                    new ByteArrayInputStream(
                                            holder.getEncoded()));

            writeAll(
                    key,
                    pair.getPrivate().getEncoded());

            writeAll(
                    cert,
                    certificate.getEncoded());

            cached =
                    new Identity(
                            pair.getPrivate(),
                            certificate);

            return cached;
        }

        static boolean exists(Context context) {
            return new File(
                    context.getFilesDir(),
                    KEY_FILE).isFile()
                    && new File(
                    context.getFilesDir(),
                    CERT_FILE).isFile();
        }

        static synchronized void forget(Context context) {
            cached = null;
            new File(
                    context.getFilesDir(),
                    KEY_FILE).delete();
            new File(
                    context.getFilesDir(),
                    CERT_FILE).delete();
        }

        private static byte[] readAll(File file)
                throws Exception {
            try (
                    java.io.FileInputStream in =
                            new java.io.FileInputStream(file);
                    ByteArrayOutputStream out =
                            new ByteArrayOutputStream()) {

                byte[] buffer =
                        new byte[8192];

                int n;

                while ((n = in.read(buffer)) != -1) {
                    out.write(buffer, 0, n);
                }

                return out.toByteArray();
            }
        }

        private static void writeAll(
                File file,
                byte[] bytes) throws Exception {

            try (
                    java.io.FileOutputStream out =
                            new java.io.FileOutputStream(file)) {

                out.write(bytes);
                out.flush();
            }
        }
    }
}
