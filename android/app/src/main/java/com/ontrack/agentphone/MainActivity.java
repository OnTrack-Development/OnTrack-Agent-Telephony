package com.ontrack.agentphone;

import android.Manifest;
import android.app.Activity;
import android.app.role.RoleManager;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.graphics.Color;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.provider.Settings;
import android.telecom.TelecomManager;
import android.view.Gravity;
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
    private EditText server, code, phone, deviceName;
    private TextView status;

    @Override public void onCreate(Bundle b) {
        super.onCreate(b);
        buildUi();
        requestRuntimePermissions();
        handleDialIntent(getIntent());
        refreshStatus();
    }

    @Override protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        handleDialIntent(intent);
    }

    private void buildUi() {
        ScrollView scroll = new ScrollView(this);
        LinearLayout root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setPadding(dp(20), dp(24), dp(20), dp(28));
        scroll.addView(root);

        TextView title = text("OnTrack AI Phone", 28, true);
        root.addView(title);

        TextView sub = text("Android Telephony Bridge POC v0.1.0", 14, false);
        sub.setTextColor(Color.DKGRAY);
        root.addView(sub);

        status = text("", 15, false);
        status.setPadding(0, dp(18), 0, dp(14));
        root.addView(status);

        server = input("Server URL", AppState.server(this));
        root.addView(server);

        code = input("6-digit pairing code", "");
        code.setInputType(android.text.InputType.TYPE_CLASS_NUMBER);
        root.addView(code);

        phone = input("This SIM phone number", AppState.phone(this));
        phone.setInputType(android.text.InputType.TYPE_CLASS_PHONE);
        root.addView(phone);

        deviceName = input("Device name", Build.MANUFACTURER + " " + Build.MODEL);
        root.addView(deviceName);

        Button pair = button("Pair with dashboard");
        pair.setOnClickListener(v -> pair());
        root.addView(pair);

        Button dialer = button("Set as default phone app");
        dialer.setOnClickListener(v -> requestDialerRole());
        root.addView(dialer);

        Button start = button("Start bridge service");
        start.setOnClickListener(v -> startBridge());
        root.addView(start);

        Button stop = button("Stop bridge service");
        stop.setOnClickListener(v -> {
            stopService(new Intent(this, BridgeService.class));
            toast("Bridge stopped");
        });
        root.addView(stop);

        Button appSettings = button("Open Android app settings");
        appSettings.setOnClickListener(v -> openSettings());
        root.addView(appSettings);

        Button unpair = button("Unpair this device");
        unpair.setOnClickListener(v -> {
            stopService(new Intent(this, BridgeService.class));
            AppState.clearPair(this);
            refreshStatus();
        });
        root.addView(unpair);

        TextView note = text(
                "POC scope: device pairing, heartbeat, incoming call detection and outbound job dialing. AI conference/media bridging is intentionally not enabled in this first build.",
                13, false);
        note.setTextColor(Color.GRAY);
        note.setPadding(0, dp(20), 0, 0);
        root.addView(note);

        setContentView(scroll);
    }

    private void pair() {
        String base = server.getText().toString().trim();
        String pairing = code.getText().toString().trim();
        String number = phone.getText().toString().trim();
        String name = deviceName.getText().toString().trim();

        if (!base.startsWith("https://")) {
            toast("Server must use HTTPS");
            return;
        }
        if (!pairing.matches("\\d{6}")) {
            toast("Enter the 6-digit pairing code");
            return;
        }

        status.setText("Pairing...");
        new Thread(() -> {
            try {
                JSONObject body = new JSONObject();
                body.put("pairing_code", pairing);
                body.put("name", name.isEmpty() ? "Android Phone" : name);
                body.put("phone_number", number);
                body.put("manufacturer", Build.MANUFACTURER);
                body.put("model", Build.MODEL);
                body.put("app_version", "0.1.0-poc");

                JSONObject out = ApiClient.post(base, "/api/device/register.php", body, null);
                String token = out.getString("device_token");
                int id = out.getInt("device_id");

                AppState.savePair(this, base, token, id, number);
                runOnUiThread(() -> {
                    code.setText("");
                    refreshStatus();
                    startBridge();
                    toast("Paired successfully");
                });
            } catch (Exception e) {
                runOnUiThread(() -> {
                    status.setText("Pair failed: " + e.getMessage());
                    toast("Pair failed");
                });
            }
        }, "OnTrackPair").start();
    }

    private void requestDialerRole() {
        if (Build.VERSION.SDK_INT >= 29) {
            RoleManager rm = (RoleManager) getSystemService(ROLE_SERVICE);
            if (rm != null && rm.isRoleAvailable(RoleManager.ROLE_DIALER)) {
                startActivityForResult(rm.createRequestRoleIntent(RoleManager.ROLE_DIALER), REQ_ROLE);
                return;
            }
        }

        Intent i = new Intent(TelecomManager.ACTION_CHANGE_DEFAULT_DIALER);
        i.putExtra(TelecomManager.EXTRA_CHANGE_DEFAULT_DIALER_PACKAGE_NAME, getPackageName());
        startActivityForResult(i, REQ_ROLE);
    }

    private void startBridge() {
        if (!AppState.paired(this)) {
            toast("Pair the device first");
            return;
        }
        Intent i = new Intent(this, BridgeService.class);
        try {
            if (Build.VERSION.SDK_INT >= 26) startForegroundService(i); else startService(i);
            toast("Bridge started");
        } catch (Exception e) {
            toast("Could not start bridge: " + e.getMessage());
        }
        refreshStatus();
    }

    private void handleDialIntent(Intent i) {
        if (i == null || !Intent.ACTION_DIAL.equals(i.getAction()) || i.getData() == null) return;
        String n = i.getData().getSchemeSpecificPart();
        if (n != null && !n.isEmpty() && phone != null) phone.setText(n);
    }

    private void requestRuntimePermissions() {
        if (Build.VERSION.SDK_INT < 23) return;

        java.util.ArrayList<String> permissions = new java.util.ArrayList<>();
        String[] wanted = {
                Manifest.permission.CALL_PHONE,
                Manifest.permission.READ_PHONE_STATE,
                Manifest.permission.ANSWER_PHONE_CALLS,
                Manifest.permission.READ_PHONE_NUMBERS
        };

        for (String p : wanted) {
            if (checkSelfPermission(p) != PackageManager.PERMISSION_GRANTED) permissions.add(p);
        }

        if (Build.VERSION.SDK_INT >= 33 &&
                checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
            permissions.add(Manifest.permission.POST_NOTIFICATIONS);
        }

        if (!permissions.isEmpty()) requestPermissions(permissions.toArray(new String[0]), REQ_PERMS);
    }

    private boolean isDefaultDialer() {
        TelecomManager t = (TelecomManager) getSystemService(TELECOM_SERVICE);
        return t != null && getPackageName().equals(t.getDefaultDialerPackage());
    }

    private void refreshStatus() {
        String s = "Device: " +
                (AppState.paired(this) ? "PAIRED (#" + AppState.deviceId(this) + ")" : "NOT PAIRED") +
                "\nDefault dialer: " + (isDefaultDialer() ? "YES" : "NO") +
                "\nServer: " + AppState.server(this) +
                "\nSIM number: " + (AppState.phone(this).isEmpty() ? "not set" : AppState.phone(this));
        status.setText(s);
    }

    private void openSettings() {
        startActivity(new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS,
                Uri.parse("package:" + getPackageName())));
    }

    private EditText input(String hint, String value) {
        EditText e = new EditText(this);
        e.setHint(hint);
        e.setText(value);
        e.setSingleLine(true);
        e.setPadding(dp(12), dp(10), dp(12), dp(10));
        return e;
    }

    private Button button(String label) {
        Button b = new Button(this);
        b.setText(label);
        LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(-1, -2);
        lp.setMargins(0, dp(6), 0, dp(6));
        b.setLayoutParams(lp);
        return b;
    }

    private TextView text(String s, int sp, boolean bold) {
        TextView t = new TextView(this);
        t.setText(s);
        t.setTextSize(sp);
        if (bold) t.setTypeface(null, android.graphics.Typeface.BOLD);
        t.setGravity(Gravity.START);
        return t;
    }

    private int dp(int n) {
        return Math.round(n * getResources().getDisplayMetrics().density);
    }

    private void toast(String s) {
        Toast.makeText(this, s, Toast.LENGTH_SHORT).show();
    }
}
