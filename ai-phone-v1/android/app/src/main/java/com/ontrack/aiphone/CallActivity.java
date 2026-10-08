package com.ontrack.aiphone;
import android.app.*;import android.content.*;import android.os.*;import android.telecom.Call;import android.view.*;import android.widget.*;
public final class CallActivity extends Activity {
  private TextView status;
  private final BroadcastReceiver receiver=new BroadcastReceiver(){@Override public void onReceive(Context c,Intent i){render();}};
  @Override public void onCreate(Bundle b){super.onCreate(b);setShowWhenLocked(true);setTurnScreenOn(true);
    LinearLayout l=new LinearLayout(this);l.setOrientation(1);l.setPadding(36,72,36,32);
    status=new TextView(this);status.setTextSize(23);l.addView(status);
    button(l,"Answer myself",()->{if(PhoneService.instance!=null)PhoneService.instance.answerHuman();});
    button(l,"Decline / End",()->{if(PhoneService.instance!=null)PhoneService.instance.reject();});
    button(l,"Take over from AI (requires audio handoff)",()->{if(PhoneService.instance!=null)PhoneService.instance.takeover();});
    setContentView(l);render();
  }
  private void button(LinearLayout l,String title,Runnable f){Button b=new Button(this);b.setText(title);b.setOnClickListener(v->f.run());l.addView(b);}
  @Override protected void onResume(){super.onResume();if(Build.VERSION.SDK_INT>=33)registerReceiver(receiver,new IntentFilter("com.ontrack.aiphone.CALL_STATE"),Context.RECEIVER_NOT_EXPORTED);else registerReceiver(receiver,new IntentFilter("com.ontrack.aiphone.CALL_STATE"));render();}
  @Override protected void onPause(){unregisterReceiver(receiver);super.onPause();}
  private void render(){AnswerDecision d=PhoneService.decision;Call c=PhoneService.incoming;
    String number=(c!=null&&c.getDetails()!=null&&c.getDetails().getHandle()!=null)?c.getDetails().getHandle().getSchemeSpecificPart():"Private number";
    status.setText((d==null?"No current call":d.state().name())+"\n"+number);
  }
}
