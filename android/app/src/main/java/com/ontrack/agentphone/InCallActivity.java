package com.ontrack.agentphone;

import android.app.Activity;
import android.graphics.Color;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.telecom.Call;
import android.telecom.CallAudioState;
import android.view.Gravity;
import android.view.View;
import android.view.WindowManager;
import android.widget.Button;
import android.widget.LinearLayout;
import android.widget.TextView;

import java.util.Locale;

public class InCallActivity extends Activity {
    private static final int BG = Color.rgb(8, 9, 11);
    private static final int PANEL = Color.rgb(18, 20, 24);
    private static final int LINE = Color.rgb(43, 47, 55);
    private static final int TEXT = Color.rgb(247, 247, 248);
    private static final int MUTED = Color.rgb(145, 151, 162);
    private static final int RED = Color.rgb(229, 37, 42);
    private static final int GREEN = Color.rgb(49, 196, 141);

    private final Handler handler = new Handler(Looper.getMainLooper());

    private TextView nameView;
    private TextView numberView;
    private TextView stateView;
    private TextView timerView;

    private Button answerButton;
    private Button declineButton;
    private Button endButton;
    private Button muteButton;
    private Button speakerButton;

    private long activeSince = 0L;

    private final Runnable ticker = new Runnable() {
        @Override public void run() {
            refresh();
            handler.postDelayed(this, 500L);
        }
    };

    @Override protected void onCreate(Bundle state) {
        super.onCreate(state);

        getWindow().setStatusBarColor(BG);
        getWindow().setNavigationBarColor(BG);
        getWindow().addFlags(
                WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON |
                WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED |
                WindowManager.LayoutParams.FLAG_TURN_SCREEN_ON);

        if (Build.VERSION.SDK_INT >= 27) {
            setShowWhenLocked(true);
            setTurnScreenOn(true);
        }

        buildUi();
    }

    @Override protected void onResume() {
        super.onResume();
        handler.removeCallbacks(ticker);
        handler.post(ticker);
    }

    @Override protected void onPause() {
        handler.removeCallbacks(ticker);
        super.onPause();
    }

    private void buildUi() {
        LinearLayout root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setGravity(Gravity.CENTER_HORIZONTAL);
        root.setPadding(dp(22), dp(34), dp(22), dp(28));
        root.setBackgroundColor(BG);

        TextView brand = text("OnTrack Phone", 14, true);
        brand.setTextColor(Color.rgb(255, 174, 177));
        root.addView(brand);

        root.addView(space(34));

        TextView avatar = text("OT", 28, true);
        avatar.setGravity(Gravity.CENTER);
        avatar.setBackground(roundRect(Color.rgb(57, 23, 27), 99, Color.rgb(84, 30, 34), 1));
        root.addView(avatar, new LinearLayout.LayoutParams(dp(92), dp(92)));

        root.addView(space(22));

        nameView = text("Unknown caller", 29, true);
        nameView.setGravity(Gravity.CENTER);
        root.addView(nameView);

        numberView = text("", 16, false);
        numberView.setTextColor(MUTED);
        numberView.setGravity(Gravity.CENTER);
        root.addView(numberView);

        root.addView(space(15));

        stateView = text("Connecting", 13, true);
        stateView.setTextColor(Color.rgb(255, 186, 188));
        stateView.setGravity(Gravity.CENTER);
        root.addView(stateView);

        timerView = text("", 14, false);
        timerView.setTextColor(MUTED);
        timerView.setGravity(Gravity.CENTER);
        root.addView(timerView);

        root.addView(space(36));

        LinearLayout controls = new LinearLayout(this);
        controls.setOrientation(LinearLayout.VERTICAL);
        controls.setPadding(dp(14), dp(14), dp(14), dp(14));
        controls.setBackground(roundRect(PANEL, 18, LINE, 1));

        answerButton = button("Answer", GREEN, Color.WHITE);
        answerButton.setOnClickListener(v -> OnTrackInCallService.answerCurrentCall());

        declineButton = button("Decline", RED, Color.WHITE);
        declineButton.setOnClickListener(v -> OnTrackInCallService.rejectCurrentCall());

        endButton = button("End call", RED, Color.WHITE);
        endButton.setOnClickListener(v -> OnTrackInCallService.disconnectCurrentCall());

        LinearLayout audioRow = new LinearLayout(this);
        audioRow.setOrientation(LinearLayout.HORIZONTAL);

        muteButton = button("Mute", Color.rgb(35, 39, 45), TEXT);
        muteButton.setOnClickListener(v -> {
            OnTrackInCallService.toggleMute();
            refresh();
        });

        speakerButton = button("Speaker", Color.rgb(35, 39, 45), TEXT);
        speakerButton.setOnClickListener(v -> {
            OnTrackInCallService.toggleSpeaker();
            refresh();
        });

        LinearLayout.LayoutParams half = new LinearLayout.LayoutParams(0, dp(52), 1f);
        half.setMargins(dp(4), dp(4), dp(4), dp(4));

        audioRow.addView(muteButton, half);
        audioRow.addView(speakerButton, half);

        controls.addView(answerButton);
        controls.addView(declineButton);
        controls.addView(endButton);
        controls.addView(audioRow);

        root.addView(controls, new LinearLayout.LayoutParams(-1, -2));

        setContentView(root);
        refresh();
    }

    private void refresh() {
        Call call = OnTrackInCallService.currentCall();

        if (call == null) {
            finish();
            return;
        }

        String number = OnTrackInCallService.currentNumber();
        String name = OnTrackInCallService.currentContactName();

        nameView.setText(name == null || name.isEmpty() ? "Unknown caller" : name);
        numberView.setText(number == null ? "" : number);

        int state = call.getState();

        if (state == Call.STATE_RINGING) {
            stateView.setText("Incoming call");
            timerView.setText("");

            answerButton.setVisibility(View.VISIBLE);
            declineButton.setVisibility(View.VISIBLE);
            endButton.setVisibility(View.GONE);

        } else if (state == Call.STATE_DIALING || state == Call.STATE_CONNECTING) {
            stateView.setText("Calling…");
            timerView.setText("");

            answerButton.setVisibility(View.GONE);
            declineButton.setVisibility(View.GONE);
            endButton.setVisibility(View.VISIBLE);

        } else if (state == Call.STATE_ACTIVE) {
            if (activeSince == 0L) activeSince = System.currentTimeMillis();

            stateView.setText("Connected");
            timerView.setText(formatDuration((System.currentTimeMillis() - activeSince) / 1000L));

            answerButton.setVisibility(View.GONE);
            declineButton.setVisibility(View.GONE);
            endButton.setVisibility(View.VISIBLE);

        } else if (state == Call.STATE_HOLDING) {
            stateView.setText("On hold");

            answerButton.setVisibility(View.GONE);
            declineButton.setVisibility(View.GONE);
            endButton.setVisibility(View.VISIBLE);

        } else if (state == Call.STATE_DISCONNECTED) {
            stateView.setText("Call ended");
            timerView.setText("");

            answerButton.setVisibility(View.GONE);
            declineButton.setVisibility(View.GONE);
            endButton.setVisibility(View.GONE);

            handler.postDelayed(this::finish, 700L);

        } else {
            stateView.setText("Call in progress");
        }

        CallAudioState audio = OnTrackInCallService.audioState();
        if (audio != null) {
            muteButton.setText(audio.isMuted() ? "Unmute" : "Mute");
            boolean speaker = audio.getRoute() == CallAudioState.ROUTE_SPEAKER;
            speakerButton.setText(speaker ? "Earpiece" : "Speaker");
        }
    }

    private String formatDuration(long seconds) {
        long minutes = seconds / 60;
        long remain = seconds % 60;
        return String.format(Locale.US, "%02d:%02d", minutes, remain);
    }

    private Button button(String label, int background, int foreground) {
        Button b = new Button(this);
        b.setText(label);
        b.setTextColor(foreground);
        b.setTextSize(14);
        b.setTypeface(Typeface.DEFAULT, Typeface.BOLD);
        b.setAllCaps(false);
        b.setGravity(Gravity.CENTER);
        b.setBackground(roundRect(background, 13, background, 0));

        LinearLayout.LayoutParams params = new LinearLayout.LayoutParams(-1, dp(52));
        params.setMargins(dp(4), dp(4), dp(4), dp(4));
        b.setLayoutParams(params);

        return b;
    }

    private TextView text(String value, int sp, boolean bold) {
        TextView t = new TextView(this);
        t.setText(value);
        t.setTextColor(TEXT);
        t.setTextSize(sp);
        if (bold) t.setTypeface(Typeface.DEFAULT, Typeface.BOLD);
        return t;
    }

    private GradientDrawable roundRect(int fill, int radius, int stroke, int strokeWidth) {
        GradientDrawable d = new GradientDrawable();
        d.setColor(fill);
        d.setCornerRadius(dp(radius));
        if (strokeWidth > 0) d.setStroke(dp(strokeWidth), stroke);
        return d;
    }

    private View space(int height) {
        View v = new View(this);
        v.setLayoutParams(new LinearLayout.LayoutParams(1, dp(height)));
        return v;
    }

    private int dp(int value) {
        return Math.round(value * getResources().getDisplayMetrics().density);
    }
}
