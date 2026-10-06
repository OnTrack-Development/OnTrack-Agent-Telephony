package com.ontrack.agentphone;

import android.app.Activity;
import android.content.Intent;
import android.graphics.Color;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.os.Build;
import android.os.Bundle;
import android.provider.Settings;
import android.view.Gravity;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.TextView;
import android.widget.Toast;

/** Isolated diagnostic screen; it does not change call handling or bridge logic. */
public class AudioProbeActivity extends Activity {
    private static final int BG = Color.rgb(7, 8, 10);
    private static final int PANEL = Color.rgb(18, 21, 25);
    private static final int LINE = Color.rgb(43, 49, 57);
    private static final int TEXT = Color.rgb(247, 248, 250);
    private static final int MUTED = Color.rgb(143, 151, 162);
    private static final int RED = Color.rgb(229, 37, 42);
    private static final int GREEN = Color.rgb(55, 201, 147);

    private TextView status;

    @Override public void onCreate(Bundle state) {
        super.onCreate(state);
        getWindow().setStatusBarColor(BG);
        getWindow().setNavigationBarColor(BG);
        setContentView(build());
    }

    @Override protected void onResume() {
        super.onResume();
        if (status != null && LocalAdb.wasPaired(this)) {
            status.setText("ADB identity saved. Turn Wireless debugging ON, then Verify shell.");
        }
    }

    private ScrollView build() {
        LinearLayout root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setPadding(dp(18), dp(22), dp(18), dp(30));
        root.setBackgroundColor(BG);

        TextView title = text("SIM Audio Probe", 28, true);
        root.addView(title);

        TextView sub = text(
                "Experimental stock-Android test: local Wireless Debugging → uid=2000(shell) → digital SIM call audio.",
                12,
                false);
        sub.setTextColor(MUTED);
        sub.setPadding(0, dp(7), 0, dp(18));
        root.addView(sub);

        LinearLayout card = new LinearLayout(this);
        card.setOrientation(LinearLayout.VERTICAL);
        card.setPadding(dp(16), dp(16), dp(16), dp(16));
        card.setBackground(roundRect(PANEL, 18, LINE));

        card.addView(text("1 · Pair local ADB once", 16, true));
        card.addView(note(
                "Tap Prepare pairing, open Wireless debugging → Pair device with pairing code. " +
                "Keep the six-digit dialog open and reply to the OnTrack notification."));
        card.addView(button("Prepare pairing", v -> preparePairing()));
        card.addView(space(12));

        card.addView(text("2 · Verify shell", 16, true));
        card.addView(note("Wireless debugging must be ON for this test. Expected uid is 2000(shell)."));
        card.addView(button("Verify shell", v -> verifyShell()));
        card.addView(space(12));

        card.addView(text("3 · Inspect device audio capabilities", 16, true));
        card.addView(note(
                "Queries the phone itself: shell permissions, TELEPHONY RX/TX devices, Audio Policy, AudioFlinger/HAL, vendor policy files and recent native audio errors."));
        card.addView(button("Inspect audio capabilities", v -> runCapabilityReport()));
        card.addView(space(12));

        card.addView(text("4 · Run during a real SIM call", 16, true));
        card.addView(note(
                "Make a normal cellular call, keep the other phone talking, return here and press Run. " +
                "The probe tests VOICE_CALL, DOWNLINK and UPLINK digitally, then the next step tests audio injection."));
        TextView run = button("Run SIM audio probe", v -> runProbe());
        run.setBackground(roundRect(RED, 14, RED));
        card.addView(run);
        card.addView(space(16));

        card.addView(text("5 · Inject a test tone to the caller", 16, true));
        card.addView(note(
                "Keep the real SIM call connected. Tap Inject and ask the remote party if they hear one short 700 Hz beep. " +
                "This tests the Android PSTN uplink injection path; it does not use the phone speaker."));
        TextView inject = button("Inject test tone", v -> runInjectionProbe());
        inject.setBackground(roundRect(Color.rgb(43, 78, 67), 14, Color.rgb(55, 201, 147)));
        card.addView(inject);

        root.addView(card);
        root.addView(space(14));

        status = text("Not tested yet.", 12, false);
        status.setTextColor(TEXT);
        status.setPadding(dp(14), dp(14), dp(14), dp(14));
        status.setBackground(roundRect(Color.rgb(10, 12, 15), 14, LINE));
        status.setTextIsSelectable(true);
        root.addView(status);

        root.addView(space(12));
        TextView warning = note(
                "This screen does not use root, Accessibility, Twilio, SIP or a VPS. " +
                "It does require Developer options + Wireless debugging for the bootstrap test.");
        root.addView(warning);

        ScrollView scroll = new ScrollView(this);
        scroll.setFillViewport(true);
        scroll.addView(root, new ScrollView.LayoutParams(-1, -2));
        return scroll;
    }

    private void preparePairing() {
        if (Build.VERSION.SDK_INT < 30) {
            toast("Wireless debugging requires Android 11 or newer");
            return;
        }
        AudioProbePairReceiver.showPairPrompt(this);
        status.setText("Pairing notification posted. Open Wireless debugging and use Pair device with pairing code.");
        try {
            startActivity(new Intent(Settings.ACTION_APPLICATION_DEVELOPMENT_SETTINGS));
        } catch (Throwable error) {
            toast("Open Developer options manually");
        }
    }

    private void verifyShell() {
        status.setText("Connecting to local adbd…");
        new Thread(() -> {
            try {
                String result = LocalAdb.verifyShell(this);
                ui("PASS · local shell confirmed\n\n" + result, GREEN);
            } catch (Throwable error) {
                ui("FAIL · " + message(error), RED);
            }
        }, "OnTrackAudioProbeVerify").start();
    }

    private void runCapabilityReport() {
        status.setText(
                "Inspecting Android audio framework, telephony devices, policy, HAL and recent native audio errors…");

        new Thread(() -> {
            try {
                String output = LocalAdb.runCapabilityReport(this);

                boolean shell =
                        output.contains("ONTRACK_CAP|identity|uid=2000");
                boolean tx =
                        output.contains("tx_output=true");
                boolean rx =
                        output.contains("rx_input=true");
                boolean interceptable =
                        output.contains("ONTRACK_CAP|pstn_interceptable=true");

                int color =
                        shell && tx && rx
                                ? GREEN
                                : RED;

                String headline =
                        shell
                                ? "DEVICE AUDIO CAPABILITY REPORT"
                                : "CAPABILITY REPORT · shell identity not confirmed";

                if (shell && tx && rx && interceptable) {
                    headline += " · TELEPHONY RX/TX exposed";
                }

                ui(headline + "\n\n" + output, color);

            } catch (Throwable error) {
                ui("FAIL · " + message(error), RED);
            }
        }, "OnTrackAudioCapabilityReport").start();
    }

    private void runProbe() {
        if (Build.VERSION.SDK_INT < 31) {
            status.setText("This probe is intentionally limited to Android 12+.");
            return;
        }
        status.setText("Running digital SIM audio probe… keep the remote party talking.");
        new Thread(() -> {
            try {
                String output = LocalAdb.runAudioProbe(this);
                boolean shell = output.contains("|uid=2000");
                boolean signal = output.contains("signal=true");
                int color = shell && signal ? GREEN : RED;
                String headline = shell && signal
                        ? "PASS · digital call audio is flowing"
                        : "RESULT · shell ran, inspect each source below";
                ui(headline + "\n\n" + output, color);
            } catch (Throwable error) {
                ui("FAIL · " + message(error), RED);
            }
        }, "OnTrackAudioProbeRun").start();
    }

    private void runInjectionProbe() {
        if (Build.VERSION.SDK_INT < 31) {
            status.setText("This injection probe is intentionally limited to Android 12+.");
            return;
        }

        status.setText(
                "Injecting a short test tone into the SIM call uplink… ask the remote party if they hear it.");

        new Thread(() -> {
            try {
                String output = LocalAdb.runUplinkInjectionProbe(this);

                boolean shell = output.contains("|uid=2000");
                boolean interceptable =
                        output.contains("pstn_interceptable=true");
                boolean written =
                        output.contains("result=written");

                int color =
                        shell && interceptable && written
                                ? GREEN
                                : RED;

                String headline;

                if (shell && interceptable && written) {
                    headline =
                            "TONE SENT · ask the remote party if they heard the beep";
                } else if (output.contains("pstn_interceptable=false")) {
                    headline =
                            "RESULT · Android reports PSTN uplink injection unavailable";
                } else {
                    headline =
                            "RESULT · injection probe ran; inspect the details below";
                }

                ui(headline + "\n\n" + output, color);

            } catch (Throwable error) {
                ui("FAIL · " + message(error), RED);
            }
        }, "OnTrackUplinkInjectionProbe").start();
    }

    private void ui(String value, int color) {
        runOnUiThread(() -> {
            status.setText(value);
            status.setTextColor(color == GREEN ? Color.rgb(185, 255, 228) : Color.rgb(255, 183, 186));
        });
    }

    private String message(Throwable error) {
        String value = error.getMessage();
        return value == null || value.trim().isEmpty()
                ? error.getClass().getSimpleName()
                : value;
    }

    private TextView button(String label, android.view.View.OnClickListener listener) {
        TextView b = text(label, 13, true);
        b.setGravity(Gravity.CENTER);
        b.setPadding(dp(14), dp(13), dp(14), dp(13));
        b.setBackground(roundRect(Color.rgb(31, 35, 41), 14, LINE));
        b.setOnClickListener(listener);
        return b;
    }

    private TextView note(String value) {
        TextView t = text(value, 11, false);
        t.setTextColor(MUTED);
        t.setLineSpacing(0, 1.25f);
        t.setPadding(0, dp(5), 0, dp(10));
        return t;
    }

    private TextView text(String value, int sp, boolean bold) {
        TextView t = new TextView(this);
        t.setText(value);
        t.setTextColor(TEXT);
        t.setTextSize(sp);
        t.setIncludeFontPadding(false);
        if (bold) t.setTypeface(Typeface.DEFAULT, Typeface.BOLD);
        return t;
    }

    private GradientDrawable roundRect(int fill, int radius, int stroke) {
        GradientDrawable d = new GradientDrawable();
        d.setColor(fill);
        d.setCornerRadius(dp(radius));
        d.setStroke(dp(1), stroke);
        return d;
    }

    private TextView space(int height) {
        TextView v = new TextView(this);
        v.setHeight(dp(height));
        return v;
    }

    private int dp(int value) {
        return Math.round(value * getResources().getDisplayMetrics().density);
    }

    private void toast(String value) {
        Toast.makeText(this, value, Toast.LENGTH_LONG).show();
    }
}
