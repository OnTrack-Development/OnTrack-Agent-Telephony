package com.ontrack.agentphone;

import android.content.Context;
import android.content.SharedPreferences;

final class AppState {
    private static final String PREFS = "ontrack_agent_phone";
    private AppState() {}

    static SharedPreferences prefs(Context c) { return c.getSharedPreferences(PREFS, Context.MODE_PRIVATE); }
    static String server(Context c) { return prefs(c).getString("server", "https://agent.ontrackegy.com"); }
    static String token(Context c) { return prefs(c).getString("token", ""); }
    static int deviceId(Context c) { return prefs(c).getInt("device_id", 0); }
    static String phone(Context c) { return prefs(c).getString("phone", ""); }
    static boolean paired(Context c) { return !token(c).isEmpty(); }
    static void savePair(Context c, String server, String token, int deviceId, String phone) {
        prefs(c).edit().putString("server", server).putString("token", token)
                .putInt("device_id", deviceId).putString("phone", phone).apply();
    }
    static void clearPair(Context c) { prefs(c).edit().clear().apply(); }
}
