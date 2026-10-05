package com.ontrack.agentphone;

import android.Manifest;
import android.app.Activity;
import android.app.role.RoleManager;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.graphics.Color;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.provider.Settings;
import android.telecom.TelecomManager;
import android.view.Gravity;
import android.view.View;
import android.widget.Button;
import android.widget.EditText;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.TextView;
import android.widget.Toast;

import org.json.JSONObject;

public class MainActivity extends Activity {
    private static final int REQ_PERMS = 21;
    private static final int REQ_ROLE = 22;

    private static final int BG = Color.rgb(8, 9, 11);
    private static final int PANEL = Color.rgb(18, 20, 24);
    private static final int LINE = Color.rgb(43, 47, 55);
    private static final int TEXT = Color.rgb(247, 247, 248);
    private static final int MUTED = Color.rgb(145, 151, 162);
    private static final int RED = Color.rgb(229, 37, 42);
    private static final int GREEN = Color.rgb(49, 196, 141);
    private static final int AMBER = Color.rgb(246, 173, 60);

    private EditText server;
    private EditText pairCode;
    private EditText simPhone;
    private EditText deviceName;
    private EditText quickDial;

    private TextView pairState;
    private TextView dialerState;
    private TextView bridgeState;
    private TextView contactsState;
    private TextView deviceMeta;

    private Button pairButton;
    private Button dialerButton;
    private Button startButton;
    private Button stopButton;
    private Button syncButton;

    @Override public void onCreate(Bundle state) {
        super.onCreate(state);
        getWindow().setStatusBarColor(BG);
        getWindow().setNavigationBarColor(BG);
        buildUi();
        requestRuntimePermissions();
        handleDialIntent(getIntent());
        refreshStatus();
    }

    @Override protected void onResume() {
        super.onResume();
        refreshStatus();
    }

    @Override protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        handleDialIntent(intent);
    }

    private void buildUi() {
        ScrollView scroll = new ScrollView(this);
        scroll.setFillViewport(true);
        scroll.setBackgroundColor(BG);

        LinearLayout root = vertical();
        root.setPadding(dp(18), dp(22), dp(18), dp(34));
        scroll.addView(root, new ScrollView.LayoutParams(-1, -2));

        root.addView(buildHeader());
        root.addView(space(18));
        root.addView(buildStatusCard());
        root.addView(space(14));
        root.addView(buildQuickDialCard());
        root.addView(space(14));
        root.addView(buildContactsCard());
        root.addView(space(14));
        root.addView(buildConnectionCard());
        root.addView(space(14));
        root.addView(buildControlsCard());
        root.addView(space(14));
        root.addView(buildInfoCard());

        setContentView(scroll);
    }

    private View buildHeader() {
        LinearLayout row = horizontal();
        row.setGravity(Gravity.CENTER_VERTICAL);

        TextView logo = text("OT", 17, true);
        logo.setGravity(Gravity.CENTER);
        logo.setBackground(roundRect(RED, 14, RED, 0));
        row.addView(logo, new LinearLayout.LayoutParams(dp(52), dp(52)));

        LinearLayout copy = vertical();
        LinearLayout.LayoutParams copyParams = new LinearLayout.LayoutParams(0, -2, 1f);
        copyParams.setMargins(dp(14), 0, 0, 0);

        TextView title = text("OnTrack AI Phone", 25, true);
        TextView subtitle = text("Android telephony bridge", 13, false);
        subtitle.setTextColor(MUTED);
        copy.addView(title);
        copy.addView(subtitle);

        TextView version = text("v0.2.0", 11, true);
        version.setTextColor(Color.rgb(255, 166, 169));
        version.setPadding(dp(10), dp(6), dp(10), dp(6));
        version.setBackground(roundRect(Color.rgb(61, 23, 27), 99, Color.rgb(84, 30, 34), 1));

        row.addView(copy, copyParams);
        row.addView(version);

        return row;
    }

    private View buildStatusCard() {
        LinearLayout card = card();

        TextView kicker = text("PHONE STATUS", 11, true);
        kicker.setTextColor(MUTED);
        kicker.setLetterSpacing(.10f);
        card.addView(kicker);

        LinearLayout heading = horizontal();
        heading.setGravity(Gravity.CENTER_VERTICAL);
        heading.setPadding(0, dp(14), 0, 0);

        TextView phone = text("OnTrack Phone", 20, true);
        pairState = pill("NOT PAIRED", AMBER);

        heading.addView(phone, new LinearLayout.LayoutParams(0, -2, 1f));
        heading.addView(pairState);
        card.addView(heading);

        deviceMeta = text("", 12, false);
        deviceMeta.setTextColor(MUTED);
        deviceMeta.setLineSpacing(0, 1.15f);
        deviceMeta.setPadding(0, dp(8), 0, dp(13));
        card.addView(deviceMeta);

        dialerState = pill("REQUIRED", AMBER);
        bridgeState = pill("STOPPED", AMBER);
        contactsState = pill("REQUIRED", AMBER);

        card.addView(statusLine("Default phone app", dialerState));
        card.addView(divider());
        card.addView(statusLine("Background bridge", bridgeState));
        card.addView(divider());
        card.addView(statusLine("Contacts access", contactsState));

        return card;
    }

    private View buildQuickDialCard() {
        LinearLayout card = card();
        card.addView(sectionTitle("Quick call"));

        TextView description = text("Call directly through this phone's SIM.", 12, false);
        description.setTextColor(MUTED);
        description.setPadding(0, dp(4), 0, dp(12));
        card.addView(description);

        LinearLayout row = horizontal();
        row.setGravity(Gravity.CENTER_VERTICAL);

        quickDial = input("Phone number", "");
        quickDial.setInputType(android.text.InputType.TYPE_CLASS_PHONE);
        LinearLayout.LayoutParams inputParams = new LinearLayout.LayoutParams(0, dp(52), 1f);
        inputParams.setMargins(0, 0, dp(10), 0);
        row.addView(quickDial, inputParams);

        Button call = compactButton("CALL", RED);
        call.setOnClickListener(v -> dial(quickDial.getText().toString()));
        row.addView(call, new LinearLayout.LayoutParams(dp(94), dp(52)));

        card.addView(row);
        return card;
    }

    private View buildContactsCard() {
        LinearLayout card = card();
        card.addView(sectionTitle("Contacts"));

        TextView description = text(
                "Browse contacts on this phone. Sync sends only contact name + phone number to the dashboard.",
                12,
                false);
        description.setTextColor(MUTED);
        description.setLineSpacing(0, 1.15f);
        description.setPadding(0, dp(4), 0, dp(13));
        card.addView(description);

        Button open = actionButton("Open phone contacts", Color.rgb(38, 42, 49), TEXT);
        open.setOnClickListener(v -> {
            if (!ContactHelper.allowed(this)) {
                requestPermissions(new String[]{Manifest.permission.READ_CONTACTS}, 31);
            } else {
                startActivity(new Intent(this, ContactsActivity.class));
            }
        });
        card.addView(open);

        syncButton = actionButton(
                "Sync contacts to dashboard",
                Color.rgb(57, 23, 27),
                Color.rgb(255, 186, 188));
        syncButton.setOnClickListener(v -> syncContacts());
        card.addView(syncButton);

        return card;
    }

    private View buildConnectionCard() {
        LinearLayout card = card();
        card.addView(sectionTitle("Dashboard connection"));

        TextView description = text(
                "Pair this phone once using the 6-digit code generated on agent.ontrackegy.com.",
                12,
                false);
        description.setTextColor(MUTED);
        description.setPadding(0, dp(4), 0, dp(14));
        card.addView(description);

        server = input("Server URL", AppState.server(this));
        card.addView(field("SERVER", server));

        pairCode = input("6-digit pairing code", "");
        pairCode.setInputType(android.text.InputType.TYPE_CLASS_NUMBER);
        card.addView(field("PAIRING CODE", pairCode));

        simPhone = input("This SIM phone number", AppState.phone(this));
        simPhone.setInputType(android.text.InputType.TYPE_CLASS_PHONE);
        card.addView(field("SIM NUMBER", simPhone));

        deviceName = input("Device name", Build.MANUFACTURER + " " + Build.MODEL);
        card.addView(field("DEVICE NAME", deviceName));

        pairButton = actionButton("Pair with dashboard", RED, Color.WHITE);
        pairButton.setOnClickListener(v -> pair());
        card.addView(pairButton);

        return card;
    }

    private View buildControlsCard() {
        LinearLayout card = card();
        card.addView(sectionTitle("Phone controls"));

        dialerButton = actionButton("Set as default phone app", Color.rgb(38, 42, 49), TEXT);
        dialerButton.setOnClickListener(v -> requestDialerRole());
        card.addView(dialerButton);

        startButton = actionButton(
                "Start bridge service",
                Color.rgb(18, 85, 64),
                Color.rgb(157, 244, 207));
        startButton.setOnClickListener(v -> startBridge());
        card.addView(startButton);

        stopButton = actionButton(
                "Stop bridge service",
                Color.rgb(54, 30, 32),
                Color.rgb(255, 171, 174));
        stopButton.setOnClickListener(v -> {
            stopService(new Intent(this, BridgeService.class));
            AppState.setBridgeEnabled(this, false);
            refreshStatus();
            toast("Bridge stopped");
        });
        card.addView(stopButton);

        Button settings = ghostButton("Android app settings");
        settings.setOnClickListener(v -> openSettings());
        card.addView(settings);

        Button unpair = ghostButton("Unpair this device");
        unpair.setTextColor(Color.rgb(255, 143, 147));
        unpair.setOnClickListener(v -> {
            stopService(new Intent(this, BridgeService.class));
            AppState.clearPair(this);
            refreshStatus();
            toast("Device unpaired");
        });
        card.addView(unpair);

        return card;
    }

    private View buildInfoCard() {
        LinearLayout card = card();
        card.setBackground(roundRect(Color.rgb(13, 15, 18), 18, LINE, 1));

        TextView title = text("POC v0.2.0", 13, true);
        title.setTextColor(Color.rgb(255, 179, 181));
        card.addView(title);

        TextView body = text(
                "Active now: quick dial, phone contacts, contact sync, caller name lookup, incoming detection, policy auto-answer and SIM outbound calls.\n\nNext: carrier conference + Voice Agent media bridge + server-side call recordings.",
                12,
                false);
        body.setTextColor(MUTED);
        body.setLineSpacing(0, 1.18f);
        body.setPadding(0, dp(7), 0, 0);
        card.addView(body);

        return card;
    }

    private void pair() {
        String base = server.getText().toString().trim();
        String code = pairCode.getText().toString().trim();
        String number = simPhone.getText().toString().trim();
        String name = deviceName.getText().toString().trim();

        if (!base.startsWith("https://")) {
            toast("Server must use HTTPS");
            return;
        }

        if (!code.matches("\\d{6}")) {
            toast("Enter the 6-digit pairing code");
            return;
        }

        pairButton.setEnabled(false);
        pairButton.setText("Pairing...");

        new Thread(() -> {
            try {
                JSONObject body = new JSONObject();
                body.put("pairing_code", code);
                body.put("name", name.isEmpty() ? "Android Phone" : name);
                body.put("phone_number", number);
                body.put("manufacturer", Build.MANUFACTURER);
                body.put("model", Build.MODEL);
                body.put("app_version", "0.2.0-poc");

                JSONObject out = ApiClient.post(
                        base,
                        "/api/device/register.php",
                        body,
                        null);

                AppState.savePair(
                        this,
                        base,
                        out.getString("device_token"),
                        out.getInt("device_id"),
                        number);

                runOnUiThread(() -> {
                    pairCode.setText("");
                    pairButton.setEnabled(true);
                    refreshStatus();
                    startBridge();
                    if (ContactHelper.allowed(this)) syncContacts();
                    toast("Phone connected to dashboard");
                });

            } catch (Exception e) {
                runOnUiThread(() -> {
                    pairButton.setEnabled(true);
                    pairButton.setText("Pair with dashboard");
                    toast("Pair failed: " + e.getMessage());
                });
            }
        }, "OnTrackPair").start();
    }

    private void dial(String number) {
        String normalized = ContactHelper.normalize(number);

        if (normalized.length() < 5) {
            toast("Enter a valid phone number");
            return;
        }

        if (Build.VERSION.SDK_INT >= 23
                && checkSelfPermission(Manifest.permission.CALL_PHONE) != PackageManager.PERMISSION_GRANTED) {
            requestPermissions(new String[]{Manifest.permission.CALL_PHONE}, 32);
            return;
        }

        TelecomManager telecom = (TelecomManager)getSystemService(TELECOM_SERVICE);

        if (telecom == null) {
            toast("Phone service unavailable");
            return;
        }

        telecom.placeCall(Uri.parse("tel:" + normalized), new Bundle());
    }

    private void syncContacts() {
        if (!AppState.paired(this)) {
            toast("Pair the phone first");
            return;
        }

        if (!ContactHelper.allowed(this)) {
            requestPermissions(new String[]{Manifest.permission.READ_CONTACTS}, 31);
            return;
        }

        syncButton.setEnabled(false);
        syncButton.setText("Syncing contacts...");

        ContactHelper.syncAsync(this, (count, error) -> {
            syncButton.setEnabled(true);
            syncButton.setText("Sync contacts to dashboard");
            refreshStatus();

            if (error != null) {
                toast("Sync failed: " + error.getMessage());
            } else {
                toast(count + " contacts synced");
            }
        });
    }

    private void requestDialerRole() {
        if (Build.VERSION.SDK_INT >= 29) {
            RoleManager manager = (RoleManager)getSystemService(ROLE_SERVICE);

            if (manager != null && manager.isRoleAvailable(RoleManager.ROLE_DIALER)) {
                startActivityForResult(
                        manager.createRequestRoleIntent(RoleManager.ROLE_DIALER),
                        REQ_ROLE);
                return;
            }
        }

        Intent intent = new Intent(TelecomManager.ACTION_CHANGE_DEFAULT_DIALER);
        intent.putExtra(
                TelecomManager.EXTRA_CHANGE_DEFAULT_DIALER_PACKAGE_NAME,
                getPackageName());
        startActivityForResult(intent, REQ_ROLE);
    }

    private void startBridge() {
        if (!AppState.paired(this)) {
            toast("Pair the device first");
            return;
        }

        try {
            Intent intent = new Intent(this, BridgeService.class);

            if (Build.VERSION.SDK_INT >= 26) {
                startForegroundService(intent);
            } else {
                startService(intent);
            }

            AppState.setBridgeEnabled(this, true);
            refreshStatus();
            toast("Bridge is running");

        } catch (Exception e) {
            AppState.setBridgeEnabled(this, false);
            refreshStatus();
            toast("Could not start bridge: " + e.getMessage());
        }
    }

    private void handleDialIntent(Intent intent) {
        if (intent == null || !Intent.ACTION_DIAL.equals(intent.getAction())) return;

        String number = intent.getData() == null
                ? ""
                : intent.getData().getSchemeSpecificPart();

        if (number != null && !number.isEmpty() && quickDial != null) {
            quickDial.setText(number);
            quickDial.setSelection(quickDial.length());
            quickDial.requestFocus();
        }
    }

    private void requestRuntimePermissions() {
        if (Build.VERSION.SDK_INT < 23) return;

        java.util.ArrayList<String> permissions = new java.util.ArrayList<>();

        String[] wanted = {
                Manifest.permission.CALL_PHONE,
                Manifest.permission.READ_PHONE_STATE,
                Manifest.permission.ANSWER_PHONE_CALLS,
                Manifest.permission.READ_PHONE_NUMBERS,
                Manifest.permission.READ_CONTACTS
        };

        for (String permission : wanted) {
            if (checkSelfPermission(permission) != PackageManager.PERMISSION_GRANTED) {
                permissions.add(permission);
            }
        }

        if (Build.VERSION.SDK_INT >= 33
                && checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
            permissions.add(Manifest.permission.POST_NOTIFICATIONS);
        }

        if (!permissions.isEmpty()) {
            requestPermissions(permissions.toArray(new String[0]), REQ_PERMS);
        }
    }

    @Override public void onRequestPermissionsResult(
            int requestCode,
            String[] permissions,
            int[] grantResults) {

        super.onRequestPermissionsResult(requestCode, permissions, grantResults);
        refreshStatus();

        if (requestCode == 31 && ContactHelper.allowed(this) && AppState.paired(this)) {
            syncContacts();
        }
    }

    private boolean isDefaultDialer() {
        TelecomManager telecom = (TelecomManager)getSystemService(TELECOM_SERVICE);
        return telecom != null && getPackageName().equals(telecom.getDefaultDialerPackage());
    }

    private void refreshStatus() {
        if (pairState == null) return;

        boolean paired = AppState.paired(this);
        boolean dialer = isDefaultDialer();
        boolean bridge = AppState.bridgeEnabled(this);
        boolean contacts = ContactHelper.allowed(this);

        stylePill(pairState, paired ? "CONNECTED" : "NOT PAIRED", paired ? GREEN : AMBER);
        stylePill(dialerState, dialer ? "ACTIVE" : "REQUIRED", dialer ? GREEN : AMBER);
        stylePill(bridgeState, bridge ? "RUNNING" : "STOPPED", bridge ? GREEN : AMBER);
        stylePill(contactsState, contacts ? "ALLOWED" : "REQUIRED", contacts ? GREEN : AMBER);

        String number = AppState.phone(this).isEmpty()
                ? "SIM number not set"
                : AppState.phone(this);

        String id = paired
                ? "Device #" + AppState.deviceId(this)
                : "Waiting for pairing";

        String synced = AppState.lastContactSync(this) > 0
                ? "contacts synced"
                : "contacts not synced";

        deviceMeta.setText(
                id + "  •  " + number + "\n" +
                AppState.server(this) + "  •  " + synced);

        pairButton.setText(paired
                ? "Pair another / refresh connection"
                : "Pair with dashboard");

        dialerButton.setText(dialer
                ? "Default phone app is active"
                : "Set as default phone app");

        startButton.setEnabled(paired && !bridge);
        stopButton.setEnabled(bridge);
        syncButton.setEnabled(paired && contacts);

        startButton.setAlpha(startButton.isEnabled() ? 1f : .45f);
        stopButton.setAlpha(stopButton.isEnabled() ? 1f : .45f);
        syncButton.setAlpha(syncButton.isEnabled() ? 1f : .45f);
    }

    private View statusLine(String label, TextView value) {
        LinearLayout row = horizontal();
        row.setGravity(Gravity.CENTER_VERTICAL);
        row.setPadding(0, dp(11), 0, dp(11));

        TextView text = text(label, 13, true);
        text.setTextColor(Color.rgb(214, 217, 222));

        row.addView(text, new LinearLayout.LayoutParams(0, -2, 1f));
        row.addView(value);

        return row;
    }

    private LinearLayout card() {
        LinearLayout card = vertical();
        card.setPadding(dp(17), dp(17), dp(17), dp(17));
        card.setBackground(roundRect(PANEL, 18, LINE, 1));
        return card;
    }

    private TextView sectionTitle(String value) {
        TextView title = text(value, 17, true);
        title.setPadding(0, 0, 0, dp(3));
        return title;
    }

    private View field(String label, EditText input) {
        LinearLayout wrapper = vertical();

        TextView caption = text(label, 10, true);
        caption.setTextColor(MUTED);
        caption.setLetterSpacing(.08f);
        caption.setPadding(dp(2), 0, 0, dp(6));

        wrapper.addView(caption);
        wrapper.addView(input);

        LinearLayout.LayoutParams params = new LinearLayout.LayoutParams(-1, -2);
        params.setMargins(0, 0, 0, dp(13));
        wrapper.setLayoutParams(params);

        return wrapper;
    }

    private EditText input(String hint, String value) {
        EditText field = new EditText(this);
        field.setHint(hint);
        field.setHintTextColor(Color.rgb(100, 106, 117));
        field.setText(value);
        field.setTextColor(TEXT);
        field.setTextSize(14);
        field.setSingleLine(true);
        field.setPadding(dp(14), dp(11), dp(14), dp(11));
        field.setBackground(roundRect(Color.rgb(10, 12, 15), 12, LINE, 1));
        return field;
    }

    private Button actionButton(String label, int background, int foreground) {
        Button button = new Button(this);
        button.setText(label);
        button.setTextColor(foreground);
        button.setTextSize(13);
        button.setTypeface(Typeface.DEFAULT, Typeface.BOLD);
        button.setAllCaps(false);
        button.setGravity(Gravity.CENTER);
        button.setBackground(roundRect(background, 12, background, 0));

        LinearLayout.LayoutParams params = new LinearLayout.LayoutParams(-1, dp(50));
        params.setMargins(0, dp(5), 0, dp(5));
        button.setLayoutParams(params);

        return button;
    }

    private Button compactButton(String label, int background) {
        Button button = new Button(this);
        button.setText(label);
        button.setTextColor(Color.WHITE);
        button.setTextSize(12);
        button.setTypeface(Typeface.DEFAULT, Typeface.BOLD);
        button.setAllCaps(false);
        button.setGravity(Gravity.CENTER);
        button.setBackground(roundRect(background, 12, background, 0));
        return button;
    }

    private Button ghostButton(String label) {
        return actionButton(label, Color.rgb(28, 31, 36), Color.rgb(202, 206, 213));
    }

    private TextView pill(String value, int color) {
        TextView view = text(value, 10, true);
        stylePill(view, value, color);
        return view;
    }

    private void stylePill(TextView view, String value, int color) {
        view.setText(value);
        view.setTextColor(color);
        view.setPadding(dp(10), dp(6), dp(10), dp(6));
        view.setBackground(roundRect(
                Color.rgb(26, 29, 34),
                99,
                Color.rgb(50, 54, 62),
                1));
    }

    private View divider() {
        View view = new View(this);
        view.setBackgroundColor(LINE);
        view.setLayoutParams(new LinearLayout.LayoutParams(-1, dp(1)));
        return view;
    }

    private LinearLayout vertical() {
        LinearLayout layout = new LinearLayout(this);
        layout.setOrientation(LinearLayout.VERTICAL);
        return layout;
    }

    private LinearLayout horizontal() {
        LinearLayout layout = new LinearLayout(this);
        layout.setOrientation(LinearLayout.HORIZONTAL);
        return layout;
    }

    private View space(int heightDp) {
        View view = new View(this);
        view.setLayoutParams(new LinearLayout.LayoutParams(1, dp(heightDp)));
        return view;
    }

    private TextView text(String value, int sp, boolean bold) {
        TextView view = new TextView(this);
        view.setText(value);
        view.setTextColor(TEXT);
        view.setTextSize(sp);
        if (bold) view.setTypeface(Typeface.DEFAULT, Typeface.BOLD);
        return view;
    }

    private GradientDrawable roundRect(int fill, int radius, int stroke, int strokeWidth) {
        GradientDrawable drawable = new GradientDrawable();
        drawable.setColor(fill);
        drawable.setCornerRadius(dp(radius));
        if (strokeWidth > 0) {
            drawable.setStroke(dp(strokeWidth), stroke);
        }
        return drawable;
    }

    private void openSettings() {
        startActivity(new Intent(
                Settings.ACTION_APPLICATION_DETAILS_SETTINGS,
                Uri.parse("package:" + getPackageName())));
    }

    private int dp(int value) {
        return Math.round(value * getResources().getDisplayMetrics().density);
    }

    private void toast(String message) {
        Toast.makeText(this, message, Toast.LENGTH_SHORT).show();
    }
}
