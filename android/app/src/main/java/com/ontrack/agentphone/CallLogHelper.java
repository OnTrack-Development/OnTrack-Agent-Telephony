package com.ontrack.agentphone;

import android.Manifest;
import android.content.Context;
import android.content.pm.PackageManager;
import android.database.Cursor;
import android.provider.CallLog;

import java.text.SimpleDateFormat;
import java.util.ArrayList;
import java.util.Date;
import java.util.List;
import java.util.Locale;

final class CallLogHelper {
    static final class Entry {
        final String number;
        final String name;
        final int type;
        final long date;
        final long duration;

        Entry(String number, String name, int type, long date, long duration) {
            this.number = number == null ? "" : number;
            this.name = name == null || name.trim().isEmpty() ? "" : name.trim();
            this.type = type;
            this.date = date;
            this.duration = duration;
        }

        String typeLabel() {
            if (type == CallLog.Calls.INCOMING_TYPE) return "Incoming";
            if (type == CallLog.Calls.OUTGOING_TYPE) return "Outgoing";
            if (type == CallLog.Calls.MISSED_TYPE) return "Missed";
            if (type == CallLog.Calls.REJECTED_TYPE) return "Rejected";
            return "Call";
        }

        String timeLabel() {
            return new SimpleDateFormat("dd MMM · HH:mm", Locale.getDefault())
                    .format(new Date(date));
        }

        String durationLabel() {
            long m = duration / 60;
            long s = duration % 60;
            return String.format(Locale.US, "%02d:%02d", m, s);
        }
    }

    private CallLogHelper() {}

    static boolean allowed(Context c) {
        return android.os.Build.VERSION.SDK_INT < 23 ||
                c.checkSelfPermission(Manifest.permission.READ_CALL_LOG) == PackageManager.PERMISSION_GRANTED;
    }

    static List<Entry> recent(Context c, int limit) {
        ArrayList<Entry> out = new ArrayList<>();
        if (!allowed(c)) return out;

        String[] projection = {
                CallLog.Calls.NUMBER,
                CallLog.Calls.CACHED_NAME,
                CallLog.Calls.TYPE,
                CallLog.Calls.DATE,
                CallLog.Calls.DURATION
        };

        String sort = CallLog.Calls.DATE + " DESC LIMIT " + Math.max(1, Math.min(100, limit));

        try (Cursor cursor = c.getContentResolver().query(
                CallLog.Calls.CONTENT_URI,
                projection,
                null,
                null,
                sort)) {

            if (cursor == null) return out;

            int numberIx = cursor.getColumnIndex(CallLog.Calls.NUMBER);
            int nameIx = cursor.getColumnIndex(CallLog.Calls.CACHED_NAME);
            int typeIx = cursor.getColumnIndex(CallLog.Calls.TYPE);
            int dateIx = cursor.getColumnIndex(CallLog.Calls.DATE);
            int durationIx = cursor.getColumnIndex(CallLog.Calls.DURATION);

            while (cursor.moveToNext()) {
                String number = numberIx >= 0 ? cursor.getString(numberIx) : "";
                String name = nameIx >= 0 ? cursor.getString(nameIx) : "";
                if ((name == null || name.trim().isEmpty()) && number != null) {
                    name = ContactHelper.findName(c, number);
                }

                out.add(new Entry(
                        number,
                        name,
                        typeIx >= 0 ? cursor.getInt(typeIx) : 0,
                        dateIx >= 0 ? cursor.getLong(dateIx) : 0L,
                        durationIx >= 0 ? cursor.getLong(durationIx) : 0L
                ));
            }
        } catch (Exception ignored) { }

        return out;
    }
}
