package com.ontrack.aiphone;
import android.content.Context;
import android.content.SharedPreferences;
import java.time.LocalTime;
public final class Prefs {
  private final SharedPreferences s;
  public Prefs(Context c){s=c.getSharedPreferences("settings",Context.MODE_PRIVATE);}
  public String get(String k,String d){return s.getString(k,d);}
  public void put(String k,String v){s.edit().putString(k,v).apply();}
  public boolean bool(String k,boolean d){return s.getBoolean(k,d);}
  public void setBool(String k,boolean v){s.edit().putBoolean(k,v).apply();}
  public int number(String k,int d){return s.getInt(k,d);}
  public void setNumber(String k,int v){s.edit().putInt(k,v).apply();}
  private static CallPolicy.Mode mode(String x) {try{return CallPolicy.Mode.valueOf(x);}catch(Exception e){return CallPolicy.Mode.DELAYED;}}
  public CallPolicy policy(){
    LocalTime from=null,to=null;
    if(bool("hoursConfigured",false))try{from=LocalTime.parse(get("from","09:00"));to=LocalTime.parse(get("to","17:00"));}catch(Exception ignored){}
    return new CallPolicy(mode(get("mode","DELAYED")),number("delay",10),bool("afterHours",true),from,to,mode(get("afterMode","AUTOMATIC")),bool("announce",true));
  }
}
