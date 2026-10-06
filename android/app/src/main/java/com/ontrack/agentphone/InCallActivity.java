package com.ontrack.agentphone;

import android.app.Activity;
import android.content.Intent;
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
import android.widget.GridLayout;
import android.widget.LinearLayout;
import android.widget.TextView;

import java.util.Locale;

public class InCallActivity extends Activity {
    private static final int BG = Color.rgb(7, 8, 10);
    private static final int PANEL = Color.rgb(18, 21, 25);
    private static final int PANEL_2 = Color.rgb(26, 30, 35);
    private static final int LINE = Color.rgb(44, 50, 58);
    private static final int TEXT = Color.rgb(247, 248, 250);
    private static final int MUTED = Color.rgb(143, 151, 162);
    private static final int RED = Color.rgb(229, 37, 42);
    private static final int GREEN = Color.rgb(55, 201, 147);
    private static final int AMBER = Color.rgb(246, 173, 60);

    private final Handler handler = new Handler(Looper.getMainLooper());

    private TextView avatarView;
    private TextView nameView;
    private TextView numberView;
    private TextView stateView;
    private TextView timerView;

    private LinearLayout ringingActions;
    private LinearLayout activeActions;
    private TextView endCall;

    private Control muteControl;
    private Control speakerControl;
    private Control addCallControl;
    private Control mergeControl;

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
        root.setPadding(dp(20), dp(20), dp(20), dp(26));
        root.setBackground(gradientBackground());

        LinearLayout brandRow = new LinearLayout(this);
        brandRow.setOrientation(LinearLayout.HORIZONTAL);
        brandRow.setGravity(Gravity.CENTER_VERTICAL);

        TextView logo = text("OT", 13, true);
        logo.setGravity(Gravity.CENTER);
        logo.setBackground(roundRect(RED, 13, RED, 0));
        brandRow.addView(logo, new LinearLayout.LayoutParams(dp(40), dp(40)));

        LinearLayout brandCopy = new LinearLayout(this);
        brandCopy.setOrientation(LinearLayout.VERTICAL);

        TextView brand = text("OnTrack Phone", 16, true);
        TextView sub = text("AI Telephony", 10, false);
        sub.setTextColor(MUTED);

        brandCopy.addView(brand);
        brandCopy.addView(sub);

        LinearLayout.LayoutParams brandCopyParams =
                new LinearLayout.LayoutParams(0, -2, 1f);
        brandCopyParams.setMargins(dp(10), 0, 0, 0);
        brandRow.addView(brandCopy, brandCopyParams);

        TextView secure = text("CALL", 9, true);
        secure.setTextColor(Color.rgb(255, 187, 190));
        secure.setPadding(dp(10), dp(6), dp(10), dp(6));
        secure.setBackground(roundRect(
                Color.rgb(58, 25, 29),
                99,
                Color.rgb(87, 34, 39),
                1));
        brandRow.addView(secure);

        root.addView(brandRow, new LinearLayout.LayoutParams(-1, -2));

        root.addView(space(42));

        avatarView = text("?", 30, true);
        avatarView.setGravity(Gravity.CENTER);
        avatarView.setTextColor(Color.rgb(255, 205, 207));
        avatarView.setBackground(roundRect(
                Color.rgb(61, 29, 33),
                99,
                Color.rgb(99, 41, 47),
                1));
        root.addView(avatarView, new LinearLayout.LayoutParams(dp(112), dp(112)));

        root.addView(space(20));

        nameView = text("Unknown caller", 30, true);
        nameView.setGravity(Gravity.CENTER);
        nameView.setSingleLine(true);
        root.addView(nameView, new LinearLayout.LayoutParams(-1, -2));

        numberView = text("", 15, false);
        numberView.setTextColor(MUTED);
        numberView.setGravity(Gravity.CENTER);
        numberView.setPadding(0, dp(5), 0, 0);
        root.addView(numberView);

        root.addView(space(15));

        stateView = text("Connecting", 11, true);
        stateView.setGravity(Gravity.CENTER);
        stateView.setPadding(dp(12), dp(7), dp(12), dp(7));
        stateView.setBackground(roundRect(
                Color.rgb(31, 35, 41),
                99,
                LINE,
                1));
        root.addView(stateView);

        timerView = text("", 16, true);
        timerView.setTextColor(Color.rgb(201, 207, 215));
        timerView.setGravity(Gravity.CENTER);
        timerView.setPadding(0, dp(9), 0, 0);
        root.addView(timerView);

        root.addView(space(34));

        activeActions = new LinearLayout(this);
        activeActions.setOrientation(LinearLayout.VERTICAL);
        activeActions.setPadding(dp(14), dp(14), dp(14), dp(14));
        activeActions.setBackground(roundRect(
                Color.argb(210, 18, 21, 25),
                22,
                LINE,
                1));

        GridLayout controls = new GridLayout(this);
        controls.setColumnCount(2);
        controls.setRowCount(2);

        muteControl = control("M", "Mute");
        speakerControl = control("S", "Speaker");
        addCallControl = control("+", "Add call");
        mergeControl = control("⇄", "Merge");

        muteControl.root.setOnClickListener(v -> {
            OnTrackInCallService.toggleMute();
            refresh();
        });

        speakerControl.root.setOnClickListener(v -> {
            OnTrackInCallService.toggleSpeaker();
            refresh();
        });

        addCallControl.root.setOnClickListener(v -> {
            Intent intent = new Intent(Intent.ACTION_DIAL);
            intent.setClass(this, MainActivity.class);
            startActivity(intent);
        });

        mergeControl.root.setOnClickListener(v -> {
            boolean merged = OnTrackInCallService.mergeConferenceNow();

            if (!merged) {
                android.widget.Toast.makeText(
                        this,
                        "Calls are not mergeable yet",
                        android.widget.Toast.LENGTH_SHORT).show();
            }

            refresh();
        });

        addGridControl(controls, muteControl.root);
        addGridControl(controls, speakerControl.root);
        addGridControl(controls, addCallControl.root);
        addGridControl(controls, mergeControl.root);

        activeActions.addView(controls);

        root.addView(
                activeActions,
                new LinearLayout.LayoutParams(-1, -2));

        root.addView(space(20));

        ringingActions = new LinearLayout(this);
        ringingActions.setOrientation(LinearLayout.HORIZONTAL);
        ringingActions.setGravity(Gravity.CENTER);

        LinearLayout decline = roundAction("✕", "Decline", RED);
        decline.setOnClickListener(v -> OnTrackInCallService.rejectCurrentCall());

        LinearLayout answer = roundAction("✓", "Answer", GREEN);
        answer.setOnClickListener(v -> OnTrackInCallService.answerCurrentCall());

        LinearLayout.LayoutParams actionParams =
                new LinearLayout.LayoutParams(0, -2, 1f);
        actionParams.setMargins(dp(10), 0, dp(10), 0);

        ringingActions.addView(decline, actionParams);
        ringingActions.addView(answer, actionParams);

        root.addView(ringingActions, new LinearLayout.LayoutParams(-1, -2));

        endCall = text("End call", 14, true);
        endCall.setGravity(Gravity.CENTER);
        endCall.setTextColor(Color.WHITE);
        endCall.setBackground(roundRect(RED, 99, RED, 0));
        endCall.setOnClickListener(v -> OnTrackInCallService.disconnectCurrentCall());

        LinearLayout.LayoutParams endParams =
                new LinearLayout.LayoutParams(dp(160), dp(56));
        endParams.setMargins(0, dp(18), 0, 0);
        root.addView(endCall, endParams);

        setContentView(root);
        refresh();
    }

    private void addGridControl(GridLayout grid, View view) {
        GridLayout.LayoutParams params = new GridLayout.LayoutParams();
        params.width = 0;
        params.height = dp(92);
        params.columnSpec = GridLayout.spec(GridLayout.UNDEFINED, 1f);
        params.setMargins(dp(5), dp(5), dp(5), dp(5));
        grid.addView(view, params);
    }

    private Control control(String symbol, String label) {
        LinearLayout root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setGravity(Gravity.CENTER);
        root.setPadding(dp(8), dp(9), dp(8), dp(9));
        root.setBackground(roundRect(PANEL_2, 18, LINE, 1));

        TextView icon = text(symbol, 19, true);
        icon.setGravity(Gravity.CENTER);
        icon.setTextColor(TEXT);
        root.addView(icon);

        TextView caption = text(label, 11, true);
        caption.setTextColor(Color.rgb(210, 215, 222));
        caption.setGravity(Gravity.CENTER);
        caption.setPadding(0, dp(5), 0, 0);
        root.addView(caption);

        return new Control(root, icon, caption);
    }

    private LinearLayout roundAction(String symbol, String label, int color) {
        LinearLayout wrap = new LinearLayout(this);
        wrap.setOrientation(LinearLayout.VERTICAL);
        wrap.setGravity(Gravity.CENTER);

        TextView icon = text(symbol, 24, true);
        icon.setGravity(Gravity.CENTER);
        icon.setTextColor(Color.WHITE);
        icon.setBackground(roundRect(color, 99, color, 0));
        wrap.addView(icon, new LinearLayout.LayoutParams(dp(68), dp(68)));

        TextView caption = text(label, 12, true);
        caption.setTextColor(Color.rgb(218, 223, 229));
        caption.setGravity(Gravity.CENTER);
        caption.setPadding(0, dp(8), 0, 0);
        wrap.addView(caption);

        return wrap;
    }

    private void refresh() {
        Call call = OnTrackInCallService.currentCall();

        if (call == null) {
            finish();
            return;
        }

        String number = OnTrackInCallService.currentNumber();
        String name = OnTrackInCallService.currentContactName();

        String display = name == null || name.isEmpty()
                ? "Unknown caller"
                : name;

        nameView.setText(display);
        numberView.setText(number == null ? "" : number);
        avatarView.setText(initials(
                name == null || name.isEmpty()
                        ? (number == null || number.isEmpty() ? "?" : number)
                        : name));

        int state = call.getState();

        if (state == Call.STATE_RINGING) {
            stateView.setText("INCOMING CALL");
            stateView.setTextColor(Color.rgb(255, 190, 193));
            timerView.setText("");

            ringingActions.setVisibility(View.VISIBLE);
            activeActions.setVisibility(View.GONE);
            endCall.setVisibility(View.GONE);

        } else if (state == Call.STATE_DIALING || state == Call.STATE_CONNECTING) {
            stateView.setText("CALLING");
            stateView.setTextColor(AMBER);
            timerView.setText("");

            ringingActions.setVisibility(View.GONE);
            activeActions.setVisibility(View.VISIBLE);
            endCall.setVisibility(View.VISIBLE);

        } else if (state == Call.STATE_ACTIVE) {
            if (activeSince == 0L) activeSince = System.currentTimeMillis();

            stateView.setText("CONNECTED");
            stateView.setTextColor(GREEN);
            timerView.setText(formatDuration(
                    (System.currentTimeMillis() - activeSince) / 1000L));

            ringingActions.setVisibility(View.GONE);
            activeActions.setVisibility(View.VISIBLE);
            endCall.setVisibility(View.VISIBLE);

        } else if (state == Call.STATE_HOLDING) {
            stateView.setText("ON HOLD");
            stateView.setTextColor(AMBER);

            ringingActions.setVisibility(View.GONE);
            activeActions.setVisibility(View.VISIBLE);
            endCall.setVisibility(View.VISIBLE);

        } else if (state == Call.STATE_DISCONNECTED) {
            stateView.setText("CALL ENDED");
            stateView.setTextColor(MUTED);
            timerView.setText("");

            ringingActions.setVisibility(View.GONE);
            activeActions.setVisibility(View.GONE);
            endCall.setVisibility(View.GONE);

            handler.postDelayed(this::finish, 750L);

        } else {
            stateView.setText("CALL IN PROGRESS");
        }

        boolean canAdd = OnTrackInCallService.canAddCallNow();
        int activeCalls = OnTrackInCallService.activeCallCountNow();
        int conferenceable = OnTrackInCallService.conferenceableCountNow();

        setControlEnabled(addCallControl, canAdd);
        addCallControl.caption.setText(canAdd ? "Add call" : "Unavailable");

        boolean mergeReady = activeCalls >= 2 && conferenceable > 0;
        setControlEnabled(mergeControl, mergeReady);
        mergeControl.caption.setText(mergeReady ? "Merge calls" : "Merge");

        CallAudioState audio = OnTrackInCallService.audioState();

        if (audio != null) {
            boolean muted = audio.isMuted();
            muteControl.caption.setText(muted ? "Unmute" : "Mute");
            muteControl.icon.setText(muted ? "U" : "M");
            muteControl.root.setBackground(roundRect(
                    muted ? Color.rgb(58, 30, 34) : PANEL_2,
                    18,
                    muted ? Color.rgb(95, 38, 44) : LINE,
                    1));

            boolean speaker =
                    (audio.getRoute() & CallAudioState.ROUTE_SPEAKER) != 0;

            speakerControl.caption.setText(speaker ? "Earpiece" : "Speaker");
            speakerControl.icon.setText(speaker ? "E" : "S");
            speakerControl.root.setBackground(roundRect(
                    speaker ? Color.rgb(35, 48, 44) : PANEL_2,
                    18,
                    speaker ? Color.rgb(47, 91, 75) : LINE,
                    1));
        }
    }

    private void setControlEnabled(Control control, boolean enabled) {
        control.root.setEnabled(enabled);
        control.root.setAlpha(enabled ? 1f : .38f);
    }

    private String initials(String value) {
        if (value == null || value.trim().isEmpty()) return "?";

        String clean = value.trim();
        String[] parts = clean.split("\\s+");

        if (parts.length == 1) {
            return clean.substring(0, 1).toUpperCase(Locale.ROOT);
        }

        return (parts[0].substring(0, 1)
                + parts[parts.length - 1].substring(0, 1))
                .toUpperCase(Locale.ROOT);
    }

    private String formatDuration(long seconds) {
        long hours = seconds / 3600;
        long minutes = (seconds % 3600) / 60;
        long remain = seconds % 60;

        return hours > 0
                ? String.format(Locale.US, "%02d:%02d:%02d", hours, minutes, remain)
                : String.format(Locale.US, "%02d:%02d", minutes, remain);
    }

    private GradientDrawable gradientBackground() {
        GradientDrawable drawable = new GradientDrawable(
                GradientDrawable.Orientation.TOP_BOTTOM,
                new int[]{
                        Color.rgb(24, 16, 19),
                        BG,
                        BG
                });
        return drawable;
    }

    private TextView text(String value, int sp, boolean bold) {
        TextView t = new TextView(this);
        t.setText(value);
        t.setTextColor(TEXT);
        t.setTextSize(sp);
        t.setIncludeFontPadding(false);

        if (bold) {
            t.setTypeface(Typeface.DEFAULT, Typeface.BOLD);
        }

        return t;
    }

    private GradientDrawable roundRect(
            int fill,
            int radius,
            int stroke,
            int strokeWidth) {

        GradientDrawable d = new GradientDrawable();
        d.setColor(fill);
        d.setCornerRadius(dp(radius));

        if (strokeWidth > 0) {
            d.setStroke(dp(strokeWidth), stroke);
        }

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

    private static final class Control {
        final LinearLayout root;
        final TextView icon;
        final TextView caption;

        Control(LinearLayout root, TextView icon, TextView caption) {
            this.root = root;
            this.icon = icon;
            this.caption = caption;
        }
    }
}
