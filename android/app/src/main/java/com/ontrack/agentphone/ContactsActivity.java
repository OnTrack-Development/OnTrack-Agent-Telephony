package com.ontrack.agentphone;

import android.Manifest;
import android.app.Activity;
import android.content.pm.PackageManager;
import android.graphics.Color;
import android.graphics.Typeface;
import android.graphics.drawable.ColorDrawable;
import android.graphics.drawable.GradientDrawable;
import android.net.Uri;
import android.os.Bundle;
import android.telecom.TelecomManager;
import android.text.Editable;
import android.text.TextWatcher;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.widget.BaseAdapter;
import android.widget.EditText;
import android.widget.LinearLayout;
import android.widget.ListView;
import android.widget.TextView;
import android.widget.Toast;

import java.util.ArrayList;
import java.util.List;
import java.util.Locale;

public class ContactsActivity extends Activity {
    private static final int BG = Color.rgb(8, 9, 11);
    private static final int PANEL = Color.rgb(18, 20, 24);
    private static final int LINE = Color.rgb(43, 47, 55);
    private static final int TEXT = Color.rgb(247, 247, 248);
    private static final int MUTED = Color.rgb(145, 151, 162);
    private static final int RED = Color.rgb(229, 37, 42);

    private final List<ContactHelper.Entry> all = new ArrayList<>();
    private final List<ContactHelper.Entry> filtered = new ArrayList<>();
    private ContactsAdapter adapter;
    private TextView count;

    @Override public void onCreate(Bundle state) {
        super.onCreate(state);
        getWindow().setStatusBarColor(BG);
        getWindow().setNavigationBarColor(BG);
        buildUi();
        ensureContacts();
    }

    private void buildUi() {
        LinearLayout root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setPadding(dp(18), dp(20), dp(18), dp(18));
        root.setBackgroundColor(BG);

        LinearLayout header = new LinearLayout(this);
        header.setGravity(Gravity.CENTER_VERTICAL);

        TextView back = text("‹", 34, false);
        back.setGravity(Gravity.CENTER);
        back.setOnClickListener(v -> finish());
        header.addView(back, new LinearLayout.LayoutParams(dp(44), dp(44)));

        LinearLayout titles = new LinearLayout(this);
        titles.setOrientation(LinearLayout.VERTICAL);

        TextView title = text("Contacts", 24, true);
        count = text("Loading phone contacts…", 12, false);
        count.setTextColor(MUTED);

        titles.addView(title);
        titles.addView(count);
        header.addView(titles, new LinearLayout.LayoutParams(0, -2, 1f));
        root.addView(header);

        EditText search = new EditText(this);
        search.setHint("Search name or phone number");
        search.setHintTextColor(Color.rgb(100, 106, 117));
        search.setTextColor(TEXT);
        search.setTextSize(14);
        search.setSingleLine(true);
        search.setPadding(dp(14), dp(12), dp(14), dp(12));
        search.setBackground(roundRect(PANEL, 13, LINE, 1));

        LinearLayout.LayoutParams sp = new LinearLayout.LayoutParams(-1, -2);
        sp.setMargins(0, dp(18), 0, dp(12));
        root.addView(search, sp);

        ListView list = new ListView(this);
        list.setDivider(new ColorDrawable(BG));
        list.setDividerHeight(dp(8));
        list.setBackgroundColor(BG);
        list.setCacheColorHint(Color.TRANSPARENT);

        adapter = new ContactsAdapter();
        list.setAdapter(adapter);
        list.setOnItemClickListener((parent, view, position, id) -> call(filtered.get(position).phone));

        root.addView(list, new LinearLayout.LayoutParams(-1, 0, 1f));

        search.addTextChangedListener(new TextWatcher() {
            public void beforeTextChanged(CharSequence s, int start, int count, int after) {}
            public void onTextChanged(CharSequence s, int start, int before, int count) { filter(s.toString()); }
            public void afterTextChanged(Editable e) {}
        });

        setContentView(root);
    }

    private void ensureContacts() {
        if (!ContactHelper.allowed(this)) {
            requestPermissions(new String[]{Manifest.permission.READ_CONTACTS}, 91);
            return;
        }
        loadContacts();
    }

    private void loadContacts() {
        all.clear();
        all.addAll(ContactHelper.load(this));
        filter("");
        count.setText(all.size() + " phone contacts");
    }

    private void filter(String query) {
        filtered.clear();
        String q = query == null ? "" : query.trim().toLowerCase(Locale.ROOT);

        for (ContactHelper.Entry e : all) {
            if (q.isEmpty()
                    || e.name.toLowerCase(Locale.ROOT).contains(q)
                    || e.phone.contains(q)) {
                filtered.add(e);
            }
        }

        if (adapter != null) adapter.notifyDataSetChanged();
    }

    private void call(String number) {
        if (android.os.Build.VERSION.SDK_INT >= 23
                && checkSelfPermission(Manifest.permission.CALL_PHONE) != PackageManager.PERMISSION_GRANTED) {
            requestPermissions(new String[]{Manifest.permission.CALL_PHONE}, 92);
            return;
        }

        TelecomManager telecom = (TelecomManager)getSystemService(TELECOM_SERVICE);
        if (telecom == null) {
            Toast.makeText(this, "Phone service unavailable", Toast.LENGTH_SHORT).show();
            return;
        }

        telecom.placeCall(Uri.parse("tel:" + number), new Bundle());
    }

    @Override public void onRequestPermissionsResult(int requestCode, String[] permissions, int[] results) {
        super.onRequestPermissionsResult(requestCode, permissions, results);

        if (requestCode == 91
                && results.length > 0
                && results[0] == PackageManager.PERMISSION_GRANTED) {
            loadContacts();
        }
    }

    private final class ContactsAdapter extends BaseAdapter {
        public int getCount() { return filtered.size(); }
        public Object getItem(int position) { return filtered.get(position); }
        public long getItemId(int position) { return position; }

        public View getView(int position, View convertView, ViewGroup parent) {
            ContactHelper.Entry entry = filtered.get(position);

            LinearLayout row = new LinearLayout(ContactsActivity.this);
            row.setGravity(Gravity.CENTER_VERTICAL);
            row.setPadding(dp(14), dp(12), dp(12), dp(12));
            row.setBackground(roundRect(PANEL, 14, LINE, 1));

            TextView avatar = text(entry.name.substring(0, 1).toUpperCase(Locale.ROOT), 17, true);
            avatar.setGravity(Gravity.CENTER);
            avatar.setBackground(roundRect(Color.rgb(57, 23, 27), 99, Color.rgb(82, 30, 34), 1));
            row.addView(avatar, new LinearLayout.LayoutParams(dp(42), dp(42)));

            LinearLayout info = new LinearLayout(ContactsActivity.this);
            info.setOrientation(LinearLayout.VERTICAL);

            TextView name = text(entry.name, 15, true);
            TextView number = text(entry.phone, 12, false);
            number.setTextColor(MUTED);

            info.addView(name);
            info.addView(number);

            LinearLayout.LayoutParams ip = new LinearLayout.LayoutParams(0, -2, 1f);
            ip.setMargins(dp(12), 0, dp(8), 0);
            row.addView(info, ip);

            TextView action = text("CALL", 11, true);
            action.setPadding(dp(12), dp(8), dp(12), dp(8));
            action.setBackground(roundRect(RED, 99, RED, 0));
            row.addView(action);

            return row;
        }
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

    private int dp(int value) {
        return Math.round(value * getResources().getDisplayMetrics().density);
    }
}
