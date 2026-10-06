package com.ontrack.agentphone;

import android.Manifest;
import android.app.Activity;
import android.app.Dialog;
import android.app.role.RoleManager;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.graphics.Color;
import android.graphics.Typeface;
import android.graphics.drawable.ColorDrawable;
import android.graphics.drawable.GradientDrawable;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.provider.Settings;
import android.telecom.TelecomManager;
import android.text.Editable;
import android.text.InputType;
import android.text.TextWatcher;
import android.view.Gravity;
import android.view.View;
import android.view.Window;
import android.view.WindowManager;
import android.widget.Button;
import android.widget.EditText;
import android.widget.FrameLayout;
import android.widget.GridLayout;
import android.widget.HorizontalScrollView;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.TextView;
import android.widget.Toast;

import org.json.JSONObject;

import java.util.ArrayList;
import java.util.List;
import java.util.Locale;

public class MainActivity extends Activity {
    private static final int REQ_PERMS = 21;
    private static final int REQ_ROLE = 22;

    private static final int BG = Color.rgb(7, 8, 10);
    private static final int SURFACE = Color.rgb(13, 15, 18);
    private static final int PANEL = Color.rgb(18, 21, 25);
    private static final int PANEL_2 = Color.rgb(25, 29, 34);
    private static final int LINE = Color.rgb(43, 49, 57);
    private static final int TEXT = Color.rgb(247, 248, 250);
    private static final int MUTED = Color.rgb(143, 151, 162);
    private static final int DIM = Color.rgb(96, 104, 116);
    private static final int RED = Color.rgb(229, 37, 42);
    private static final int RED_DARK = Color.rgb(74, 24, 28);
    private static final int GREEN = Color.rgb(55, 201, 147);
    private static final int AMBER = Color.rgb(246, 173, 60);

    private FrameLayout body;
    private TextView headerState;
    private LinearLayout bottomNav;

    private String activeTab = "calls";
    private String pendingDialNumber = "";
    private String callFilter = "all";

    private EditText serverField;
    private EditText pairCodeField;
    private EditText simField;
    private EditText deviceField;

    @Override public void onCreate(Bundle state) {
        super.onCreate(state);
        setSystemBars();
        buildShell();
        requestRuntimePermissions();
        handleDialIntent(getIntent());
        showTab("calls");
        UpdateManager.checkInBackground(this, false, null);
    }

    @Override protected void onResume() {
        super.onResume();
        refreshHeader();
        UpdateManager.resumePendingInstall(this);

        if ("calls".equals(activeTab) || "contacts".equals(activeTab) || "settings".equals(activeTab)) {
            showTab(activeTab);
        }
    }

    @Override protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        handleDialIntent(intent);
        showTab("calls");
    }

    private void setSystemBars() {
        getWindow().setStatusBarColor(BG);
        getWindow().setNavigationBarColor(BG);

        if (Build.VERSION.SDK_INT >= 23) {
            getWindow().getDecorView().setSystemUiVisibility(0);
        }
    }

    private void buildShell() {
        LinearLayout root = vertical();
        root.setBackgroundColor(BG);

        root.addView(buildAppBar());

        body = new FrameLayout(this);
        body.setBackgroundColor(BG);
        root.addView(body, new LinearLayout.LayoutParams(-1, 0, 1f));

        bottomNav = buildBottomNav();
        root.addView(bottomNav);

        setContentView(root);
        refreshHeader();
    }

    private View buildAppBar() {
        LinearLayout bar = horizontal();
        bar.setGravity(Gravity.CENTER_VERTICAL);
        bar.setPadding(dp(18), dp(12), dp(18), dp(12));
        bar.setBackgroundColor(SURFACE);

        TextView logo = text("OT", 15, true);
        logo.setGravity(Gravity.CENTER);
        logo.setBackground(roundRect(RED, 15, RED, 0));
        bar.addView(logo, new LinearLayout.LayoutParams(dp(46), dp(46)));

        LinearLayout title = vertical();
        LinearLayout.LayoutParams titleParams = new LinearLayout.LayoutParams(0, -2, 1f);
        titleParams.setMargins(dp(12), 0, dp(8), 0);

        TextView appName = text("OnTrack Phone", 19, true);
        TextView appSub = text("AI Telephony", 11, false);
        appSub.setTextColor(MUTED);

        title.addView(appName);
        title.addView(appSub);
        bar.addView(title, titleParams);

        headerState = text("OFFLINE", 10, true);
        headerState.setGravity(Gravity.CENTER);
        bar.addView(headerState);

        return bar;
    }

    private LinearLayout buildBottomNav() {
        LinearLayout nav = horizontal();
        nav.setGravity(Gravity.CENTER);
        nav.setPadding(dp(8), dp(7), dp(8), dp(9));
        nav.setBackgroundColor(SURFACE);

        nav.addView(navButton("Calls", "calls"), navWeight());
        nav.addView(navButton("Contacts", "contacts"), navWeight());
        nav.addView(navButton("Messages", "messages"), navWeight());
        nav.addView(navButton("Link", "link"), navWeight());
        nav.addView(navButton("Settings", "settings"), navWeight());

        return nav;
    }

    private LinearLayout.LayoutParams navWeight() {
        LinearLayout.LayoutParams p = new LinearLayout.LayoutParams(0, dp(50), 1f);
        p.setMargins(dp(2), 0, dp(2), 0);
        return p;
    }

    private TextView navButton(String label, String tab) {
        TextView item = text(label, 11, true);
        item.setGravity(Gravity.CENTER);
        item.setTag(tab);
        item.setTextColor(MUTED);
        item.setBackground(roundRect(Color.TRANSPARENT, 14, Color.TRANSPARENT, 0));
        item.setOnClickListener(v -> showTab(tab));
        return item;
    }

    private void styleNav() {
        if (bottomNav == null) return;

        for (int i = 0; i < bottomNav.getChildCount(); i++) {
            View child = bottomNav.getChildAt(i);
            if (!(child instanceof TextView)) continue;

            TextView item = (TextView) child;
            boolean selected = activeTab.equals(String.valueOf(item.getTag()));

            item.setTextColor(selected ? Color.WHITE : MUTED);
            item.setBackground(selected
                    ? roundRect(Color.rgb(46, 24, 28), 14, Color.rgb(79, 31, 36), 1)
                    : roundRect(Color.TRANSPARENT, 14, Color.TRANSPARENT, 0));

            item.animate()
                    .scaleX(selected ? 1.02f : 1f)
                    .scaleY(selected ? 1.02f : 1f)
                    .setDuration(130)
                    .start();
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

        page.setAlpha(0f);
        page.setTranslationY(dp(6));
        body.addView(page, new FrameLayout.LayoutParams(-1, -1));
        page.animate().alpha(1f).translationY(0f).setDuration(160).start();

        styleNav();
        refreshHeader();
    }

    private View buildCallsPage() {
        FrameLayout frame = new FrameLayout(this);

        LinearLayout page = page();

        LinearLayout heading = horizontal();
        heading.setGravity(Gravity.CENTER_VERTICAL);

        LinearLayout copy = vertical();
        copy.addView(text("Calls", 30, true));

        TextView subtitle = text(
                AppState.phone(this).isEmpty()
                        ? "SIM calling and recent activity"
                        : AppState.phone(this) + " · SIM calling",
                12,
                false);
        subtitle.setTextColor(MUTED);
        copy.addView(subtitle);

        heading.addView(copy, new LinearLayout.LayoutParams(0, -2, 1f));

        TextView connected = statusPill(
                AppState.paired(this) && AppState.bridgeEnabled(this)
                        ? "CONNECTED"
                        : "LOCAL",
                AppState.paired(this) && AppState.bridgeEnabled(this)
                        ? GREEN
                        : AMBER);

        heading.addView(connected);
        page.addView(heading);
        page.addView(space(18));

        EditText search = searchInput("Search names or numbers");
        page.addView(search);
        page.addView(space(12));

        HorizontalScrollView filterScroll = new HorizontalScrollView(this);
        filterScroll.setHorizontalScrollBarEnabled(false);

        LinearLayout filters = horizontal();
        filters.setPadding(0, 0, dp(2), 0);

        String[][] filterItems = {
                {"all", "All"},
                {"missed", "Missed"},
                {"incoming", "Incoming"},
                {"outgoing", "Outgoing"}
        };

        for (String[] item : filterItems) {
            TextView chip = chip(item[1], item[0].equals(callFilter));
            chip.setTag(item[0]);
            chip.setOnClickListener(v -> {
                callFilter = String.valueOf(v.getTag());
                showTab("calls");
            });
            filters.addView(chip);
        }

        filterScroll.addView(filters);
        page.addView(filterScroll);
        page.addView(space(20));

        LinearLayout sectionHeader = horizontal();
        sectionHeader.setGravity(Gravity.CENTER_VERTICAL);

        TextView recentTitle = text("Recent calls", 18, true);
        sectionHeader.addView(recentTitle, new LinearLayout.LayoutParams(0, -2, 1f));

        if (!CallLogHelper.allowed(this)) {
            TextView allow = text("Allow history", 11, true);
            allow.setTextColor(RED);
            allow.setPadding(dp(10), dp(8), dp(10), dp(8));
            allow.setOnClickListener(v ->
                    requestPermissions(new String[]{Manifest.permission.READ_CALL_LOG}, 45));
            sectionHeader.addView(allow);
        }

        page.addView(sectionHeader);
        page.addView(space(9));

        LinearLayout listHolder = vertical();
        page.addView(listHolder);

        List<CallLogHelper.Entry> all = CallLogHelper.allowed(this)
                ? CallLogHelper.recent(this, 100)
                : new ArrayList<>();

        renderCallRows(listHolder, all, "");

        search.addTextChangedListener(new SimpleTextWatcher() {
            @Override public void afterTextChanged(Editable editable) {
                renderCallRows(listHolder, all, editable.toString());
            }
        });

        page.addView(space(82));

        ScrollView scroll = scroll(page);
        frame.addView(scroll, new FrameLayout.LayoutParams(-1, -1));

        TextView dial = text("Dial pad", 13, true);
        dial.setGravity(Gravity.CENTER);
        dial.setTextColor(Color.WHITE);
        dial.setBackground(roundRect(RED, 99, RED, 0));
        dial.setElevation(dp(10));
        dial.setOnClickListener(v -> showDialerDialog());

        FrameLayout.LayoutParams dialParams =
                new FrameLayout.LayoutParams(dp(116), dp(54), Gravity.END | Gravity.BOTTOM);
        dialParams.setMargins(0, 0, dp(18), dp(18));
        frame.addView(dial, dialParams);

        return frame;
    }

    private void renderCallRows(
            LinearLayout holder,
            List<CallLogHelper.Entry> source,
            String query) {

        holder.removeAllViews();

        if (!CallLogHelper.allowed(this)) {
            holder.addView(emptyState(
                    "Call history permission",
                    "Allow Call Log access to show incoming, outgoing and missed calls here."));
            return;
        }

        String q = query == null ? "" : query.trim().toLowerCase(Locale.ROOT);
        int shown = 0;

        for (CallLogHelper.Entry entry : source) {
            if (!callMatchesFilter(entry)) continue;

            String haystack = ((entry.name == null ? "" : entry.name)
                    + " " + (entry.number == null ? "" : entry.number))
                    .toLowerCase(Locale.ROOT);

            if (!q.isEmpty() && !haystack.contains(q)) continue;

            holder.addView(callRow(entry));
            holder.addView(space(8));
            shown++;

            if (shown >= 60) break;
        }

        if (shown == 0) {
            holder.addView(emptyState(
                    "No calls found",
                    q.isEmpty()
                            ? "There are no calls in this filter yet."
                            : "Try another name or phone number."));
        }
    }

    private boolean callMatchesFilter(CallLogHelper.Entry entry) {
        switch (callFilter) {
            case "missed":
                return "Missed".equals(entry.typeLabel()) || "Rejected".equals(entry.typeLabel());
            case "incoming":
                return "Incoming".equals(entry.typeLabel());
            case "outgoing":
                return "Outgoing".equals(entry.typeLabel());
            default:
                return true;
        }
    }

    private View callRow(CallLogHelper.Entry entry) {
        LinearLayout row = horizontal();
        row.setGravity(Gravity.CENTER_VERTICAL);
        row.setPadding(dp(12), dp(12), dp(10), dp(12));
        row.setBackground(roundRect(PANEL, 16, LINE, 1));

        String display = entry.name == null || entry.name.isEmpty()
                ? entry.number
                : entry.name;

        row.addView(avatar(display, dp(48)));

        LinearLayout info = vertical();
        LinearLayout.LayoutParams infoParams = new LinearLayout.LayoutParams(0, -2, 1f);
        infoParams.setMargins(dp(12), 0, dp(8), 0);

        TextView name = text(display == null || display.isEmpty() ? "Unknown caller" : display, 15, true);
        name.setSingleLine(true);

        String directionSymbol;
        int metaColor;

        if ("Missed".equals(entry.typeLabel()) || "Rejected".equals(entry.typeLabel())) {
            directionSymbol = "↙";
            metaColor = Color.rgb(255, 121, 126);
        } else if ("Outgoing".equals(entry.typeLabel())) {
            directionSymbol = "↗";
            metaColor = MUTED;
        } else {
            directionSymbol = "↙";
            metaColor = GREEN;
        }

        TextView meta = text(
                directionSymbol + "  "
                        + entry.typeLabel()
                        + " · "
                        + entry.timeLabel()
                        + (entry.duration > 0 ? " · " + entry.durationLabel() : ""),
                11,
                false);
        meta.setTextColor(metaColor);
        meta.setSingleLine(true);

        if (entry.name != null && !entry.name.isEmpty()) {
            TextView phone = text(entry.number, 11, false);
            phone.setTextColor(DIM);
            phone.setSingleLine(true);
            info.addView(name);
            info.addView(phone);
            info.addView(meta);
        } else {
            info.addView(name);
            info.addView(meta);
        }

        row.addView(info, infoParams);

        TextView call = text("Call", 11, true);
        call.setTextColor(Color.rgb(255, 189, 192));
        call.setGravity(Gravity.CENTER);
        call.setBackground(roundRect(Color.rgb(57, 23, 27), 12, Color.rgb(84, 31, 36), 1));
        call.setOnClickListener(v -> dial(entry.number));
        row.addView(call, new LinearLayout.LayoutParams(dp(58), dp(42)));

        row.setOnClickListener(v -> {
            pendingDialNumber = entry.number;
            showDialerDialog();
        });

        return row;
    }

    private void showDialerDialog() {
        Dialog dialog = new Dialog(this);
        dialog.requestWindowFeature(Window.FEATURE_NO_TITLE);

        LinearLayout sheet = vertical();
        sheet.setPadding(dp(20), dp(12), dp(20), dp(22));
        sheet.setBackground(roundRect(PANEL, 24, LINE, 1));

        TextView handle = new TextView(this);
        handle.setBackground(roundRect(Color.rgb(78, 84, 94), 99, Color.TRANSPARENT, 0));
        LinearLayout.LayoutParams handleParams =
                new LinearLayout.LayoutParams(dp(42), dp(4));
        handleParams.gravity = Gravity.CENTER_HORIZONTAL;
        sheet.addView(handle, handleParams);
        sheet.addView(space(16));

        TextView title = text("Dial", 21, true);
        title.setGravity(Gravity.CENTER);
        sheet.addView(title);

        EditText number = input("", pendingDialNumber);
        number.setInputType(InputType.TYPE_CLASS_PHONE);
        number.setGravity(Gravity.CENTER);
        number.setTextSize(28);
        number.setBackgroundColor(Color.TRANSPARENT);
        number.setPadding(dp(8), dp(12), dp(8), dp(4));
        sheet.addView(number);

        TextView contact = text("", 12, false);
        contact.setTextColor(MUTED);
        contact.setGravity(Gravity.CENTER);
        contact.setMinHeight(dp(28));
        sheet.addView(contact);

        Runnable resolveContact = () -> {
            String value = number.getText().toString();
            String name = ContactHelper.findName(this, value);
            contact.setText(name.isEmpty() ? " " : name);
        };

        resolveContact.run();

        number.addTextChangedListener(new SimpleTextWatcher() {
            @Override public void afterTextChanged(Editable editable) {
                pendingDialNumber = editable.toString();
                resolveContact.run();
            }
        });

        GridLayout keypad = new GridLayout(this);
        keypad.setColumnCount(3);
        keypad.setPadding(0, dp(8), 0, dp(10));

        String[] keys = {"1","2","3","4","5","6","7","8","9","*","0","#"};

        for (String key : keys) {
            TextView b = dialKey(key);
            b.setOnClickListener(v -> number.append(key));

            if ("0".equals(key)) {
                b.setOnLongClickListener(v -> {
                    number.append("+");
                    return true;
                });
            }

            GridLayout.LayoutParams p = new GridLayout.LayoutParams();
            p.width = 0;
            p.height = dp(62);
            p.columnSpec = GridLayout.spec(GridLayout.UNDEFINED, 1f);
            p.setMargins(dp(6), dp(5), dp(6), dp(5));
            keypad.addView(b, p);
        }

        sheet.addView(keypad);

        LinearLayout actions = horizontal();
        actions.setGravity(Gravity.CENTER);

        TextView erase = text("⌫", 22, false);
        erase.setGravity(Gravity.CENTER);
        erase.setBackground(roundRect(PANEL_2, 99, LINE, 1));
        erase.setOnClickListener(v -> {
            String value = number.getText().toString();
            if (!value.isEmpty()) {
                number.setText(value.substring(0, value.length() - 1));
                number.setSelection(number.length());
            }
        });

        TextView call = text("Call", 15, true);
        call.setGravity(Gravity.CENTER);
        call.setTextColor(Color.WHITE);
        call.setBackground(roundRect(GREEN, 99, GREEN, 0));
        call.setOnClickListener(v -> {
            String value = number.getText().toString();
            dialog.dismiss();
            dial(value);
        });

        TextView close = text("Close", 12, true);
        close.setGravity(Gravity.CENTER);
        close.setTextColor(MUTED);
        close.setOnClickListener(v -> dialog.dismiss());

        LinearLayout.LayoutParams small = new LinearLayout.LayoutParams(dp(54), dp(54));
        LinearLayout.LayoutParams big = new LinearLayout.LayoutParams(dp(112), dp(54));
        big.setMargins(dp(16), 0, dp(16), 0);

        actions.addView(erase, small);
        actions.addView(call, big);
        actions.addView(close, small);

        sheet.addView(actions);

        dialog.setContentView(sheet);

        Window window = dialog.getWindow();
        if (window != null) {
            window.setBackgroundDrawable(new ColorDrawable(Color.TRANSPARENT));
            window.setDimAmount(.68f);
            window.addFlags(WindowManager.LayoutParams.FLAG_DIM_BEHIND);
            window.setGravity(Gravity.BOTTOM);
            window.setLayout(-1, -2);
        }

        dialog.setOnShowListener(d -> {
            Window w = dialog.getWindow();
            if (w != null) {
                w.setLayout(-1, -2);
                WindowManager.LayoutParams lp = w.getAttributes();
                lp.width = WindowManager.LayoutParams.MATCH_PARENT;
                lp.gravity = Gravity.BOTTOM;
                w.setAttributes(lp);
            }
        });

        dialog.show();
    }

    private TextView dialKey(String key) {
        TextView view = text(key, 21, true);
        view.setGravity(Gravity.CENTER);
        view.setBackground(roundRect(PANEL_2, 99, LINE, 1));
        return view;
    }

    private View buildContactsPage() {
        LinearLayout page = page();

        List<ContactHelper.Entry> contacts = ContactHelper.allowed(this)
                ? ContactHelper.load(this)
                : new ArrayList<>();

        LinearLayout heading = horizontal();
        heading.setGravity(Gravity.CENTER_VERTICAL);

        LinearLayout copy = vertical();
        copy.addView(text("Contacts", 30, true));

        TextView subtitle = text(
                ContactHelper.allowed(this)
                        ? contacts.size() + " contacts on this phone"
                        : "Contacts permission required",
                12,
                false);
        subtitle.setTextColor(MUTED);
        copy.addView(subtitle);

        heading.addView(copy, new LinearLayout.LayoutParams(0, -2, 1f));

        TextView sync = text("Sync", 11, true);
        sync.setTextColor(Color.rgb(255, 184, 187));
        sync.setGravity(Gravity.CENTER);
        sync.setBackground(roundRect(Color.rgb(57, 23, 27), 12, Color.rgb(84, 31, 36), 1));
        sync.setOnClickListener(v -> syncContacts());
        heading.addView(sync, new LinearLayout.LayoutParams(dp(64), dp(42)));

        page.addView(heading);
        page.addView(space(18));

        if (!ContactHelper.allowed(this)) {
            page.addView(emptyState(
                    "Allow contacts",
                    "Caller identification and dashboard sync need access to your phone contacts."));

            TextView allow = primaryButton("Allow contacts");
            allow.setOnClickListener(v ->
                    requestPermissions(new String[]{Manifest.permission.READ_CONTACTS}, 31));
            page.addView(space(12));
            page.addView(allow);
            return scroll(page);
        }

        EditText search = searchInput("Search contacts");
        page.addView(search);
        page.addView(space(14));

        LinearLayout list = vertical();
        page.addView(list);

        renderContactRows(list, contacts, "");

        search.addTextChangedListener(new SimpleTextWatcher() {
            @Override public void afterTextChanged(Editable editable) {
                renderContactRows(list, contacts, editable.toString());
            }
        });

        return scroll(page);
    }

    private void renderContactRows(
            LinearLayout holder,
            List<ContactHelper.Entry> contacts,
            String query) {

        holder.removeAllViews();

        String q = query == null ? "" : query.trim().toLowerCase(Locale.ROOT);
        int shown = 0;

        for (ContactHelper.Entry entry : contacts) {
            String haystack = (entry.name + " " + entry.phone).toLowerCase(Locale.ROOT);
            if (!q.isEmpty() && !haystack.contains(q)) continue;

            holder.addView(contactRow(entry));
            holder.addView(space(8));
            shown++;

            if (shown >= 120) break;
        }

        if (shown == 0) {
            holder.addView(emptyState(
                    "No contacts found",
                    "Try another name or phone number."));
        } else if (shown >= 120) {
            TextView hint = text("Showing the first 120 matches", 11, false);
            hint.setTextColor(MUTED);
            hint.setGravity(Gravity.CENTER);
            hint.setPadding(0, dp(8), 0, dp(8));
            holder.addView(hint);
        }
    }

    private View contactRow(ContactHelper.Entry entry) {
        LinearLayout row = horizontal();
        row.setGravity(Gravity.CENTER_VERTICAL);
        row.setPadding(dp(12), dp(11), dp(10), dp(11));
        row.setBackground(roundRect(PANEL, 16, LINE, 1));

        row.addView(avatar(entry.name, dp(46)));

        LinearLayout info = vertical();
        LinearLayout.LayoutParams infoParams = new LinearLayout.LayoutParams(0, -2, 1f);
        infoParams.setMargins(dp(12), 0, dp(8), 0);

        TextView name = text(entry.name, 15, true);
        name.setSingleLine(true);

        TextView phone = text(entry.phone, 12, false);
        phone.setTextColor(MUTED);
        phone.setSingleLine(true);

        info.addView(name);
        info.addView(phone);
        row.addView(info, infoParams);

        TextView call = text("Call", 11, true);
        call.setTextColor(Color.rgb(255, 189, 192));
        call.setGravity(Gravity.CENTER);
        call.setBackground(roundRect(Color.rgb(57, 23, 27), 12, Color.rgb(84, 31, 36), 1));
        call.setOnClickListener(v -> dial(entry.phone));
        row.addView(call, new LinearLayout.LayoutParams(dp(58), dp(42)));

        row.setOnClickListener(v -> {
            pendingDialNumber = entry.phone;
            showDialerDialog();
        });

        return row;
    }

    private View buildMessagesPage() {
        LinearLayout page = page();

        page.addView(text("Messages", 30, true));

        TextView subtitle = text("SMS channel for your paired SIM", 12, false);
        subtitle.setTextColor(MUTED);
        page.addView(subtitle);
        page.addView(space(28));

        LinearLayout empty = vertical();
        empty.setGravity(Gravity.CENTER_HORIZONTAL);
        empty.setPadding(dp(20), dp(34), dp(20), dp(34));
        empty.setBackground(roundRect(PANEL, 20, LINE, 1));

        TextView icon = text("✉", 38, false);
        icon.setTextColor(Color.rgb(255, 153, 157));
        empty.addView(icon);

        empty.addView(space(14));

        TextView title = text("Messages are next", 20, true);
        title.setGravity(Gravity.CENTER);
        empty.addView(title);

        TextView bodyText = text(
                "The Messages tab is reserved for the SIM SMS bridge. We will enable reading, sending, delivery state and dashboard sync as a separate permission-controlled channel.",
                13,
                false);
        bodyText.setTextColor(MUTED);
        bodyText.setGravity(Gravity.CENTER);
        bodyText.setLineSpacing(0, 1.15f);
        bodyText.setPadding(0, dp(9), 0, 0);
        empty.addView(bodyText);

        page.addView(empty);

        return scroll(page);
    }

    private View buildLinkPage() {
        LinearLayout page = page();

        page.addView(text("Link", 30, true));

        TextView subtitle = text("Connect this phone to the OnTrack dashboard", 12, false);
        subtitle.setTextColor(MUTED);
        page.addView(subtitle);
        page.addView(space(18));

        LinearLayout hero = vertical();
        hero.setPadding(dp(18), dp(18), dp(18), dp(18));
        hero.setBackground(gradientPanel(
                AppState.paired(this)
                        ? new int[]{Color.rgb(13, 49, 39), PANEL}
                        : new int[]{Color.rgb(58, 29, 18), PANEL},
                20));

        LinearLayout heroTop = horizontal();
        heroTop.setGravity(Gravity.CENTER_VERTICAL);

        TextView heroTitle = text(
                AppState.paired(this) ? "Dashboard connected" : "Not paired yet",
                20,
                true);

        heroTop.addView(heroTitle, new LinearLayout.LayoutParams(0, -2, 1f));
        heroTop.addView(statusPill(
                AppState.paired(this) ? "CONNECTED" : "SETUP",
                AppState.paired(this) ? GREEN : AMBER));

        hero.addView(heroTop);

        TextView details = text(
                AppState.paired(this)
                        ? "Device #" + AppState.deviceId(this)
                            + "\n" + (AppState.phone(this).isEmpty() ? "SIM number not set" : AppState.phone(this))
                            + "\n" + AppState.server(this)
                        : "Generate a six-digit pairing code from the dashboard, then enter it below.",
                12,
                false);
        details.setTextColor(Color.rgb(188, 196, 205));
        details.setLineSpacing(0, 1.25f);
        details.setPadding(0, dp(10), 0, 0);
        hero.addView(details);

        page.addView(hero);
        page.addView(space(14));

        LinearLayout form = sectionCard("Pairing details");

        serverField = input("Server URL", AppState.server(this));
        pairCodeField = input("6-digit pairing code", "");
        pairCodeField.setInputType(InputType.TYPE_CLASS_NUMBER);
        simField = input("SIM phone number", AppState.phone(this));
        simField.setInputType(InputType.TYPE_CLASS_PHONE);
        deviceField = input("Device name", Build.MANUFACTURER + " " + Build.MODEL);

        form.addView(field("SERVER", serverField));
        form.addView(field("PAIRING CODE", pairCodeField));
        form.addView(field("SIM NUMBER", simField));
        form.addView(field("DEVICE NAME", deviceField));

        TextView pair = primaryButton(
                AppState.paired(this)
                        ? "Pair as a new endpoint"
                        : "Pair with dashboard");

        pair.setOnClickListener(v -> pair(pair));
        form.addView(pair);

        TextView sync = secondaryButton("Sync contacts now");
        sync.setEnabled(AppState.paired(this) && ContactHelper.allowed(this));
        sync.setAlpha(sync.isEnabled() ? 1f : .42f);
        sync.setOnClickListener(v -> syncContacts());

        LinearLayout.LayoutParams syncParams = new LinearLayout.LayoutParams(-1, dp(50));
        syncParams.setMargins(0, dp(9), 0, 0);
        form.addView(sync, syncParams);

        page.addView(form);

        return scroll(page);
    }

    private View buildSettingsPage() {
        LinearLayout page = page();

        page.addView(text("Settings", 30, true));

        TextView subtitle = text("Phone role, bridge, permissions and updates", 12, false);
        subtitle.setTextColor(MUTED);
        page.addView(subtitle);
        page.addView(space(18));

        LinearLayout status = vertical();
        status.setPadding(dp(16), dp(16), dp(16), dp(16));
        status.setBackground(gradientPanel(
                new int[]{Color.rgb(28, 23, 25), PANEL},
                20));

        status.addView(text("Phone status", 17, true));
        status.addView(space(12));
        status.addView(statusRow(
                "Default phone app",
                isDefaultDialer() ? "ACTIVE" : "REQUIRED",
                isDefaultDialer() ? GREEN : AMBER));
        status.addView(divider());
        status.addView(statusRow(
                "Dashboard",
                AppState.paired(this) ? "CONNECTED" : "NOT PAIRED",
                AppState.paired(this) ? GREEN : AMBER));
        status.addView(divider());
        status.addView(statusRow(
                "Background bridge",
                AppState.bridgeEnabled(this) ? "RUNNING" : "STOPPED",
                AppState.bridgeEnabled(this) ? GREEN : AMBER));
        status.addView(divider());
        status.addView(statusRow(
                "Contacts",
                ContactHelper.allowed(this) ? "ALLOWED" : "REQUIRED",
                ContactHelper.allowed(this) ? GREEN : AMBER));

        page.addView(status);
        page.addView(space(14));

        LinearLayout phoneSection = sectionCard("Phone");

        phoneSection.addView(settingAction(
                "Default phone app",
                isDefaultDialer()
                        ? "OnTrack Phone is handling calls"
                        : "Required for incoming-call control",
                isDefaultDialer() ? "Active" : "Set",
                v -> requestDialerRole()));

        phoneSection.addView(divider());

        if (AppState.bridgeEnabled(this)) {
            phoneSection.addView(settingAction(
                    "Background bridge",
                    "Heartbeat, jobs and dashboard connectivity",
                    "Stop",
                    v -> {
                        stopService(new Intent(this, BridgeService.class));
                        AppState.setBridgeEnabled(this, false);
                        showTab("settings");
                    }));
        } else {
            phoneSection.addView(settingAction(
                    "Background bridge",
                    "Keep this device online in the dashboard",
                    "Start",
                    v -> {
                        startBridge();
                        showTab("settings");
                    }));
        }

        page.addView(phoneSection);
        page.addView(space(14));

        LinearLayout appSection = sectionCard("App");

        appSection.addView(settingAction(
                "Check for updates",
                "Signed OnTrack release channel",
                "Check",
                v -> checkForUpdates(v)));

        appSection.addView(divider());

        appSection.addView(settingAction(
                "Android app settings",
                "Permissions, battery and notifications",
                "Open",
                v -> openSettings()));

        appSection.addView(divider());

        appSection.addView(settingAction(
                "SIM Audio Probe",
                "Non-root local ADB test for digital cellular call audio",
                "Test",
                v -> startActivity(new Intent(this, AudioProbeActivity.class))));

        page.addView(appSection);
        page.addView(space(14));

        LinearLayout accountSection = sectionCard("Connection");

        accountSection.addView(settingAction(
                "Dashboard link",
                AppState.paired(this)
                        ? AppState.server(this)
                        : "This phone is not paired",
                "Link",
                v -> showTab("link")));

        if (AppState.paired(this)) {
            accountSection.addView(divider());

            accountSection.addView(settingAction(
                    "Unpair this phone",
                    "Remove the local pairing token from this device",
                    "Unpair",
                    v -> {
                        stopService(new Intent(this, BridgeService.class));
                        AppState.clearPair(this);
                        refreshHeader();
                        showTab("link");
                        toast("Local pairing removed");
                    }));
        }

        page.addView(accountSection);
        page.addView(space(14));

        LinearLayout about = sectionCard("About");

        TextView version = text("OnTrack AI Phone v0.4.4", 14, true);
        TextView build = text(
                "Experimental SIM audio probe · local ADB shell · no root/Accessibility/provider",
                11,
                false);
        build.setTextColor(MUTED);
        build.setPadding(0, dp(5), 0, 0);

        about.addView(version);
        about.addView(build);
        page.addView(about);

        return scroll(page);
    }

    private void checkForUpdates(View trigger) {
        trigger.setEnabled(false);
        float oldAlpha = trigger.getAlpha();
        trigger.setAlpha(.5f);

        UpdateManager.checkInBackground(this, true, result -> {
            trigger.setEnabled(true);
            trigger.setAlpha(oldAlpha);

            if (!result.ok) {
                toast("Update check failed: " + result.message);
            } else if (!result.updateAvailable) {
                toast(result.message);
            } else if (result.downloaded && result.apk != null) {
                toast("Update v" + result.versionName + " downloaded");
                UpdateManager.install(this, result.apk);
            }
        });
    }

    private View settingAction(
            String titleValue,
            String subtitleValue,
            String actionValue,
            View.OnClickListener listener) {

        LinearLayout row = horizontal();
        row.setGravity(Gravity.CENTER_VERTICAL);
        row.setPadding(0, dp(10), 0, dp(10));

        LinearLayout copy = vertical();

        TextView title = text(titleValue, 14, true);
        TextView sub = text(subtitleValue, 11, false);
        sub.setTextColor(MUTED);
        sub.setPadding(0, dp(3), 0, 0);

        copy.addView(title);
        copy.addView(sub);

        row.addView(copy, new LinearLayout.LayoutParams(0, -2, 1f));

        TextView action = text(actionValue, 11, true);
        action.setTextColor(
                "Unpair".equals(actionValue) || "Stop".equals(actionValue)
                        ? Color.rgb(255, 148, 152)
                        : Color.rgb(255, 191, 194));
        action.setGravity(Gravity.CENTER);
        action.setPadding(dp(12), dp(9), dp(12), dp(9));
        action.setBackground(roundRect(PANEL_2, 12, LINE, 1));
        action.setOnClickListener(listener);

        row.addView(action);
        return row;
    }

    private View statusRow(String label, String value, int color) {
        LinearLayout row = horizontal();
        row.setGravity(Gravity.CENTER_VERTICAL);
        row.setPadding(0, dp(10), 0, dp(10));

        TextView left = text(label, 13, true);
        left.setTextColor(Color.rgb(215, 220, 227));
        row.addView(left, new LinearLayout.LayoutParams(0, -2, 1f));

        row.addView(statusPill(value, color));
        return row;
    }

    private TextView statusPill(String value, int color) {
        TextView pill = text(value, 9, true);
        pill.setTextColor(color);
        pill.setGravity(Gravity.CENTER);
        pill.setPadding(dp(10), dp(6), dp(10), dp(6));
        pill.setBackground(roundRect(
                Color.rgb(24, 28, 33),
                99,
                Color.rgb(49, 55, 64),
                1));
        return pill;
    }

    private TextView chip(String label, boolean selected) {
        TextView chip = text(label, 11, true);
        chip.setGravity(Gravity.CENTER);
        chip.setTextColor(selected ? Color.WHITE : MUTED);
        chip.setPadding(dp(16), dp(9), dp(16), dp(9));
        chip.setBackground(selected
                ? roundRect(RED_DARK, 99, Color.rgb(102, 38, 44), 1)
                : roundRect(PANEL, 99, LINE, 1));

        LinearLayout.LayoutParams p = new LinearLayout.LayoutParams(-2, dp(38));
        p.setMargins(0, 0, dp(8), 0);
        chip.setLayoutParams(p);
        return chip;
    }

    private EditText searchInput(String hint) {
        EditText search = input(hint, "");
        search.setSingleLine(true);
        search.setPadding(dp(16), dp(12), dp(16), dp(12));
        search.setBackground(roundRect(PANEL, 15, LINE, 1));
        return search;
    }

    private TextView avatar(String value, int size) {
        String letters = initials(value);

        TextView avatar = text(letters, 14, true);
        avatar.setGravity(Gravity.CENTER);
        avatar.setTextColor(Color.rgb(255, 202, 204));
        avatar.setBackground(roundRect(
                Color.rgb(58, 27, 31),
                99,
                Color.rgb(92, 37, 43),
                1));

        avatar.setLayoutParams(new LinearLayout.LayoutParams(size, size));
        return avatar;
    }

    private String initials(String value) {
        if (value == null || value.trim().isEmpty()) return "?";

        String clean = value.trim();
        String[] parts = clean.split("\\s+");

        if (parts.length == 1) {
            return clean.substring(0, 1).toUpperCase(Locale.ROOT);
        }

        String first = parts[0].substring(0, 1);
        String last = parts[parts.length - 1].substring(0, 1);
        return (first + last).toUpperCase(Locale.ROOT);
    }

    private LinearLayout sectionCard(String titleValue) {
        LinearLayout card = vertical();
        card.setPadding(dp(16), dp(15), dp(16), dp(15));
        card.setBackground(roundRect(PANEL, 18, LINE, 1));

        TextView title = text(titleValue, 16, true);
        title.setPadding(0, 0, 0, dp(8));
        card.addView(title);

        return card;
    }

    private View emptyState(String titleValue, String bodyValue) {
        LinearLayout wrap = vertical();
        wrap.setGravity(Gravity.CENTER_HORIZONTAL);
        wrap.setPadding(dp(20), dp(26), dp(20), dp(26));
        wrap.setBackground(roundRect(PANEL, 18, LINE, 1));

        TextView icon = text("OT", 14, true);
        icon.setGravity(Gravity.CENTER);
        icon.setTextColor(Color.rgb(255, 188, 191));
        icon.setBackground(roundRect(Color.rgb(57, 23, 27), 99, Color.rgb(84, 31, 36), 1));
        wrap.addView(icon, new LinearLayout.LayoutParams(dp(46), dp(46)));

        wrap.addView(space(13));

        TextView title = text(titleValue, 17, true);
        title.setGravity(Gravity.CENTER);
        wrap.addView(title);

        TextView body = text(bodyValue, 12, false);
        body.setTextColor(MUTED);
        body.setGravity(Gravity.CENTER);
        body.setLineSpacing(0, 1.15f);
        body.setPadding(0, dp(7), 0, 0);
        wrap.addView(body);

        return wrap;
    }

    private TextView primaryButton(String label) {
        TextView button = text(label, 13, true);
        button.setGravity(Gravity.CENTER);
        button.setTextColor(Color.WHITE);
        button.setBackground(roundRect(RED, 14, RED, 0));
        button.setLayoutParams(new LinearLayout.LayoutParams(-1, dp(52)));
        return button;
    }

    private TextView secondaryButton(String label) {
        TextView button = text(label, 13, true);
        button.setGravity(Gravity.CENTER);
        button.setTextColor(TEXT);
        button.setBackground(roundRect(PANEL_2, 14, LINE, 1));
        return button;
    }

    private void pair(TextView button) {
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
        button.setAlpha(.55f);
        button.setText("Pairing…");

        new Thread(() -> {
            try {
                JSONObject payload = new JSONObject();
                payload.put("pairing_code", code);
                payload.put("name", name.isEmpty() ? "Android Phone" : name);
                payload.put("phone_number", number);
                payload.put("manufacturer", Build.MANUFACTURER);
                payload.put("model", Build.MODEL);
                payload.put("app_version", "0.4.4");

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
                    button.setAlpha(1f);
                    startBridge();

                    if (ContactHelper.allowed(this)) {
                        syncContacts();
                    }

                    refreshHeader();
                    showTab("link");
                    toast("Phone connected to dashboard");
                });

            } catch (Exception e) {
                runOnUiThread(() -> {
                    button.setEnabled(true);
                    button.setAlpha(1f);
                    button.setText("Pair with dashboard");
                    toast("Pair failed: " + e.getMessage());
                });
            }
        }, "OnTrackPair").start();
    }

    private void dial(String raw) {
        if (OnTrackInCallService.hasActiveCustomerCallNow()) {
            toast("This phone is already handling a call");
            return;
        }

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

        ArrayList<String> permissions = new ArrayList<>();

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
            headerState.setBackground(roundRect(
                    Color.rgb(15, 52, 42),
                    99,
                    Color.rgb(26, 86, 68),
                    1));
        } else if (AppState.paired(this)) {
            headerState.setText("PAIRED");
            headerState.setTextColor(AMBER);
            headerState.setBackground(roundRect(
                    Color.rgb(57, 42, 20),
                    99,
                    Color.rgb(85, 62, 28),
                    1));
        } else {
            headerState.setText("OFFLINE");
            headerState.setTextColor(Color.rgb(255, 143, 147));
            headerState.setBackground(roundRect(
                    Color.rgb(57, 23, 27),
                    99,
                    Color.rgb(84, 30, 34),
                    1));
        }

        headerState.setPadding(dp(10), dp(6), dp(10), dp(6));
    }

    private LinearLayout page() {
        LinearLayout page = vertical();
        page.setPadding(dp(18), dp(20), dp(18), dp(28));
        return page;
    }

    private ScrollView scroll(View child) {
        ScrollView scroll = new ScrollView(this);
        scroll.setFillViewport(true);
        scroll.setClipToPadding(false);
        scroll.setBackgroundColor(BG);
        scroll.addView(child, new ScrollView.LayoutParams(-1, -2));
        return scroll;
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
        field.setHintTextColor(DIM);
        field.setText(value);
        field.setTextColor(TEXT);
        field.setTextSize(14);
        field.setSingleLine(true);
        field.setPadding(dp(14), dp(11), dp(14), dp(11));
        field.setBackground(roundRect(Color.rgb(10, 12, 15), 13, LINE, 1));
        return field;
    }

    private GradientDrawable gradientPanel(int[] colors, int radius) {
        GradientDrawable drawable = new GradientDrawable(
                GradientDrawable.Orientation.TL_BR,
                colors);
        drawable.setCornerRadius(dp(radius));
        drawable.setStroke(dp(1), LINE);
        return drawable;
    }

    private View divider() {
        View line = new View(this);
        line.setBackgroundColor(LINE);
        line.setLayoutParams(new LinearLayout.LayoutParams(-1, dp(1)));
        return line;
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
        view.setIncludeFontPadding(false);

        if (bold) {
            view.setTypeface(Typeface.DEFAULT, Typeface.BOLD);
        }

        return view;
    }

    private GradientDrawable roundRect(
            int fill,
            int radius,
            int stroke,
            int strokeWidth) {

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

    private abstract static class SimpleTextWatcher implements TextWatcher {
        @Override public void beforeTextChanged(CharSequence s, int start, int count, int after) {}
        @Override public void onTextChanged(CharSequence s, int start, int before, int count) {}
    }
}
