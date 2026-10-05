package com.ontrack.agentphone;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.os.Build;

public class BootReceiver extends BroadcastReceiver {
    @Override public void onReceive(Context context, Intent intent) {
        if (Intent.ACTION_BOOT_COMPLETED.equals(intent.getAction()) && AppState.paired(context)) {
            Intent s = new Intent(context, BridgeService.class);
            try {
                if (Build.VERSION.SDK_INT >= 26) context.startForegroundService(s); else context.startService(s);
            } catch (Exception ignored) { }
        }
    }
}
