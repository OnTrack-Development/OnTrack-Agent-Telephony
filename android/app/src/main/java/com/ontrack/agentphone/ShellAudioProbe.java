package com.ontrack.agentphone;

import android.media.AudioFormat;
import android.media.AudioRecord;
import android.media.MediaRecorder;
import android.os.Build;
import android.os.Process;
import android.os.SystemClock;

import java.util.Locale;

/**
 * Launched through local ADB + app_process, so this class executes as uid=2000(shell).
 * It never runs in the normal app process.
 */
public final class ShellAudioProbe {
    private static final int RATE = 16000;
    private static final long WINDOW_MS = 1400L;

    private ShellAudioProbe() {}

    public static void main(String[] args) {
        System.out.println("ONTRACK_PROBE|meta|sdk=" + Build.VERSION.SDK_INT
                + "|uid=" + Process.myUid()
                + "|pid=" + Process.myPid());

        test("voice_call", MediaRecorder.AudioSource.VOICE_CALL);
        test("downlink", MediaRecorder.AudioSource.VOICE_DOWNLINK);
        test("uplink", MediaRecorder.AudioSource.VOICE_UPLINK);
        System.out.println("ONTRACK_PROBE|done");
    }

    private static void test(String name, int source) {
        AudioRecord record = null;
        try {
            int min = AudioRecord.getMinBufferSize(
                    RATE,
                    AudioFormat.CHANNEL_IN_MONO,
                    AudioFormat.ENCODING_PCM_16BIT);
            int bufferSize = Math.max(min > 0 ? min * 4 : 0, 8192);

            record = new AudioRecord(
                    source,
                    RATE,
                    AudioFormat.CHANNEL_IN_MONO,
                    AudioFormat.ENCODING_PCM_16BIT,
                    bufferSize);

            if (record.getState() != AudioRecord.STATE_INITIALIZED) {
                System.out.println("ONTRACK_PROBE|" + name + "|initialized=false");
                return;
            }

            record.startRecording();
            short[] samples = new short[2048];
            long deadline = SystemClock.elapsedRealtime() + WINDOW_MS;
            long count = 0;
            long nonZero = 0;
            double sumSquares = 0;
            int peak = 0;
            int reads = 0;
            int readErrors = 0;

            while (SystemClock.elapsedRealtime() < deadline) {
                int n = record.read(samples, 0, samples.length, AudioRecord.READ_NON_BLOCKING);
                if (n <= 0) {
                    readErrors++;
                    SystemClock.sleep(10L);
                    continue;
                }
                reads++;
                for (int i = 0; i < n; i++) {
                    int v = samples[i];
                    int abs = Math.abs(v);
                    if (abs > 0) nonZero++;
                    if (abs > peak) peak = abs;
                    sumSquares += (double) v * (double) v;
                    count++;
                }
            }

            double rms = count == 0 ? 0d : Math.sqrt(sumSquares / count);
            double nzPct = count == 0 ? 0d : (100d * nonZero / count);
            boolean signal = count > 0 && peak >= 32 && rms >= 2.0d;

            System.out.println(String.format(
                    Locale.US,
                    "ONTRACK_PROBE|%s|initialized=true|samples=%d|reads=%d|read_errors=%d|nonzero_pct=%.2f|rms=%.2f|peak=%d|signal=%s",
                    name, count, reads, readErrors, nzPct, rms, peak, signal));

        } catch (Throwable error) {
            String message = error.getMessage();
            if (message == null) message = "";
            message = message.replace('|', '/').replace('\n', ' ').replace('\r', ' ');
            System.out.println("ONTRACK_PROBE|" + name
                    + "|error=" + error.getClass().getSimpleName()
                    + ":" + message);
        } finally {
            if (record != null) {
                try { record.stop(); } catch (Throwable ignored) {}
                try { record.release(); } catch (Throwable ignored) {}
            }
        }
    }
}
