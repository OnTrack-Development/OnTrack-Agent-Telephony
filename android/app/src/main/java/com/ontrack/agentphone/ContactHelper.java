package com.ontrack.agentphone;

import android.Manifest;
import android.content.Context;
import android.content.pm.PackageManager;
import android.database.Cursor;
import android.net.Uri;
import android.provider.ContactsContract;

import org.json.JSONArray;
import org.json.JSONObject;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

final class ContactHelper {
    interface Callback {
        void done(int count, Exception error);
    }

    static final class Entry {
        final String name;
        final String phone;

        Entry(String name, String phone) {
            this.phone = normalize(phone);
            this.name = name == null || name.trim().isEmpty() ? this.phone : name.trim();
        }
    }

    private ContactHelper() {}

    static boolean allowed(Context c) {
        return android.os.Build.VERSION.SDK_INT < 23 ||
                c.checkSelfPermission(Manifest.permission.READ_CONTACTS) == PackageManager.PERMISSION_GRANTED;
    }

    static List<Entry> load(Context c) {
        ArrayList<Entry> result = new ArrayList<>();
        if (!allowed(c)) return result;

        Map<String, Entry> unique = new LinkedHashMap<>();

        String[] projection = {
                ContactsContract.CommonDataKinds.Phone.DISPLAY_NAME,
                ContactsContract.CommonDataKinds.Phone.NUMBER
        };

        try (Cursor cursor = c.getContentResolver().query(
                ContactsContract.CommonDataKinds.Phone.CONTENT_URI,
                projection,
                null,
                null,
                ContactsContract.CommonDataKinds.Phone.DISPLAY_NAME + " COLLATE NOCASE ASC")) {

            if (cursor == null) return result;

            int nameIx = cursor.getColumnIndex(ContactsContract.CommonDataKinds.Phone.DISPLAY_NAME);
            int phoneIx = cursor.getColumnIndex(ContactsContract.CommonDataKinds.Phone.NUMBER);

            while (cursor.moveToNext()) {
                String phone = phoneIx >= 0 ? normalize(cursor.getString(phoneIx)) : "";
                if (phoneKey(phone).length() < 5) continue;

                String name = nameIx >= 0 ? cursor.getString(nameIx) : phone;
                unique.put(phoneKey(phone), new Entry(name, phone));
            }
        }

        result.addAll(unique.values());
        return result;
    }

    static String findName(Context c, String phone) {
        if (!allowed(c) || phone == null || phone.isEmpty()) return "";

        Uri uri = Uri.withAppendedPath(
                ContactsContract.PhoneLookup.CONTENT_FILTER_URI,
                Uri.encode(phone));

        String[] projection = {ContactsContract.PhoneLookup.DISPLAY_NAME};

        try (Cursor cursor = c.getContentResolver().query(uri, projection, null, null, null)) {
            if (cursor != null && cursor.moveToFirst()) {
                int ix = cursor.getColumnIndex(ContactsContract.PhoneLookup.DISPLAY_NAME);
                if (ix >= 0) {
                    String name = cursor.getString(ix);
                    return name == null ? "" : name.trim();
                }
            }
        } catch (Exception ignored) { }

        return "";
    }

    static int sync(Context c) throws Exception {
        if (!AppState.paired(c) || !allowed(c)) return 0;

        List<Entry> contacts = load(c);
        final int batchSize = 150;

        if (contacts.isEmpty()) {
            JSONObject body = new JSONObject();
            body.put("replace", true);
            body.put("contacts", new JSONArray());
            ApiClient.post(AppState.server(c), "/api/device/contacts-sync.php", body, AppState.token(c));
            AppState.setLastContactSync(c, System.currentTimeMillis());
            return 0;
        }

        for (int start = 0; start < contacts.size(); start += batchSize) {
            int end = Math.min(contacts.size(), start + batchSize);
            JSONArray rows = new JSONArray();

            for (int i = start; i < end; i++) {
                Entry entry = contacts.get(i);
                JSONObject row = new JSONObject();
                row.put("name", entry.name);
                row.put("phone", entry.phone);
                rows.put(row);
            }

            JSONObject body = new JSONObject();
            body.put("replace", start == 0);
            body.put("contacts", rows);

            ApiClient.post(
                    AppState.server(c),
                    "/api/device/contacts-sync.php",
                    body,
                    AppState.token(c));
        }

        AppState.setLastContactSync(c, System.currentTimeMillis());
        return contacts.size();
    }

    static void syncAsync(Context c, Callback callback) {
        new Thread(() -> {
            int count = 0;
            Exception error = null;

            try {
                count = sync(c);
            } catch (Exception e) {
                error = e;
            }

            if (callback != null) {
                final int finalCount = count;
                final Exception finalError = error;
                new android.os.Handler(android.os.Looper.getMainLooper())
                        .post(() -> callback.done(finalCount, finalError));
            }
        }, "OnTrackContactsSync").start();
    }

    static String normalize(String s) {
        return s == null ? "" : s.replaceAll("[^0-9+]", "");
    }

    static String phoneKey(String s) {
        String digits = normalize(s).replace("+", "");
        return digits.length() > 10 ? digits.substring(digits.length() - 10) : digits;
    }
}
