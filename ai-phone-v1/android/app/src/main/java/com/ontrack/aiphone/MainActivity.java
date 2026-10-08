package com.ontrack.aiphone;
import android.Manifest;import android.app.*;import android.app.role.RoleManager;import android.content.*;import android.content.pm.PackageManager;import android.net.Uri;import android.os.*;import android.telecom.TelecomManager;import android.view.*;import android.widget.*;
public final class MainActivity extends Activity {
  private final Prefs[] prefs=new Prefs[1];
  private LinearLayout view;
  @Override public void onCreate(Bundle b){super.onCreate(b);prefs[0]=new Prefs(this);render();}
  private TextView label(String s,int size){TextView t=new TextView(this);t.setText(s);t.setTextSize(size);t.setPadding(0,8,0,8);return t;}
  private void button(String s,Runnable r){Button b=new Button(this);b.setText(s);b.setOnClickListener(v->r.run());view.addView(b);}
  private EditText edit(String caption,String value){view.addView(label(caption,15));EditText e=new EditText(this);e.setSingleLine(true);e.setText(value);view.addView(e);return e;}
  private void render(){ScrollView scroll=new ScrollView(this);view=new LinearLayout(this);view.setPadding(30,38,30,38);view.setOrientation(1);scroll.addView(view);setContentView(scroll);
    view.addView(label("OnTrack AI Phone · Android call control",24));
    view.addView(label("POC: automatic answering is blocked unless Windows Gemini + both-way audio are explicitly verified.",14));
    button("Choose as Default Phone app",()->{
      RoleManager m=getSystemService(RoleManager.class);
      if(m.isRoleAvailable(RoleManager.ROLE_DIALER))startActivityForResult(m.createRequestRoleIntent(RoleManager.ROLE_DIALER),120);
    });
    button("Allow incoming call notifications",()->{if(Build.VERSION.SDK_INT>=33&&checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS)!=PackageManager.PERMISSION_GRANTED)requestPermissions(new String[]{Manifest.permission.POST_NOTIFICATIONS},4);});
    final EditText number=edit("Outgoing number (manual dial)","");
    button("Open dialer",()->{String n=number.getText().toString().trim();if(!n.isEmpty())startActivity(new Intent(Intent.ACTION_DIAL,Uri.parse("tel:"+Uri.encode(n))));});
    view.addView(label("AI answering policy",20));
    Spinner modes=new Spinner(this);String[] labels={"Delayed (default)","Manual","Automatic"};modes.setAdapter(new ArrayAdapter<>(this,android.R.layout.simple_spinner_dropdown_item,labels));
    String current=prefs[0].get("mode","DELAYED");modes.setSelection(current.equals("MANUAL")?1:current.equals("AUTOMATIC")?2:0);view.addView(modes);
    SeekBar delay=new SeekBar(this);delay.setMax(60);delay.setProgress(prefs[0].number("delay",10));view.addView(label("AI delay: 0–60 seconds (default 10)",14));view.addView(delay);
    CheckBox after=new CheckBox(this);after.setText("Enable after-hours rules");after.setChecked(prefs[0].bool("afterHours",true));view.addView(after);
    final EditText from=edit("Office opens (HH:mm)",prefs[0].get("from","09:00"));
    final EditText to=edit("Office closes (HH:mm)",prefs[0].get("to","17:00"));
    Spinner afterMode=new Spinner(this);String[] afterLabels={"AI automatic","AI delayed","Human only"};afterMode.setAdapter(new ArrayAdapter<>(this,android.R.layout.simple_spinner_dropdown_item,afterLabels));
    String am=prefs[0].get("afterMode","AUTOMATIC");afterMode.setSelection(am.equals("DELAYED")?1:am.equals("MANUAL")?2:0);view.addView(label("Outside business hours mode",14));view.addView(afterMode);
    CheckBox configured=new CheckBox(this);configured.setText("Activate configured business-hours schedule");configured.setChecked(prefs[0].bool("hoursConfigured",false));view.addView(configured);
    CheckBox announce=new CheckBox(this);announce.setText("AI announces its identity");announce.setChecked(prefs[0].bool("announce",true));view.addView(announce);
    view.addView(label("Unknown callers use normal rules. No contact access requested.",13));
    EditText token=edit("Windows local bridge token (USB ADB reverse)",prefs[0].get("bridgeToken",""));
    button("Save settings",()->{
      try{
        java.time.LocalTime.parse(from.getText().toString().trim());java.time.LocalTime.parse(to.getText().toString().trim());
      }catch(Exception ex){Toast.makeText(this,"Use HH:mm for both times",Toast.LENGTH_LONG).show();return;}
      prefs[0].put("mode",new String[]{"DELAYED","MANUAL","AUTOMATIC"}[modes.getSelectedItemPosition()]);
      prefs[0].setNumber("delay",delay.getProgress());prefs[0].setBool("afterHours",after.isChecked());
      prefs[0].put("from",from.getText().toString().trim());prefs[0].put("to",to.getText().toString().trim());
      prefs[0].put("afterMode",new String[]{"AUTOMATIC","DELAYED","MANUAL"}[afterMode.getSelectedItemPosition()]);
      prefs[0].setBool("hoursConfigured",configured.isChecked());prefs[0].setBool("announce",announce.isChecked());
      prefs[0].put("bridgeToken",token.getText().toString().trim());
      Toast.makeText(this,"Saved for next incoming call",Toast.LENGTH_SHORT).show();
    });
  }
}
