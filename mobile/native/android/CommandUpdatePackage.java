package com.ontrackdevelopment.command.update;
import com.facebook.react.ReactPackage;
import com.facebook.react.bridge.NativeModule;
import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.uimanager.ViewManager;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
public final class CommandUpdatePackage implements ReactPackage {
  @Override public List<NativeModule> createNativeModules(ReactApplicationContext ctx) {
    List<NativeModule> modules = new ArrayList<>();
    modules.add(new CommandUpdateModule(ctx));
    return modules;
  }
  @Override public List<ViewManager> createViewManagers(ReactApplicationContext ctx) {
    return Collections.emptyList();
  }
}
