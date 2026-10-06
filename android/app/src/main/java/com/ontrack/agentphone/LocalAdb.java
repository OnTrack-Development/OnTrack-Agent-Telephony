package com.ontrack.agentphone;

import android.content.Context;
import android.os.Build;

import org.bouncycastle.asn1.x500.X500Name;
import org.bouncycastle.cert.X509CertificateHolder;
import org.bouncycastle.cert.jcajce.JcaX509v3CertificateBuilder;
import org.bouncycastle.operator.ContentSigner;
import org.bouncycastle.operator.jcajce.JcaContentSignerBuilder;

import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.InputStream;
import java.math.BigInteger;
import java.net.InetAddress;
import java.security.KeyFactory;
import java.security.KeyPair;
import java.security.KeyPairGenerator;
import java.security.PrivateKey;
import java.security.SecureRandom;
import java.security.cert.Certificate;
import java.security.cert.CertificateFactory;
import java.security.spec.PKCS8EncodedKeySpec;
import java.util.Date;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;

import io.github.muntashirakon.adb.AbsAdbConnectionManager;
import io.github.muntashirakon.adb.AdbStream;
import io.github.muntashirakon.adb.android.AdbMdns;

final class LocalAdb {
    private static final String LOOPBACK = "127.0.0.1";
    private static final String PREFS = "ontrack_audio_probe";
    private static final String KEY_PAIRED = "adb_paired";
    private static final Object LOCK = new Object();
    private static ProbeConnectionManager manager;

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
        if (code.length() != 6) throw new IllegalArgumentException("Pairing code must be exactly 6 digits");

        int pairingPort = discoverPort(app, AdbMdns.SERVICE_TYPE_TLS_PAIRING, 12_000L);
        if (pairingPort <= 0) throw new IllegalStateException("Pairing service not found. Keep 'Pair device with pairing code' open.");

        ProbeConnectionManager mgr = manager(app);
        boolean paired = mgr.pair(LOOPBACK, pairingPort, code);
        if (!paired) throw new IllegalStateException("Android rejected the pairing code");

        app.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
                .edit().putBoolean(KEY_PAIRED, true).apply();

        String id = connectAndExec(app, "id");
        if (!id.contains("uid=2000") && !id.contains("uid=2000(shell)")) {
            throw new IllegalStateException("ADB connected, but shell uid was not confirmed: " + id);
        }
        return id.trim();
    }

    static String verifyShell(Context context) throws Exception {
        String id = connectAndExec(context.getApplicationContext(), "id");
        if (!id.contains("uid=2000") && !id.contains("uid=2000(shell)")) {
            throw new IllegalStateException("Unexpected ADB identity: " + id);
        }
        return id.trim();
    }

    static String runAudioProbe(Context context) throws Exception {
        Context app = context.getApplicationContext();
        String command =
                "APK=$(pm path com.ontrack.agentphone | head -n 1 | cut -d: -f2); " +
                "test -n \"$APK\" || { echo 'ONTRACK_PROBE|fatal=apk_not_found'; exit 2; }; " +
                "CLASSPATH=\"$APK\" app_process /system/bin " +
                "com.ontrack.agentphone.ShellAudioProbe";
        return connectAndExec(app, command).trim();
    }

    static void forget(Context context) {
        synchronized (LOCK) {
            try {
                if (manager != null) manager.disconnect();
            } catch (Throwable ignored) {}
            manager = null;
        }
        Identity.forget(context.getApplicationContext());
        context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().clear().apply();
    }

    private static ProbeConnectionManager manager(Context context) throws Exception {
        synchronized (LOCK) {
            if (manager == null) manager = new ProbeConnectionManager(context);
            return manager;
        }
    }

    private static String connectAndExec(Context context, String command) throws Exception {
        ProbeConnectionManager mgr = manager(context);
        try {
            if (!mgr.isConnected()) {
                int connectPort = discoverPort(context, AdbMdns.SERVICE_TYPE_TLS_CONNECT, 10_000L);
                if (connectPort <= 0) throw new IllegalStateException("Wireless debugging connect service not found. Keep Wireless debugging ON.");
                boolean ok = mgr.connect(LOOPBACK, connectPort);
                if (!ok && !mgr.isConnected()) throw new IllegalStateException("Could not connect to local adbd");
            }

            AdbStream stream = mgr.openStream("shell:" + command);
            try (InputStream in = stream.openInputStream();
                 ByteArrayOutputStream out = new ByteArrayOutputStream()) {
                byte[] buffer = new byte[8192];
                int read;
                while ((read = in.read(buffer)) != -1) out.write(buffer, 0, read);
                return out.toString("UTF-8");
            } finally {
                try { stream.close(); } catch (Throwable ignored) {}
            }
        } finally {
            try { mgr.disconnect(); } catch (Throwable ignored) {}
        }
    }

    private static int discoverPort(Context context, String serviceType, long timeoutMs)
            throws InterruptedException {
        AtomicInteger port = new AtomicInteger(-1);
        CountDownLatch found = new CountDownLatch(1);

        AdbMdns mdns = new AdbMdns(
                context.getApplicationContext(),
                serviceType,
                (InetAddress ignored, int discoveredPort) -> {
                    if (discoveredPort > 0 && port.compareAndSet(-1, discoveredPort)) found.countDown();
                });

        mdns.start();
        try {
            found.await(timeoutMs, TimeUnit.MILLISECONDS);
        } finally {
            try { mdns.stop(); } catch (Throwable ignored) {}
        }
        return port.get();
    }

    private static final class ProbeConnectionManager extends AbsAdbConnectionManager {
        private final Identity identity;

        ProbeConnectionManager(Context context) throws Exception {
            identity = Identity.getOrCreate(context.getApplicationContext());
            setApi(Build.VERSION.SDK_INT);
            setHostAddress(LOOPBACK);
            setTimeout(15, TimeUnit.SECONDS);
            setThrowOnUnauthorised(true);
        }

        @Override protected PrivateKey getPrivateKey() { return identity.privateKey; }
        @Override protected Certificate getCertificate() { return identity.certificate; }
        @Override protected String getDeviceName() { return "OnTrack Audio Probe"; }
    }

    private static final class Identity {
        private static final String KEY_FILE = "audio_probe_adb_key.der";
        private static final String CERT_FILE = "audio_probe_adb_cert.der";
        private static Identity cached;

        final PrivateKey privateKey;
        final Certificate certificate;

        Identity(PrivateKey privateKey, Certificate certificate) {
            this.privateKey = privateKey;
            this.certificate = certificate;
        }

        static synchronized Identity getOrCreate(Context context) throws Exception {
            if (cached != null) return cached;

            File key = new File(context.getFilesDir(), KEY_FILE);
            File cert = new File(context.getFilesDir(), CERT_FILE);

            if (key.isFile() && cert.isFile()) {
                try {
                    PrivateKey privateKey = KeyFactory.getInstance("RSA")
                            .generatePrivate(new PKCS8EncodedKeySpec(readAll(key)));
                    Certificate certificate = CertificateFactory.getInstance("X.509")
                            .generateCertificate(new ByteArrayInputStream(readAll(cert)));
                    cached = new Identity(privateKey, certificate);
                    return cached;
                } catch (Throwable ignored) {
                    key.delete();
                    cert.delete();
                }
            }

            KeyPairGenerator generator = KeyPairGenerator.getInstance("RSA");
            generator.initialize(2048, new SecureRandom());
            KeyPair pair = generator.generateKeyPair();

            long now = System.currentTimeMillis();
            X500Name subject = new X500Name("CN=OnTrack Audio Probe,O=OnTrack Development,C=EG");
            JcaX509v3CertificateBuilder builder = new JcaX509v3CertificateBuilder(
                    subject,
                    new BigInteger(64, new SecureRandom()),
                    new Date(now - 86_400_000L),
                    new Date(now + 20L * 365L * 86_400_000L),
                    subject,
                    pair.getPublic());
            ContentSigner signer = new JcaContentSignerBuilder("SHA256withRSA")
                    .build(pair.getPrivate());
            X509CertificateHolder holder = builder.build(signer);
            Certificate certificate = CertificateFactory.getInstance("X.509")
                    .generateCertificate(new ByteArrayInputStream(holder.getEncoded()));

            writeAll(key, pair.getPrivate().getEncoded());
            writeAll(cert, certificate.getEncoded());
            cached = new Identity(pair.getPrivate(), certificate);
            return cached;
        }

        static boolean exists(Context context) {
            return new File(context.getFilesDir(), KEY_FILE).isFile()
                    && new File(context.getFilesDir(), CERT_FILE).isFile();
        }

        static synchronized void forget(Context context) {
            cached = null;
            new File(context.getFilesDir(), KEY_FILE).delete();
            new File(context.getFilesDir(), CERT_FILE).delete();
        }

        private static byte[] readAll(File file) throws Exception {
            try (java.io.FileInputStream in = new java.io.FileInputStream(file);
                 ByteArrayOutputStream out = new ByteArrayOutputStream()) {
                byte[] buffer = new byte[8192];
                int n;
                while ((n = in.read(buffer)) != -1) out.write(buffer, 0, n);
                return out.toByteArray();
            }
        }

        private static void writeAll(File file, byte[] bytes) throws Exception {
            try (java.io.FileOutputStream out = new java.io.FileOutputStream(file)) {
                out.write(bytes);
                out.flush();
            }
        }
    }
}
