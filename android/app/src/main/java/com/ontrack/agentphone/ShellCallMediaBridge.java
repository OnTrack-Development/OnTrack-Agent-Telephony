package com.ontrack.agentphone;

import android.content.Context;
import android.media.AudioAttributes;
import android.media.AudioDeviceInfo;
import android.media.AudioFormat;
import android.media.AudioManager;
import android.media.AudioRecord;
import android.media.AudioTrack;
import android.media.MediaRecorder;
import android.os.Looper;
import android.os.Process;

import java.io.DataInputStream;
import java.io.DataOutputStream;
import java.net.InetAddress;
import java.net.InetSocketAddress;
import java.net.ServerSocket;
import java.net.Socket;
import java.lang.reflect.Method;
import java.nio.ByteBuffer;
import java.nio.ByteOrder;

/**
 * Long-lived local media daemon.
 *
 * Runs only as uid=2000(shell) via LocalAdb/app_process.
 * It exposes one authenticated loopback TCP session to the OnTrack APK:
 *   bridge -> app : caller downlink PCM16 mono @ 16 kHz
 *   app -> bridge : AI PCM16 (usually mono @ 24 kHz)
 *
 * The daemon selects TELEPHONY_TX from Android's advertised devices instead
 * of using a handset model table.
 */
public final class ShellCallMediaBridge {
    private static final byte MSG_CALLER_AUDIO = 1;
    private static final byte MSG_AI_AUDIO = 2;
    private static final byte MSG_STOP = 3;
    private static final byte MSG_FLUSH = 4;

    private static final int RX_RATE = 16000;
    private static final int RX_CHANNELS = 1;
    private static final int RX_FRAMES = 1600; // 100 ms

    private ShellCallMediaBridge() {}

    public static void main(String[] args) {
        if (args.length < 2) {
            System.err.println("ONTRACK_MEDIA|fatal=missing_args");
            return;
        }

        int port;
        try {
            port = Integer.parseInt(args[0]);
        } catch (Throwable error) {
            System.err.println("ONTRACK_MEDIA|fatal=invalid_port");
            return;
        }

        String secret = args[1];
        AudioRecord record = null;
        AudioTrack track = null;
        ServerSocket server = null;
        Socket socket = null;

        try {
            relaxHiddenApiChecks();

            Context context = createShellContext();
            AudioManager audio =
                    (AudioManager) context.getSystemService(Context.AUDIO_SERVICE);

            if (audio == null) {
                throw new IllegalStateException("AudioManager unavailable");
            }

            AudioDeviceInfo tx = findTelephonyTx(audio);
            if (tx == null) {
                throw new IllegalStateException("TELEPHONY_TX unavailable");
            }

            TxFormat txFormat = selectTxFormat(tx);

            record = createDownlinkRecorder();
            track = createTxTrack(context, tx, txFormat);

            if (record.getState() != AudioRecord.STATE_INITIALIZED) {
                throw new IllegalStateException("Downlink AudioRecord not initialized");
            }

            if (track.getState() != AudioTrack.STATE_INITIALIZED) {
                throw new IllegalStateException("Telephony AudioTrack not initialized");
            }

            // Prime before play. This is the path that worked on the tested
            // Xiaomi device and remains generic because the format is read from
            // TELEPHONY_TX itself.
            short[] silence = new short[
                    Math.max(
                            txFormat.channels * 160,
                            track.getBufferSizeInFrames() * txFormat.channels / 2)
            ];

            int primed = track.write(
                    silence,
                    0,
                    silence.length,
                    AudioTrack.WRITE_BLOCKING);

            if (primed < 0) {
                throw new IllegalStateException("TX prime failed: " + primed);
            }

            track.play();
            record.startRecording();

            server = new ServerSocket();
            server.setReuseAddress(true);
            server.bind(new InetSocketAddress(
                    InetAddress.getByName("127.0.0.1"),
                    port),
                    1);

            System.out.println(
                    "ONTRACK_MEDIA|listening"
                            + "|uid=" + Process.myUid()
                            + "|port=" + port
                            + "|tx_rate=" + txFormat.rate
                            + "|tx_channels=" + txFormat.channels);

            socket = server.accept();
            socket.setTcpNoDelay(true);
            socket.setKeepAlive(true);

            DataInputStream in =
                    new DataInputStream(socket.getInputStream());
            DataOutputStream out =
                    new DataOutputStream(socket.getOutputStream());

            String supplied = in.readUTF();

            if (!constantTimeEquals(secret, supplied)) {
                out.writeUTF("ERROR|auth");
                out.flush();
                return;
            }

            out.writeUTF(
                    "READY"
                            + "|rx_rate=" + RX_RATE
                            + "|rx_channels=" + RX_CHANNELS
                            + "|tx_rate=" + txFormat.rate
                            + "|tx_channels=" + txFormat.channels);
            out.flush();

            Object writeLock = new Object();
            final AudioRecord captureRecord = record;
            final Socket activeSocket = socket;

            Thread capture = new Thread(() -> {
                short[] pcm = new short[RX_FRAMES];

                try {
                    while (!activeSocket.isClosed()) {
                        int n = captureRecord.read(
                                pcm,
                                0,
                                pcm.length,
                                AudioRecord.READ_BLOCKING);

                        if (n <= 0) {
                            if (n == AudioRecord.ERROR_DEAD_OBJECT) break;
                            continue;
                        }

                        byte[] bytes = shortsToBytes(pcm, n);

                        synchronized (writeLock) {
                            out.writeByte(MSG_CALLER_AUDIO);
                            out.writeInt(RX_RATE);
                            out.writeInt(RX_CHANNELS);
                            out.writeInt(bytes.length);
                            out.write(bytes);
                            out.flush();
                        }
                    }
                } catch (Throwable error) {
                    try {
                        activeSocket.close();
                    } catch (Throwable ignored) {}
                }
            }, "OnTrackCallCapture");

            capture.start();

            while (!socket.isClosed()) {
                byte type;

                try {
                    type = in.readByte();
                } catch (java.io.EOFException eof) {
                    break;
                }

                if (type == MSG_STOP) {
                    break;
                }

                if (type == MSG_FLUSH) {
                    try {
                        track.pause();
                        track.flush();
                        int refill = track.write(
                                silence,
                                0,
                                silence.length,
                                AudioTrack.WRITE_BLOCKING);
                        if (refill >= 0) track.play();
                    } catch (Throwable ignored) {}
                    continue;
                }

                if (type != MSG_AI_AUDIO) {
                    throw new IllegalStateException("Unknown media frame: " + type);
                }

                int srcRate = in.readInt();
                int srcChannels = in.readInt();
                int byteCount = in.readInt();

                if (srcRate < 8000
                        || srcRate > 192000
                        || srcChannels < 1
                        || srcChannels > 2
                        || byteCount <= 0
                        || byteCount > 1024 * 1024) {
                    throw new IllegalArgumentException("Invalid AI PCM frame");
                }

                byte[] payload = new byte[byteCount];
                in.readFully(payload);

                short[] converted = convertPcm16(
                        payload,
                        srcRate,
                        srcChannels,
                        txFormat.rate,
                        txFormat.channels);

                int offset = 0;
                while (offset < converted.length) {
                    int written = track.write(
                            converted,
                            offset,
                            converted.length - offset,
                            AudioTrack.WRITE_BLOCKING);

                    if (written == AudioTrack.ERROR_DEAD_OBJECT) {
                        throw new IllegalStateException("TX AudioTrack died");
                    }

                    if (written < 0) {
                        throw new IllegalStateException("TX write failed: " + written);
                    }

                    offset += written;
                }
            }

        } catch (Throwable error) {
            String msg = error.getMessage() == null
                    ? error.getClass().getSimpleName()
                    : error.getMessage();
            System.err.println(
                    "ONTRACK_MEDIA|fatal="
                            + error.getClass().getName()
                            + ":" + msg.replace('|', '/')
                            .replace('\n', ' ')
                            .replace('\r', ' '));
        } finally {
            if (socket != null) {
                try { socket.close(); } catch (Throwable ignored) {}
            }
            if (server != null) {
                try { server.close(); } catch (Throwable ignored) {}
            }
            if (record != null) {
                try { record.stop(); } catch (Throwable ignored) {}
                try { record.release(); } catch (Throwable ignored) {}
            }
            if (track != null) {
                try { track.stop(); } catch (Throwable ignored) {}
                try { track.flush(); } catch (Throwable ignored) {}
                try { track.release(); } catch (Throwable ignored) {}
            }

            System.out.println("ONTRACK_MEDIA|done");
        }
    }

    private static AudioRecord createDownlinkRecorder() {
        int min = AudioRecord.getMinBufferSize(
                RX_RATE,
                AudioFormat.CHANNEL_IN_MONO,
                AudioFormat.ENCODING_PCM_16BIT);

        return new AudioRecord(
                MediaRecorder.AudioSource.VOICE_DOWNLINK,
                RX_RATE,
                AudioFormat.CHANNEL_IN_MONO,
                AudioFormat.ENCODING_PCM_16BIT,
                Math.max(8192, min > 0 ? min * 4 : 8192));
    }

    private static AudioTrack createTxTrack(
            Context context,
            AudioDeviceInfo tx,
            TxFormat format) {

        int channelMask = format.channels == 2
                ? AudioFormat.CHANNEL_OUT_STEREO
                : AudioFormat.CHANNEL_OUT_MONO;

        AudioFormat audioFormat = new AudioFormat.Builder()
                .setSampleRate(format.rate)
                .setEncoding(AudioFormat.ENCODING_PCM_16BIT)
                .setChannelMask(channelMask)
                .build();

        AudioAttributes attributes =
                new AudioAttributes.Builder()
                        .setUsage(AudioAttributes.USAGE_VOICE_COMMUNICATION)
                        .setContentType(AudioAttributes.CONTENT_TYPE_SPEECH)
                        .build();

        AudioTrack track = new AudioTrack.Builder()
                .setContext(context)
                .setAudioAttributes(attributes)
                .setAudioFormat(audioFormat)
                .build();

        if (!track.setPreferredDevice(tx)) {
            track.release();
            throw new IllegalStateException("Could not select TELEPHONY_TX");
        }

        return track;
    }

    private static AudioDeviceInfo findTelephonyTx(AudioManager audio) {
        AudioDeviceInfo[] devices =
                audio.getDevices(AudioManager.GET_DEVICES_OUTPUTS);

        if (devices == null) return null;

        for (AudioDeviceInfo device : devices) {
            if (device != null
                    && device.isSink()
                    && device.getType() == AudioDeviceInfo.TYPE_TELEPHONY) {
                return device;
            }
        }

        return null;
    }

    private static TxFormat selectTxFormat(AudioDeviceInfo tx) {
        int[] rates = tx.getSampleRates();
        int[] channels = tx.getChannelCounts();

        int rate = 48000;
        if (rates != null && rates.length > 0) {
            rate = rates[0];

            for (int candidate : rates) {
                if (candidate == 48000) {
                    rate = 48000;
                    break;
                }
                if (candidate == 44100) {
                    rate = 44100;
                }
            }
        }

        int channelCount = 1;
        if (channels != null && channels.length > 0) {
            channelCount = channels[0];

            for (int candidate : channels) {
                if (candidate == 2) {
                    channelCount = 2;
                    break;
                }
                if (candidate == 1) {
                    channelCount = 1;
                }
            }
        }

        if (channelCount != 1 && channelCount != 2) {
            throw new IllegalStateException("Unsupported TELEPHONY_TX channels");
        }

        return new TxFormat(rate, channelCount);
    }

    private static byte[] shortsToBytes(short[] input, int count) {
        ByteBuffer buffer =
                ByteBuffer.allocate(count * 2)
                        .order(ByteOrder.LITTLE_ENDIAN);

        for (int i = 0; i < count; i++) {
            buffer.putShort(input[i]);
        }

        return buffer.array();
    }

    private static short[] convertPcm16(
            byte[] input,
            int inputRate,
            int inputChannels,
            int outputRate,
            int outputChannels) {

        int inputSamples = input.length / 2;
        int inputFrames = inputSamples / inputChannels;

        if (inputFrames <= 0) return new short[0];

        short[] mono = new short[inputFrames];
        ByteBuffer source =
                ByteBuffer.wrap(input).order(ByteOrder.LITTLE_ENDIAN);

        for (int frame = 0; frame < inputFrames; frame++) {
            int sum = 0;

            for (int channel = 0; channel < inputChannels; channel++) {
                sum += source.getShort();
            }

            mono[frame] = (short) (sum / inputChannels);
        }

        int outputFrames = Math.max(
                1,
                (int)Math.round(
                        (double)inputFrames * outputRate / inputRate));

        short[] output =
                new short[outputFrames * outputChannels];

        if (inputFrames == 1) {
            for (int frame = 0; frame < outputFrames; frame++) {
                for (int channel = 0; channel < outputChannels; channel++) {
                    output[frame * outputChannels + channel] = mono[0];
                }
            }
            return output;
        }

        for (int frame = 0; frame < outputFrames; frame++) {
            double sourcePosition =
                    (double)frame * (inputFrames - 1)
                            / Math.max(1, outputFrames - 1);

            int left = (int)Math.floor(sourcePosition);
            int right = Math.min(inputFrames - 1, left + 1);
            double fraction = sourcePosition - left;

            int value = (int)Math.round(
                    mono[left] * (1.0 - fraction)
                            + mono[right] * fraction);

            short sample = (short)Math.max(
                    Short.MIN_VALUE,
                    Math.min(Short.MAX_VALUE, value));

            for (int channel = 0; channel < outputChannels; channel++) {
                output[frame * outputChannels + channel] = sample;
            }
        }

        return output;
    }

    private static boolean constantTimeEquals(String a, String b) {
        if (a == null || b == null) return false;

        byte[] left = a.getBytes(java.nio.charset.StandardCharsets.UTF_8);
        byte[] right = b.getBytes(java.nio.charset.StandardCharsets.UTF_8);

        if (left.length != right.length) return false;

        int diff = 0;
        for (int i = 0; i < left.length; i++) {
            diff |= left[i] ^ right[i];
        }

        return diff == 0;
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
                (Context)getSystemContext.invoke(thread);

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
                    (Object)new String[]{
                            "Landroid/app/ActivityThread;"
                    });
        } catch (Throwable ignored) {}
    }

    private static final class TxFormat {
        final int rate;
        final int channels;

        TxFormat(int rate, int channels) {
            this.rate = rate;
            this.channels = channels;
        }
    }
}
