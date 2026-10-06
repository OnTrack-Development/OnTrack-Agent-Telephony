package com.ontrack.agentphone;

import android.content.Context;
import android.util.Log;

import java.io.DataInputStream;
import java.io.DataOutputStream;
import java.net.InetSocketAddress;
import java.net.Socket;
import java.security.SecureRandom;

/**
 * App-side client for ShellCallMediaBridge.
 * No call audio leaves this class except through the Listener supplied by the
 * platform AI session.
 */
final class LocalCallMediaBridge {
    private static final String TAG = "OnTrackCallMedia";
    private static final byte MSG_CALLER_AUDIO = 1;
    private static final byte MSG_AI_AUDIO = 2;
    private static final byte MSG_STOP = 3;
    private static final byte MSG_FLUSH = 4;

    interface Listener {
        void onCallerAudio(byte[] pcm16le, int sampleRate, int channels);
        void onReady(int rxRate, int rxChannels, int txRate, int txChannels);
        void onError(Throwable error);
        void onClosed();
    }

    private final Context context;
    private final Listener listener;
    private final Object writeLock = new Object();

    private volatile boolean running;
    private Socket socket;
    private DataInputStream in;
    private DataOutputStream out;
    private Thread readerThread;

    LocalCallMediaBridge(Context context, Listener listener) {
        this.context = context.getApplicationContext();
        this.listener = listener;
    }

    void start() {
        if (running) return;
        running = true;

        new Thread(() -> {
            try {
                int port = 39000 + new SecureRandom().nextInt(1500);
                String secret = randomHex(24);

                String started =
                        LocalAdb.startCallMediaBridge(
                                context,
                                port,
                                secret);

                if (!started.contains("ONTRACK_MEDIA_STARTED")) {
                    throw new IllegalStateException(
                            "Local media daemon did not start: "
                                    + started.trim());
                }

                Socket connected = new Socket();
                Throwable last = null;

                for (int attempt = 0; attempt < 30; attempt++) {
                    try {
                        connected.connect(
                                new InetSocketAddress(
                                        "127.0.0.1",
                                        port),
                                700);
                        last = null;
                        break;
                    } catch (Throwable error) {
                        last = error;
                        try { connected.close(); } catch (Throwable ignored) {}
                        connected = new Socket();
                        Thread.sleep(100L);
                    }
                }

                if (last != null || !connected.isConnected()) {
                    throw new IllegalStateException(
                            "Could not connect to local media daemon",
                            last);
                }

                connected.setTcpNoDelay(true);
                connected.setKeepAlive(true);

                socket = connected;
                in = new DataInputStream(
                        connected.getInputStream());
                out = new DataOutputStream(
                        connected.getOutputStream());

                out.writeUTF(secret);
                out.flush();

                String ready = in.readUTF();

                if (!ready.startsWith("READY|")) {
                    throw new IllegalStateException(
                            "Local media daemon rejected connection: "
                                    + ready);
                }

                int rxRate = field(ready, "rx_rate", 16000);
                int rxChannels = field(ready, "rx_channels", 1);
                int txRate = field(ready, "tx_rate", 48000);
                int txChannels = field(ready, "tx_channels", 1);

                if (listener != null) {
                    listener.onReady(
                            rxRate,
                            rxChannels,
                            txRate,
                            txChannels);
                }

                readerThread = new Thread(
                        this::readLoop,
                        "OnTrackCallerAudio");
                readerThread.start();

            } catch (Throwable error) {
                fail(error);
            }
        }, "OnTrackMediaBootstrap").start();
    }

    private void readLoop() {
        try {
            while (running) {
                byte type = in.readByte();

                if (type != MSG_CALLER_AUDIO) {
                    throw new IllegalStateException(
                            "Unexpected local media frame: " + type);
                }

                int rate = in.readInt();
                int channels = in.readInt();
                int length = in.readInt();

                if (length <= 0 || length > 1024 * 1024) {
                    throw new IllegalArgumentException(
                            "Invalid caller PCM length");
                }

                byte[] pcm = new byte[length];
                in.readFully(pcm);

                if (listener != null) {
                    listener.onCallerAudio(
                            pcm,
                            rate,
                            channels);
                }
            }
        } catch (java.io.EOFException eof) {
            closeInternal(false);
        } catch (Throwable error) {
            if (running) fail(error);
        }
    }

    void sendAiAudio(
            byte[] pcm16le,
            int sampleRate,
            int channels) throws Exception {

        if (!running || out == null || pcm16le == null || pcm16le.length == 0) {
            return;
        }

        synchronized (writeLock) {
            out.writeByte(MSG_AI_AUDIO);
            out.writeInt(sampleRate);
            out.writeInt(channels);
            out.writeInt(pcm16le.length);
            out.write(pcm16le);
            out.flush();
        }
    }

    void flushAiAudio() {
        if (!running || out == null) return;

        try {
            synchronized (writeLock) {
                out.writeByte(MSG_FLUSH);
                out.flush();
            }
        } catch (Throwable error) {
            fail(error);
        }
    }

    void stop() {
        if (!running) return;

        try {
            synchronized (writeLock) {
                if (out != null) {
                    out.writeByte(MSG_STOP);
                    out.flush();
                }
            }
        } catch (Throwable ignored) {}

        closeInternal(true);
    }

    private void fail(Throwable error) {
        Log.e(TAG, "Local call media failed", error);

        if (listener != null) {
            try { listener.onError(error); } catch (Throwable ignored) {}
        }

        closeInternal(true);
    }

    private synchronized void closeInternal(boolean notify) {
        boolean wasRunning = running;
        running = false;

        try {
            if (socket != null) socket.close();
        } catch (Throwable ignored) {}

        socket = null;
        in = null;
        out = null;

        if (notify && wasRunning && listener != null) {
            try { listener.onClosed(); } catch (Throwable ignored) {}
        }
    }

    private static int field(
            String ready,
            String key,
            int fallback) {

        String prefix = key + "=";

        for (String part : ready.split("\\|")) {
            if (part.startsWith(prefix)) {
                try {
                    return Integer.parseInt(
                            part.substring(prefix.length()));
                } catch (Throwable ignored) {}
            }
        }

        return fallback;
    }

    private static String randomHex(int bytes) {
        byte[] value = new byte[bytes];
        new SecureRandom().nextBytes(value);

        StringBuilder out =
                new StringBuilder(bytes * 2);

        for (byte b : value) {
            out.append(String.format("%02x", b & 0xff));
        }

        return out.toString();
    }
}
