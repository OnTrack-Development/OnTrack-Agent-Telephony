package com.ontrack.agentphone;

import android.app.Activity;
import android.os.Bundle;

import java.io.File;

public class UpdateInstallActivity extends Activity {
    @Override protected void onCreate(Bundle state) {
        super.onCreate(state);

        String path = getIntent().getStringExtra("apk_path");
        File apk = path == null ? null : new File(path);

        UpdateManager.install(this, apk);
        finish();
    }
}
