package com.ontrack.aiphone;
import android.app.*;
import android.content.*;
import android.os.*;
import android.telecom.*;
import java.time.ZonedDateTime;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

public final class PhoneService extends InCallService {
  public static volatile PhoneService instance;
  public static volatile Call incoming;
  public static volatile AnswerDecision decision;
  private static final String CHANNEL="calls";
  private final Handler handler=new Handler(Looper.getMainLooper());
  private final ExecutorService checkExecutor=Executors.newSingleThreadExecutor();
  private Runnable timer;
  private Call.Callback callback;
  @Override public void onCreate(){super.onCreate();instance=this;NotificationChannel n=new NotificationChannel(CHANNEL,"Incoming calls",NotificationManager.IMPORTANCE_HIGH);n.setLockscreenVisibility(Notification.VISIBILITY_PUBLIC);getSystemService(NotificationManager.class).createNotificationChannel(n);}
  @Override public void onCallAdded(Call call){super.onCallAdded(call);
    if(incoming!=null && incoming!=call) return; // single active call; Telecom owns waiting calls
    incoming=call;decision=new AnswerDecision();
    callback=new Call.Callback(){@Override public void onStateChanged(Call c,int state){
      if(c!=incoming)return;
      if(state==Call.STATE_ACTIVE){cancelTimer();decision.telecomActive();updateScreen();}
      if(state==Call.STATE_DISCONNECTED||state==Call.STATE_DISCONNECTING){cancelTimer();decision.ended();updateScreen();}
    }};
    call.registerCallback(callback);
    if(call.getState()==Call.STATE_RINGING){showIncoming();armTimer();}else{decision.humanAnswered();updateScreen();}
  }
  private void armTimer(){
    Prefs prefs=new Prefs(this); CallPolicy policy=prefs.policy();
    CallPolicy.Mode mode=policy.effectiveMode(ZonedDateTime.now());
    if(mode==CallPolicy.Mode.MANUAL)return;
    final Call expectedCall = incoming;
    final AnswerDecision expectedDecision = decision;
    timer=()->{
      if(incoming!=expectedCall || decision!=expectedDecision || expectedCall==null || expectedCall.getState()!=Call.STATE_RINGING || !expectedDecision.shouldCheckAi())return;
      String token=new Prefs(this).get("bridgeToken","");
      // Readiness check runs off-main. Every answer decision is revalidated on main thread.
      checkExecutor.execute(()->{boolean ready=BridgeCheck.ready(token);
        handler.post(()->{
          if(incoming!=expectedCall || decision!=expectedDecision || expectedCall.getState()!=Call.STATE_RINGING)return;
          if(expectedDecision.shouldAnswerAi(ready)){
            try{expectedCall.answer(0);updateScreen();}catch(Exception ignored){expectedDecision.humanAnswered();updateScreen();}
          } else updateScreen();
        });
      });
    };
    handler.postDelayed(timer,policy.delayMillis(mode));
  }
  private void cancelTimer(){if(timer!=null){handler.removeCallbacks(timer);timer=null;}}
  public void answerHuman(){handler.post(()->{cancelTimer();if(incoming!=null&&incoming.getState()==Call.STATE_RINGING){decision.humanAnswered();incoming.answer(0);}updateScreen();});}
  public void reject(){handler.post(()->{cancelTimer();if(incoming!=null){decision.ended();if(incoming.getState()==Call.STATE_RINGING)incoming.reject(false,"");else incoming.disconnect();}updateScreen();});}
  public void takeover(){handler.post(()->{if(decision!=null&&decision.state()==AnswerDecision.State.AI_ACTIVE){
      // Only safe if the desktop route can be handed back: pending until that transport is implemented.
      android.widget.Toast.makeText(this,"Takeover requires validated audio handoff; not enabled yet",android.widget.Toast.LENGTH_LONG).show();
    }});}
  private void showIncoming(){
    Intent i=new Intent(this,CallActivity.class).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK|Intent.FLAG_ACTIVITY_SINGLE_TOP);
    PendingIntent pi=PendingIntent.getActivity(this,1,i,PendingIntent.FLAG_UPDATE_CURRENT|PendingIntent.FLAG_IMMUTABLE);
    Notification n=new Notification.Builder(this,CHANNEL).setSmallIcon(android.R.drawable.sym_call_incoming)
      .setContentTitle("Incoming SIM call").setContentText("Answer manually or wait for AI readiness")
      .setCategory(Notification.CATEGORY_CALL).setOngoing(true).setContentIntent(pi).setFullScreenIntent(pi,true).build();
    getSystemService(NotificationManager.class).notify(78,n);
  }
  private void updateScreen(){sendBroadcast(new Intent("com.ontrack.aiphone.CALL_STATE").setPackage(getPackageName()));}
  @Override public void onCallRemoved(Call call){if(call==incoming){cancelTimer();if(callback!=null)call.unregisterCallback(callback);if(decision!=null)decision.ended();incoming=null;getSystemService(NotificationManager.class).cancel(78);updateScreen();}super.onCallRemoved(call);}
  @Override public void onDestroy(){cancelTimer();instance=null;checkExecutor.shutdownNow();super.onDestroy();}
}
