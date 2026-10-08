package com.ontrack.aiphone;
import java.net.HttpURLConnection;
import java.net.URL;
import java.io.InputStream;
import java.io.ByteArrayOutputStream;
import java.nio.charset.StandardCharsets;
/** USB ADB-reverse-only local readiness gate. No call audio is transported here. */
public final class BridgeCheck {
  private BridgeCheck(){}
  public static boolean ready(String token){
    if(token==null||token.length()<20)return false;
    HttpURLConnection c=null;
    try {
      c=(HttpURLConnection)new URL("http://127.0.0.1:8765/ready").openConnection();
      c.setConnectTimeout(600);c.setReadTimeout(600);
      c.setRequestProperty("X-OnTrack-Bridge-Token",token);
      if(c.getResponseCode()!=200)return false;
      try(InputStream in=c.getInputStream()){
        ByteArrayOutputStream bos=new ByteArrayOutputStream();byte[] buf=new byte[1024];int n;while((n=in.read(buf))!=-1){bos.write(buf,0,n);if(bos.size()>4096)return false;}
        String response=bos.toString(StandardCharsets.UTF_8.name());
        return response.contains("\"ready\":true");
      }
    } catch(Exception ignored){return false;}finally{if(c!=null)c.disconnect();}
  }
}
