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
import android.text.InputType;
import android.view.Gravity;
import android.view.View;
import android.widget.Button;
import android.widget.EditText;
import android.widget.FrameLayout;
import android.widget.GridLayout;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.TextView;
import android.widget.Toast;

import org.json.JSONObject;

import java.util.List;

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

    private FrameLayout body;
    private TextView headerState;
    private String activeTab = "calls";
    private String pendingDialNumber = "";

    private EditText dialNumber;
    private EditText serverField;
    private EditText pairCodeField;
    private EditText simField;
    private EditText deviceField;

    @Override public void onCreate(Bundle state) {
        super.onCreate(state);
        getWindow().setStatusBarColor(BG);
        getWindow().setNavigationBarColor(BG);

        buildShell();
        requestRuntimePermissions();
        handleDialIntent(getIntent());
        showTab("calls");
    }

    @Override protected void onResume() {
        super.onResume();
        refreshHeader();
        if ("calls".equals(activeTab)) showTab("calls");
    }

    @Override protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        handleDialIntent(intent);
        showTab("calls");
    }

    private void buildShell() {
        LinearLayout root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setBackgroundColor(BG);

        root.addView(buildHeader());

        body = new FrameLayout(this);
        root.addView(body, new LinearLayout.LayoutParams(-1, 0, 1f));

        root.addView(buildBottomNav());

        setContentView(root);
        refreshHeader();
    }

    private View buildHeader() {
        LinearLayout row = horizontal();
        row.setGravity(Gravity.CENTER_VERTICAL);
        row.setPadding(dp(18), dp(14), dp(18), dp(12));
        row.setBackgroundColor(Color.rgb(10, 11, 14));

        TextView logo = text("OT", 15, true);
        logo.setGravity(Gravity.CENTER);
        logo.setBackground(roundRect(RED, 13, RED, 0));
        row.addView(logo, new LinearLayout.LayoutParams(dp(44), dp(44)));

        LinearLayout titleWrap = vertical();
        LinearLayout.LayoutParams titleParams = new LinearLayout.LayoutParams(0, -2, 1f);
        titleParams.setMargins(dp(12), 0, dp(8), 0);

        TextView title = text("OnTrack Phone", 20, true);
        TextView sub = text("AI Telephony", 11, false);
        sub.setTextColor(MUTED);

        titleWrap.addView(title);
        titleWrap.addView(sub);
        row.addView(titleWrap, titleParams);

        headerState = text("OFFLINE", 10, true);
        headerState.setPadding(dp(10), dp(6), dp(10), dp(6));
        row.addView(headerState);

        return row;
    }

    private View buildBottomNav() {
        LinearLayout nav = horizontal();
        nav.setPadding(dp(8), dp(7), dp(8), dp(8));
        nav.setBackgroundColor(Color.rgb(12, 13, 16));

        nav.addView(navButton("Calls", "calls"), weighted());
        nav.addView(navButton("Contacts", "contacts"), weighted());
        nav.addView(navButton("Messages", "messages"), weighted());
        nav.addView(navButton("Link", "link"), weighted());
        nav.addView(navButton("Settings", "settings"), weighted());

        return nav;
    }

    private LinearLayout.LayoutParams weighted() {
        return new LinearLayout.LayoutParams(0, dp(52), 1f);
    }

    private Button navButton(String label, String tab) {
        Button b = new Button(this);
        b.setText(label);
        b.setTextSize(10);
        b.setAllCaps(false);
        b.setTextColor(MUTED);
        b.setTypeface(Typeface.DEFAULT, Typeface.BOLD);
        b.setBackgroundColor(Color.TRANSPARENT);
        b.setTag(tab);
        b.setOnClickListener(v -> showTab(tab));
        return b;
    }

    private void styleNav() {
        View root = (View) body.getParent();
        if (!(root instanceof LinearLayout)) return;
        LinearLayout shell = (LinearLayout) root;
        View navView = shell.getChildAt(shell.getChildCount() - 1);
        if (!(navView instanceof LinearLayout)) return;

        LinearLayout nav = (LinearLayout) navView;
        for (int i = 0; i < nav.getChildCount(); i++) {
            View child = nav.getChildAt(i);
            if (!(child instanceof Button)) continue;
            Button b = (Button) child;
            boolean active = activeTab.equals(String.valueOf(b.getTag()));
            b.setTextColor(active ? Color.WHITE : MUTED);
            b.setBackground(active
                    ? roundRect(Color.rgb(39, 25, 28), 11, Color.rgb(78, 34, 39), 1)
                    : roundRect(Color.TRANSPARENT, 11, Color.TRANSPARENT, 0));
        }
    }

    private void showTab(String tab) {
        activeTab = tab;
        body.removeAllViews();

        View page;
        switch (tab) {
            case "contacts": page = buildContactsPage(); break;
            case "messages": page = buildMessagesPage(); break;
            case "link": page = buildLinkPage(); break;
            case "settings": page = buildSettingsPage(); break;
            case "calls":
            default: page = buildCallsPage(); break;
        }

        body.addView(page, new FrameLayout.LayoutParams(-1, -1));
        styleNav();
        refreshHeader();
    }

    private View buildCallsPage() {
        LinearLayout page = page();

        TextView title = text("Calls", 28, true);
        TextView subtitle = text("Dial from your SIM and review recent phone calls.", 12, false);
        subtitle.setTextColor(MUTED);

        page.addView(title);
        page.addView(subtitle);
        page.addView(space(18));

        LinearLayout dialer = card();

        dialNumber = input("Enter phone number", pendingDialNumber);
        dialNumber.setInputType(InputType.TYPE_CLASS_PHONE);
        dialNumber.setGravity(Gravity.CENTER);
        dialNumber.setTextSize(24);
        dialNumber.setPadding(dp(14), dp(13), dp(14), dp(13));
        dialer.addView(dialNumber);

        GridLayout keypad = new GridLayout(this);
        keypad.setColumnCount(3);
        keypad.setRowCount(4);
        keypad.setPadding(0, dp(12), 0, dp(8));

        String[] keys = {"1","2","3","4","5","6","7","8","9","*","0","#"};
        for (String key : keys) {
            Button b = keypadButton(key);
            b.setOnClickListener(v -> appendDial(key));
            GridLayout.LayoutParams params = new GridLayout.LayoutParams();
            params.width = 0;
            params.height = dp(54);
            params.columnSpec = GridLayout.spec(GridLayout.UNDEFINED, 1f);
            params.setMargins(dp(4), dp(4), dp(4), dp(4));
            keypad.addView(b, params);
        }

        dialer.addView(keypad);

        LinearLayout actions = horizontal();

        Button backspace = actionButton("⌫", Color.rgb(35, 39, 45), TEXT);
        backspace.setOnClickListener(v -> backspaceDial());

        Button call = actionButton("Call", Color.rgb(20, 110, 79), Color.WHITE);
        call.setOnClickListener(v -> dial(dialNumber.getText().toString()));

        LinearLayout.LayoutParams half = new LinearLayout.LayoutParams(0, dp(50), 1f);
        half.setMargins(dp(4), dp(4), dp(4), dp(4));

        actions.addView(backspace, half);
        actions.addView(call, half);

        dialer.addView(actions);
        page.addView(dialer);

        page.addView(space(18));

        LinearLayout recentHeader = horizontal();
        recentHeader.setGravity(Gravity.CENTER_VERTICAL);
        recentHeader.addView(text("Recent calls", 18, true), new LinearLayout.LayoutParams(0, -2, 1f));

        if (!CallLogHelper.allowed(this)) {
            Button allow = compactButton("Allow call history", RED);
            allow.setOnClickListener(v ->
                    requestPermissions(new String[]{Manifest.permission.READ_CALL_LOG}, 45));
            recentHeader.addView(allow);
        }

        page.addView(recentHeader);
        page.addView(space(8));

        if (CallLogHelper.allowed(this)) {
            List<CallLogHelper.Entry> entries = CallLogHelper.recent(this, 25);
            if (entries.isEmpty()) {
                page.addView(emptyView("No recent calls yet."));
            } else {
                for (CallLogHelper.Entry entry : entries) {
                    page.addView(callLogRow(entry));
                    page.addView(space(7));
                }
            }
        } else {
            page.addView(emptyView("Allow Call Log access to show your recent calls here."));
        }

        return scroll(page);
    }

    private View callLogRow(CallLogHelper.Entry entry) {
        LinearLayout row = horizontal();
        row.setGravity(Gravity.CENTER_VERTICAL);
        row.setPadding(dp(14), dp(12), dp(12), dp(12));
        row.setBackground(roundRect(PANEL, 14, LINE, 1));
        row.setOnClickListener(v -> {
            pendingDialNumber = entry.number;
            showTab("calls");
        });

        LinearLayout info = vertical();

        TextView name = text(
                entry.name.isEmpty() ? entry.number : entry.name,
                15,
                true);

        TextView meta = text(
                (entry.name.isEmpty() ? "" : entry.number + " · ")
                        + entry.typeLabel()
                        + " · "
                        + entry.timeLabel(),
                11,
                false);
        meta.setTextColor(MUTED);

        info.addView(name);
        info.addView(meta);

        row.addView(info, new LinearLayout.LayoutParams(0, -2, 1f));

        TextView duration = text(entry.durationLabel(), 12, true);
        duration.setTextColor(entry.typeLabel().equals("Missed")
                ? Color.rgb(255, 140, 144)
                : Color.rgb(190, 196, 205));

        row.addView(duration);
        return row;
    }

    private View buildContactsPage() {
        LinearLayout page = page();

        page.addView(text("Contacts", 28, true));

        TextView subtitle = text(
                "Names and phone numbers from this Android phone.",
                12,
                false);
        subtitle.setTextColor(MUTED);
        page.addView(subtitle);
        page.addView(space(14));

        if (!ContactHelper.allowed(this)) {
            LinearLayout card = card();
            card.addView(text("Contacts permission required", 17, true));
            TextView body = text(
                    "Allow contacts so the dialer can identify callers and sync names + phone numbers to the dashboard.",
                    12,
                    false);
            body.setTextColor(MUTED);
            body.setPadding(0, dp(7), 0, dp(12));
            card.addView(body);

            Button allow = actionButton("Allow contacts", RED, Color.WHITE);
            allow.setOnClickListener(v ->
                    requestPermissions(new String[]{Manifest.permission.READ_CONTACTS}, 31));
            card.addView(allow);

            page.addView(card);
            return scroll(page);
        }

        List<ContactHelper.Entry> contacts = ContactHelper.load(this);

        LinearLayout topActions = horizontal();
        Button all = actionButton("Open all contacts", Color.rgb(35, 39, 45), TEXT);
        all.setOnClickListener(v -> startActivity(new Intent(this, ContactsActivity.class)));

        Button sync = actionButton("Sync to dashboard", Color.rgb(57, 23, 27), Color.rgb(255, 190, 192));
        sync.setOnClickListener(v -> syncContacts());

        LinearLayout.LayoutParams half = new LinearLayout.LayoutParams(0, dp(48), 1f);
        half.setMargins(dp(3), 0, dp(3), 0);
        topActions.addView(all, half);
        topActions.addView(sync, half);
        page.addView(topActions);
        page.addView(space(14));

        TextView count = text(contacts.size() + " contacts", 12, true);
        count.setTextColor(MUTED);
        page.addView(count);
        page.addView(space(8));

        int limit = Math.min(40, contacts.size());
        for (int i = 0; i < limit; i++) {
            page.addView(contactRow(contacts.get(i)));
            page.addView(space(7));
        }

        if (contacts.size() > limit) {
            TextView more = text(
                    "+" + (contacts.size() - limit) + " more — tap Open all contacts",
                    12,
                    false);
            more.setTextColor(MUTED);
            more.setGravity(Gravity.CENTER);
            more.setPadding(0, dp(10), 0, dp(10));
            page.addView(more);
        }

        return scroll(page);
    }

    private View contactRow(ContactHelper.Entry entry) {
        LinearLayout row = horizontal();
        row.setGravity(Gravity.CENTER_VERTICAL);
        row.setPadding(dp(14), dp(11), dp(11), dp(11));
        row.setBackground(roundRect(PANEL, 14, LINE, 1));

        LinearLayout info = vertical();
        TextView name = text(entry.name, 15, true);
        TextView phone = text(entry.phone, 11, false);
        phone.setTextColor(MUTED);

        info.addView(name);
        info.addView(phone);
        row.addView(info, new LinearLayout.LayoutParams(0, -2, 1f));

        Button call = compactButton("CALL", RED);
        call.setOnClickListener(v -> dial(entry.phone));
        row.addView(call);

        return row;
    }

    private View buildMessagesPage() {
        LinearLayout page = page();
        page.addView(text("Messages", 28, true));

        TextView subtitle = text(
                "SMS channel will live here as part of the phone bridge.",
                12,
                false);
        subtitle.setTextColor(MUTED);
        page.addView(subtitle);
        page.addView(space(18));

        LinearLayout card = card();
        TextView state = text("SMS BRIDGE NOT ENABLED YET", 13, true);
        state.setTextColor(AMBER);
        card.addView(state);

        TextView bodyText = text(
                "This tab is now part of the dialer layout, but v0.3 does not request SMS-role permissions or read/send messages yet. We will enable it separately so telephony permissions stay controlled.",
                12,
                false);
        bodyText.setTextColor(MUTED);
        bodyText.setLineSpacing(0, 1.15f);
        bodyText.setPadding(0, dp(9), 0, 0);
        card.addView(bodyText);

        page.addView(card);
        return scroll(page);
    }

    private View buildLinkPage() {
        LinearLayout page = page();

        page.addView(text("Link", 28, true));

        TextView subtitle = text(
                "Connect this SIM endpoint to the OnTrack dashboard.",
                12,
                false);
        subtitle.setTextColor(MUTED);
        page.addView(subtitle);
        page.addView(space(16));

        LinearLayout statusCard = card();
        statusCard.addView(text(
                AppState.paired(this) ? "CONNECTED" : "NOT PAIRED",
                18,
                true));

        TextView status = text(
                AppState.paired(this)
                        ? "Device #" + AppState.deviceId(this)
                            + "\n" + AppState.phone(this)
                            + "\n" + AppState.server(this)
                        : "Generate a pairing code from the dashboard and enter it below.",
                12,
                false);
        status.setTextColor(MUTED);
        status.setLineSpacing(0, 1.2f);
        status.setPadding(0, dp(8), 0, dp(3));
        statusCard.addView(status);

        page.addView(statusCard);
        page.addView(space(12));

        LinearLayout linkCard = card();

        serverField = input("Server URL", AppState.server(this));
        pairCodeField = input("6-digit pairing code", "");
        pairCodeField.setInputType(InputType.TYPE_CLASS_NUMBER);
        simField = input("SIM phone number", AppState.phone(this));
        simField.setInputType(InputType.TYPE_CLASS_PHONE);
        deviceField = input("Device name", Build.MANUFACTURER + " " + Build.MODEL);

        linkCard.addView(field("SERVER", serverField));
        linkCard.addView(field("PAIRING CODE", pairCodeField));
        linkCard.addView(field("SIM NUMBER", simField));
        linkCard.addView(field("DEVICE NAME", deviceField));

        Button pair = actionButton(
                AppState.paired(this) ? "Pair again / create new endpoint" : "Pair with dashboard",
                RED,
                Color.WHITE);
        pair.setOnClickListener(v -> pair(pair));

        linkCard.addView(pair);

        Button sync = actionButton(
                "Sync contacts now",
                Color.rgb(35, 39, 45),
                TEXT);
        sync.setEnabled(AppState.paired(this) && ContactHelper.allowed(this));
        sync.setAlpha(sync.isEnabled() ? 1f : .45f);
        sync.setOnClickListener(v -> syncContacts());
        linkCard.addView(sync);

        page.addView(linkCard);
        return scroll(page);
    }

    private View buildSettingsPage() {
        LinearLayout page = page();

        page.addView(text("Settings", 28, true));

        TextView subtitle = text(
                "Phone role, bridge service and local app controls.",
                12,
                false);
        subtitle.setTextColor(MUTED);
        page.addView(subtitle);
        page.addView(space(16));

        LinearLayout status = card();
        status.addView(settingsStateLine(
                "Default phone app",
                isDefaultDialer() ? "ACTIVE" : "REQUIRED",
                isDefaultDialer() ? GREEN : AMBER));
        status.addView(divider());
        status.addView(settingsStateLine(
                "Dashboard link",
                AppState.paired(this) ? "CONNECTED" : "NOT PAIRED",
                AppState.paired(this) ? GREEN : AMBER));
        status.addView(divider());
        status.addView(settingsStateLine(
                "Background bridge",
                AppState.bridgeEnabled(this) ? "RUNNING" : "STOPPED",
                AppState.bridgeEnabled(this) ? GREEN : AMBER));
        status.addView(divider());
        status.addView(settingsStateLine(
                "Contacts",
                ContactHelper.allowed(this) ? "ALLOWED" : "REQUIRED",
                ContactHelper.allowed(this) ? GREEN : AMBER));

        page.addView(status);
        page.addView(space(12));

        LinearLayout controls = card();

        Button dialer = actionButton(
                isDefaultDialer() ? "Default phone app is active" : "Set as default phone app",
                Color.rgb(35, 39, 45),
                TEXT);
        dialer.setOnClickListener(v -> requestDialerRole());
        controls.addView(dialer);

        Button start = actionButton("Start bridge service", Color.rgb(18, 85, 64), Color.rgb(157, 244, 207));
        start.setEnabled(AppState.paired(this) && !AppState.bridgeEnabled(this));
        start.setAlpha(start.isEnabled() ? 1f : .45f);
        start.setOnClickListener(v -> {
            startBridge();
            showTab("settings");
        });
        controls.addView(start);

        Button stop = actionButton("Stop bridge service", Color.rgb(54, 30, 32), Color.rgb(255, 171, 174));
        stop.setEnabled(AppState.bridgeEnabled(this));
        stop.setAlpha(stop.isEnabled() ? 1f : .45f);
        stop.setOnClickListener(v -> {
            stopService(new Intent(this, BridgeService.class));
            AppState.setBridgeEnabled(this, false);
            refreshHeader();
            showTab("settings");
        });
        controls.addView(stop);

        Button appSettings = actionButton("Android app settings", Color.rgb(35, 39, 45), TEXT);
        appSettings.setOnClickListener(v -> openSettings());
        controls.addView(appSettings);

        Button unlink = actionButton("Unpair this phone locally", Color.rgb(57, 23, 27), Color.rgb(255, 177, 180));
        unlink.setOnClickListener(v -> {
            stopService(new Intent(this, BridgeService.class));
            AppState.clearPair(this);
            refreshHeader();
            showTab("link");
            toast("Local pairing removed");
        });
        controls.addView(unlink);

        page.addView(controls);

        page.addView(space(12));

        LinearLayout note = card();
        TextView version = text("OnTrack AI Phone v0.3.2", 14, true);
        note.addView(version);

        TextView bodyText = text(
                "Calls is the primary screen. Link and Settings are secondary configuration areas. Server-side audio and recording are not active until the Media Bridge is connected.",
                12,
                false);
        bodyText.setTextColor(MUTED);
        bodyText.setPadding(0, dp(7), 0, 0);
        bodyText.setLineSpacing(0, 1.15f);
        note.addView(bodyText);

        page.addView(note);
        return scroll(page);
    }

    private View settingsStateLine(String label, String state, int color) {
        LinearLayout row = horizontal();
        row.setGravity(Gravity.CENTER_VERTICAL);
        row.setPadding(0, dp(10), 0, dp(10));

        TextView left = text(label, 13, true);
        TextView right = text(state, 10, true);
        right.setTextColor(color);
        right.setPadding(dp(9), dp(5), dp(9), dp(5));
        right.setBackground(roundRect(Color.rgb(27, 30, 35), 99, Color.rgb(48, 53, 61), 1));

        row.addView(left, new LinearLayout.LayoutParams(0, -2, 1f));
        row.addView(right);
        return row;
    }

    private void appendDial(String key) {
        if (dialNumber == null) return;
        dialNumber.append(key);
        pendingDialNumber = dialNumber.getText().toString();
    }

    private void backspaceDial() {
        if (dialNumber == null) return;
        String value = dialNumber.getText().toString();
        if (!value.isEmpty()) {
            dialNumber.setText(value.substring(0, value.length() - 1));
            dialNumber.setSelection(dialNumber.length());
            pendingDialNumber = dialNumber.getText().toString();
        }
    }

    private void dial(String raw) {
        String number = ContactHelper.normalize(raw);

        if (number.length() < 5) {
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

        pendingDialNumber = number;
        telecom.placeCall(Uri.parse("tel:" + number), new Bundle());
    }

    private void pair(Button button) {
        String base = serverField == null ? "" : serverField.getText().toString().trim();
        String code = pairCodeField == null ? "" : pairCodeField.getText().toString().trim();
        String number = simField == null ? "" : simField.getText().toString().trim();
        String name = deviceField == null ? "" : deviceField.getText().toString().trim();

        if (!base.startsWith("https://")) {
            toast("Server must use HTTPS");
            return;
        }

        if (!code.matches("\\d{6}")) {
            toast("Enter the 6-digit pairing code");
            return;
        }

        button.setEnabled(false);
        button.setText("Pairing...");

        new Thread(() -> {
            try {
                JSONObject payload = new JSONObject();
                payload.put("pairing_code", code);
                payload.put("name", name.isEmpty() ? "Android Phone" : name);
                payload.put("phone_number", number);
                payload.put("manufacturer", Build.MANUFACTURER);
                payload.put("model", Build.MODEL);
                payload.put("app_version", "0.3.2-poc");

                JSONObject result = ApiClient.post(
                        base,
                        "/api/device/register.php",
                        payload,
                        null);

                AppState.savePair(
                        this,
                        base,
                        result.getString("device_token"),
                        result.getInt("device_id"),
                        number);

                runOnUiThread(() -> {
                    button.setEnabled(true);
                    startBridge();
                    if (ContactHelper.allowed(this)) syncContacts();
                    refreshHeader();
                    showTab("link");
                    toast("Phone connected to dashboard");
                });
            } catch (Exception e) {
                runOnUiThread(() -> {
                    button.setEnabled(true);
                    button.setText("Pair with dashboard");
                    toast("Pair failed: " + e.getMessage());
                });
            }
        }, "OnTrackPair").start();
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

        toast("Syncing contacts…");

        ContactHelper.syncAsync(this, (count, error) -> {
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
            refreshHeader();
        } catch (Exception e) {
            AppState.setBridgeEnabled(this, false);
            refreshHeader();
            toast("Could not start bridge: " + e.getMessage());
        }
    }

    private void handleDialIntent(Intent intent) {
        if (intent == null || !Intent.ACTION_DIAL.equals(intent.getAction())) return;

        String number = intent.getData() == null
                ? ""
                : intent.getData().getSchemeSpecificPart();

        if (number != null) {
            pendingDialNumber = number;
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
                Manifest.permission.READ_CONTACTS,
                Manifest.permission.READ_CALL_LOG
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

        if ((requestCode == 31 || requestCode == REQ_PERMS)
                && ContactHelper.allowed(this)
                && AppState.paired(this)) {
            ContactHelper.syncAsync(this, null);
        }

        showTab(activeTab);
    }

    private boolean isDefaultDialer() {
        TelecomManager telecom = (TelecomManager)getSystemService(TELECOM_SERVICE);
        return telecom != null && getPackageName().equals(telecom.getDefaultDialerPackage());
    }

    private void refreshHeader() {
        if (headerState == null) return;

        if (AppState.paired(this) && AppState.bridgeEnabled(this)) {
            headerState.setText("ONLINE");
            headerState.setTextColor(GREEN);
            headerState.setBackground(roundRect(Color.rgb(17, 52, 43), 99, Color.rgb(26, 86, 68), 1));
        } else if (AppState.paired(this)) {
            headerState.setText("PAIRED");
            headerState.setTextColor(AMBER);
            headerState.setBackground(roundRect(Color.rgb(57, 42, 20), 99, Color.rgb(85, 62, 28), 1));
        } else {
            headerState.setText("OFFLINE");
            headerState.setTextColor(Color.rgb(255, 143, 147));
            headerState.setBackground(roundRect(Color.rgb(57, 23, 27), 99, Color.rgb(84, 30, 34), 1));
        }
    }

    private LinearLayout page() {
        LinearLayout page = vertical();
        page.setPadding(dp(18), dp(20), dp(18), dp(28));
        return page;
    }

    private ScrollView scroll(View child) {
        ScrollView scroll = new ScrollView(this);
        scroll.setFillViewport(true);
        scroll.setBackgroundColor(BG);
        scroll.addView(child, new ScrollView.LayoutParams(-1, -2));
        return scroll;
    }

    private LinearLayout card() {
        LinearLayout card = vertical();
        card.setPadding(dp(16), dp(16), dp(16), dp(16));
        card.setBackground(roundRect(PANEL, 17, LINE, 1));
        return card;
    }

    private View field(String label, EditText input) {
        LinearLayout wrap = vertical();

        TextView caption = text(label, 10, true);
        caption.setTextColor(MUTED);
        caption.setLetterSpacing(.08f);
        caption.setPadding(dp(2), 0, 0, dp(6));

        wrap.addView(caption);
        wrap.addView(input);

        LinearLayout.LayoutParams params = new LinearLayout.LayoutParams(-1, -2);
        params.setMargins(0, 0, 0, dp(13));
        wrap.setLayoutParams(params);

        return wrap;
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

    private Button keypadButton(String label) {
        Button button = new Button(this);
        button.setText(label);
        button.setTextColor(TEXT);
        button.setTextSize(19);
        button.setTypeface(Typeface.DEFAULT, Typeface.BOLD);
        button.setAllCaps(false);
        button.setBackground(roundRect(Color.rgb(30, 33, 39), 14, LINE, 1));
        return button;
    }

    private Button actionButton(String label, int background, int foreground) {
        Button button = new Button(this);
        button.setText(label);
        button.setTextColor(foreground);
        button.setTextSize(12);
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
        button.setTextSize(10);
        button.setTypeface(Typeface.DEFAULT, Typeface.BOLD);
        button.setAllCaps(false);
        button.setBackground(roundRect(background, 10, background, 0));
        button.setPadding(dp(10), dp(7), dp(10), dp(7));
        return button;
    }

    private TextView emptyView(String value) {
        TextView view = text(value, 12, false);
        view.setTextColor(MUTED);
        view.setGravity(Gravity.CENTER);
        view.setPadding(dp(16), dp(24), dp(16), dp(24));
        view.setBackground(roundRect(PANEL, 14, LINE, 1));
        return view;
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
        if (strokeWidth > 0) drawable.setStroke(dp(strokeWidth), stroke);
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
