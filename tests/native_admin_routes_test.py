"""Compile production native transport against React stubs; exercise origin/route guards."""
from pathlib import Path
import os,shutil,subprocess,tempfile
root=Path(__file__).resolve().parents[1]
with tempfile.TemporaryDirectory() as folder:
 p=Path(folder);bridge=p/'com/facebook/react/bridge';bridge.mkdir(parents=True)
 stubs={
  'ReactApplicationContext':'public class ReactApplicationContext {}',
  'ReactContextBaseJavaModule':'public class ReactContextBaseJavaModule { public ReactContextBaseJavaModule(ReactApplicationContext ctx){} public String getName(){return "";} public void invalidate(){} }',
  'ReactMethod':'public @interface ReactMethod {}',
  'Promise':'public interface Promise {void resolve(Object value);void reject(String code,String message);}',
  'ReadableMap':'public interface ReadableMap {java.util.HashMap<String,Object> toHashMap();}',
  'WritableMap':'public interface WritableMap {void putInt(String k,int v);void putString(String k,String v);}',
  'Arguments':'public class Arguments {public static WritableMap createMap(){return null;}}',
 }
 for name,body in stubs.items():(bridge/(name+'.java')).write_text('package com.facebook.react.bridge;\n'+body)
 transport=p/'com/ontrackdevelopment/command/update';transport.mkdir(parents=True)
 shutil.copyfile(root/'mobile/native/android/CommandAdminSessionModule.java',transport/'CommandAdminSessionModule.java')
 (transport/'RouteTest.java').write_text('''package com.ontrackdevelopment.command.update;
 public class RouteTest {
  static void allowed(String path) throws Exception {CommandAdminSessionModule.checked("https://example.test/portal","customadmin",path);}
  static void denied(String path) throws Exception {try{allowed(path);}catch(Exception e){return;}throw new AssertionError("Accepted unsafe path "+path);}
  public static void main(String[] args) throws Exception {
   allowed("customadmin/index.php");allowed("customadmin/dologin.php");
   allowed("customadmin/supporttickets.php?action=view&id=123");
   allowed("customadmin/addonmodules.php?module=whatsapp_notifications&action=chat");
   allowed("customadmin/addonmodules.php?module=ai_support_agent&tab=operations");
   allowed("modules/addons/whatsapp_notifications/ajax.php?module=whatsapp_notifications&ajax_action=chat_list");
   allowed("modules/addons/ai_support_agent/admin_snapshot.php?events=80");
   denied("http://example.test/portal/customadmin/dologin.php");
   denied("https://attacker.test/portal/customadmin/dologin.php");
   denied("https://example.test.evil.test/portal/customadmin/dologin.php");
   denied("https://user:password@example.test/portal/customadmin/dologin.php");
   denied("https://example.test/other/customadmin/index.php");
   denied("customadmin/%2e%2e/index.php");denied("customadmin/../clientarea.php");
   denied("customadmin/addonmodules.php?module=other");denied("customadmin/addonmodules.php?module=whatsapp_notifications&module=other");denied("modules/addons/other/ajax.php");
   denied("customadmin/supporttickets.php#secret");
   System.out.println("PASS: native Java transport compiles; HTTPS/same-origin/subdirectory/route constraints reject unsafe redirects");
  }
 }''')
 compiler=[shutil.which('javac')] if shutil.which('javac') else ['java','-jar',os.environ['ECJ_JAR'],'-17']
 subprocess.run([*compiler,'-d',str(p/'classes'),*[str(f) for f in p.rglob('*.java')]],check=True)
 subprocess.run(['java','-cp',str(p/'classes'),'com.ontrackdevelopment.command.update.RouteTest'],check=True)
