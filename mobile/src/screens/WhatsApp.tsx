import React,{useCallback,useEffect,useRef,useState} from 'react';
import {ActivityIndicator,AppState,BackHandler,Linking,Pressable,TextInput,View} from 'react-native';
import {Alert} from '../components/Feedback';
import {C} from '../theme';
import type {Session} from '../types';
import {Action,Card,Empty,Header,Icon,Notice,Pill,Search,T} from '../components/UI';
import {adminSessionReady,checkedAdminUrl,loginAdmin,loginWhatsAppWithBrowser,saveAdminDirectory,savedAdminDirectory,validateAdminDirectory} from '../lib/adminSession';
import {WaConversation,WaMessage,conversationMessages,listConversations,markConversationRead,prepareWhatsApp,sendWhatsAppText,getWhatsAppRetryAfterMs,pairTelegramWhatsApp,restoreTelegramWhatsApp,forgetTelegramWhatsApp,telegramWhatsAppReady} from '../lib/whatsapp';
import {ingestNotificationSnapshot,whatsAppNotifications} from '../lib/notifications';

/** Browser cookies are distinct from API credentials. Reuse Chrome's *existing*
 * WHMCS administrator session without collecting another admin password. */
export function existingWhatsAppInboxUrl(baseUrl:string,directory:string):string {
 const dir=validateAdminDirectory(directory,baseUrl);
 return checkedAdminUrl(baseUrl,dir,dir+'/addonmodules.php?module=whatsapp_notifications&action=chat');
}
/** Dates from WHMCS are server-local database timestamps; display the clock portion without guessing a timezone. */
export function waClock(timestamp:string):string {
 const match=String(timestamp||'').match(/(?:^|[ T])([01]?\d|2[0-3]):([0-5]\d)(?::\d\d)?/);
 return match?match[1]!.padStart(2,'0')+':'+match[2]!:String(timestamp||'').slice(0,16);
}
function waAvatar(name:string):string {
 const parts=String(name||'').trim().split(/\s+/).filter(Boolean);
 return (parts.length>1?parts[0]!.charAt(0)+parts[1]!.charAt(0):(parts[0]||'WA').slice(0,2)).toUpperCase();
}
export function WhatsApp({session,demo=false,onComposerFocus,onDetailChange}:{session:Session|null;demo:boolean;onComposerFocus?:()=>void;onDetailChange?:(active:boolean)=>void}){
 const [connected,setConnected]=useState(!!session&&adminSessionReady(session)),[search,setSearch]=useState(''),[unreadOnly,setUnreadOnly]=useState(false);
 const [rows,setRows]=useState<WaConversation[]>([]),[unread,setUnread]=useState(0),[selected,setSelected]=useState<WaConversation|null>(null);
 const [messages,setMessages]=useState<WaMessage[]>([]),[draft,setDraft]=useState(''),[busy,setBusy]=useState(false),[sending,setSending]=useState(false),[error,setError]=useState('');
 const [older,setOlder]=useState(true),[loadingOlder,setLoadingOlder]=useState(false),[windowAt,setWindowAt]=useState(Date.now()),[now,setNow]=useState(Date.now());
 const [directory,setDirectory]=useState('admin'),[directoryLoaded,setDirectoryLoaded]=useState(false),[openingBrowser,setOpeningBrowser]=useState(false);
 const [needsOtp,setNeedsOtp]=useState(false),[otp,setOtp]=useState('');
 const [adminUser,setAdminUser]=useState(''),[adminPass,setAdminPass]=useState('');
 const [connectStep,setConnectStep]=useState(''),[showLegacy,setShowLegacy]=useState(false);
 const [telegramKey,setTelegramKey]=useState(''),[telegramBusy,setTelegramBusy]=useState(false);
 const generation=useRef(0),readInFlight=useRef(false),sendInFlight=useRef(false),active=useRef(true),selectedId=useRef<number|null>(null);
 selectedId.current=selected?.id||null;
 const close=()=>{generation.current++;setSelected(null);setMessages([]);setDraft('');setError('');};
 useEffect(()=>{active.current=true;return()=>{active.current=false;generation.current++;};},[]);
 useEffect(()=>{let mounted=true;
  setDirectoryLoaded(false);
  if(session)void savedAdminDirectory(session).then(dir=>{if(mounted){setDirectory(dir);setDirectoryLoaded(true);}}).catch(()=>{if(mounted)setDirectoryLoaded(true);});
  return()=>{mounted=false;};
 },[session]);
 useEffect(()=>{
  if(!session||demo)return;
  let alive=true;
  void restoreTelegramWhatsApp(session).then(async ready=>{
   if(!ready||!alive)return;
   const list=await listConversations(session);
   if(!alive||!active.current)return;
   setRows(list.conversations);setUnread(list.unread);setConnected(true);setError('');
   void ingestNotificationSnapshot(session,'whatsapp',whatsAppNotifications(list.conversations));
  }).catch(()=>{});
  return()=>{alive=false;};
 },[session,demo]);
 useEffect(()=>{onDetailChange?.(!!selected);return()=>onDetailChange?.(false);},[!!selected]);
 useEffect(()=>{if(!selected)return;const sub=BackHandler.addEventListener('hardwareBackPress',()=>{close();return true;});return()=>sub.remove();},[!!selected]);
 const report=(e:unknown)=>{
  if(!active.current)return;
  setError(e instanceof Error?e.message:'تعذر الاتصال');
  if(session&&!adminSessionReady(session)&&!telegramWhatsAppReady(session)){setConnected(false);setRows([]);setMessages([]);setSelected(null);}
 };
 const refresh=useCallback(async()=>{
  if(!session||demo||!connected||readInFlight.current||getWhatsAppRetryAfterMs(session)>0||AppState.currentState!=='active')return;
  const stamp=generation.current,id=selectedId.current;
  readInFlight.current=true;setBusy(true);
  try{
   if(id){
    const result=await conversationMessages(session,id);
    if(!active.current||stamp!==generation.current||selectedId.current!==id)return;
    // Merge refreshed recent messages with already loaded older history, deduplicated by server ID.
    setMessages(prev=>[...prev.filter(m=>!result.messages.some(x=>x.id===m.id)),...result.messages].sort((a,b)=>a.id-b.id));
    setSelected(result.conversation);setWindowAt(Date.now());
   }else{
    const result=await listConversations(session,search,unreadOnly);
    if(!active.current||stamp!==generation.current||selectedId.current!==null)return;
    setRows(result.conversations);setUnread(result.unread);
    void ingestNotificationSnapshot(session,'whatsapp',whatsAppNotifications(result.conversations));
   }
   setError('');
  }catch(e){if(stamp===generation.current)report(e);}
  finally{readInFlight.current=false;if(active.current)setBusy(false);}
 },[session,connected,demo,search,unreadOnly]);
 useEffect(()=>{
  if(!connected)return;
  const timer=setTimeout(()=>void refresh(),400);const poll=setInterval(()=>void refresh(),15000);
  const resume=AppState.addEventListener('change',state=>{if(state==='active')void refresh();});
  return()=>{clearTimeout(timer);clearInterval(poll);resume.remove();};
 },[refresh,selected?.id]);
 useEffect(()=>{if(!selected)return;const timer=setInterval(()=>setNow(Date.now()),1000);return()=>clearInterval(timer);},[!!selected]);
 const connectWithTelegram=async()=>{
  if(!session||busy||telegramBusy)return;
  setTelegramBusy(true);setError('');
  try{
   await pairTelegramWhatsApp(session,telegramKey);
   const list=await listConversations(session);
   if(active.current){
    setTelegramKey('');setRows(list.conversations);setUnread(list.unread);
    setConnected(true);setConnectStep('محادثات واتساب اتربطت بموديول TelegramNotify الحالي.');
    void ingestNotificationSnapshot(session,'whatsapp',whatsAppNotifications(list.conversations));
   }
  }catch(e){
   if(session)await forgetTelegramWhatsApp(session).catch(()=>{});
   report(e);
  }finally{if(active.current)setTelegramBusy(false);}
 };
 const disconnectTelegram=async()=>{
  if(!session)return;
  await forgetTelegramWhatsApp(session);
  setConnected(false);setSelected(null);setMessages([]);setRows([]);setUnread(0);
  setConnectStep('تم فصل الربط. تقدر تولد رمز جديد من الموديول.');
 };
 const connectWithBrowser=async()=>{
  if(!session||busy||!directoryLoaded)return;
  setBusy(true);setError('');setConnectStep('افتح تسجيل الدخول داخل التطبيق وأكمل التحقق بخطوتين إن وجد...');
  try{
   await loginWhatsAppWithBrowser(session,directory);
   setConnectStep('تم تأكيد جلسة الموظف، جارٍ قراءة المحادثات من الموديول الأصلي...');
   const list=await listConversations(session);
   if(active.current){
    setRows(list.conversations);setUnread(list.unread);setConnected(true);
    setConnectStep('اتصال واتساب جاهز');
    void ingestNotificationSnapshot(session,'whatsapp',whatsAppNotifications(list.conversations));
   }
  }catch(e){report(e);setConnectStep('تعذر توثيق جلسة الإدارة');}
  finally{if(active.current)setBusy(false);}
 };
 const connect=async()=>{
  if(!session)return;
  setBusy(true);setError('');
  try{await prepareWhatsApp(session);setConnected(true);const list=await listConversations(session);if(active.current){setRows(list.conversations);setUnread(list.unread);}
   void ingestNotificationSnapshot(session,'whatsapp',whatsAppNotifications(list.conversations));}
  catch(e){report(e);setConnected(false);}
  finally{if(active.current)setBusy(false);}
 };
 /** The existing WHMCS Admin Legacy account is already in encrypted app
  * storage. The operator only chooses the admin folder, not new credentials.
  * API mode has no browser-admin authentication: keep it on the existing browser
  * session instead of trying to impersonate a WHMCS admin with API keys. */
 const connectSaved=async()=>{
  if(!session||busy)return;
  setBusy(true);setError('');setConnectStep('جارٍ اختبار مسار إدارة WHMCS...');
  try{
   const dir=await saveAdminDirectory(session,directory);
   const username=session.mode==='admin'?session.username:adminUser.trim();
   const password=session.mode==='admin'?session.password:adminPass;
   if(!username||(!password&&!needsOtp))
    throw Error('الواتساب يحتاج جلسة WHMCS Admin. أدخل حساب الموظف المصرح له.');
   setConnectStep(needsOtp?'جارٍ تأكيد التحقق بخطوتين...':'جارٍ التحقق من صلاحيات حساب الإدارة...');
   // API credentials never grant an admin browser session or WhatsApp addon access.
   const result=await loginAdmin(session,dir,username,password,otp.trim());
   // The additional administrator credential exists only during this login attempt.
   setConnectStep(result.ready?'جارٍ جلب محادثات واتساب...':'في انتظار رمز التحقق');
   setNeedsOtp(result.needsOtp);
   if(result.ready){
    setNeedsOtp(false);setOtp('');
    await prepareWhatsApp(session);
    if(active.current)setConnected(true);
    const list=await listConversations(session);
    if(active.current){setRows(list.conversations);setUnread(list.unread);}
    void ingestNotificationSnapshot(session,'whatsapp',whatsAppNotifications(list.conversations));
   }else if(active.current)setError('اكتب رمز التحقق بخطوتين من حساب موظف WHMCS ثم اضغط تأكيد.');
  }catch(e){report(e);setConnectStep('تعذر إتمام ربط جلسة الإدارة');}
  finally{if(session.mode==='api')setAdminPass('');if(active.current)setBusy(false);}
 };
 // Do not silently submit stored administrator passwords on screen mount.
 // WAF/2FA challenges must be completed by the operator in the in-app login view.
 const openBrowser=async()=>{
  if(!session||openingBrowser)return;
  setOpeningBrowser(true);setError('');
  try{
   const dir=validateAdminDirectory(directory,session.baseUrl);
   const target=existingWhatsAppInboxUrl(session.baseUrl,dir);
   await saveAdminDirectory(session,dir); // Save chosen folder even if browser cannot launch.
   // Android default browser retains its own authenticated WHMCS cookies.
   await Linking.openURL(target);
  }catch(e){
   if(active.current)setError(e instanceof Error?e.message:'تعذر فتح Inbox الحالي');
  }finally{if(active.current)setOpeningBrowser(false);}
 };
 const open=async(conversation:WaConversation)=>{
  if(!session||busy)return;
  const stamp=++generation.current;
  setSelected(conversation);setMessages([]);setOlder(true);setDraft('');setBusy(true);setError('');setWindowAt(Date.now());setNow(Date.now());
  try{
   const data=await conversationMessages(session,conversation.id);
   if(!active.current||stamp!==generation.current)return;
   setSelected(data.conversation);setMessages(data.messages);setOlder(data.messages.length===300);setWindowAt(Date.now());
   try{await markConversationRead(session,conversation.id);}catch(e){if(stamp===generation.current)report(e);}
  }catch(e){if(stamp===generation.current)report(e);}
  finally{if(active.current)setBusy(false);}
 };
 const more=async()=>{
  if(!session||!selected||!messages.length||loadingOlder)return;
  const stamp=generation.current;setLoadingOlder(true);
  try{const data=await conversationMessages(session,selected.id,messages[0]!.id);if(stamp!==generation.current)return;
   setMessages(prev=>[...data.messages.filter(x=>!prev.some(y=>y.id===x.id)),...prev].sort((a,b)=>a.id-b.id));setOlder(data.messages.length===120);
  }catch(e){if(stamp===generation.current)report(e);}finally{if(active.current)setLoadingOlder(false);}
 };
 const remaining=selected?Math.max(0,selected.window.remaining_seconds-Math.floor((now-windowAt)/1000)):0;
 const windowOpen=!!selected?.window.open&&remaining>0;
 const send=()=>{
  if(!session||!selected||!draft.trim()||!windowOpen||sendInFlight.current)return;
  const id=selected.id,text=draft.trim(),stamp=generation.current;
  sendInFlight.current=true;setSending(true);
  Alert.alert('إرسال واتساب',`إرسال الرسالة إلى ${selected.display_name} (${selected.phone})؟`,[
   {text:'إلغاء',style:'cancel',onPress:()=>{sendInFlight.current=false;if(active.current)setSending(false);}},
   {text:'إرسال',onPress:async()=>{
    let accepted=false;
    try{
     await sendWhatsAppText(session,id,text);
     accepted=true;
     if(active.current&&stamp===generation.current){
      setDraft('');setError('');
      Alert.alert('تم إرسال واتساب','تم قبول الرسالة من موديول واتساب. لا تعِد إرسالها بسبب تأخر تحديث المحادثة.');
     }
     // A failed *read* after successful send must NEVER look like a failed send.
     try{
      const data=await conversationMessages(session,id);
      if(active.current&&stamp===generation.current){
       setMessages(prev=>[...prev.filter(m=>!data.messages.some(x=>x.id===m.id)),...data.messages].sort((a,b)=>a.id-b.id));
       setSelected(data.conversation);setWindowAt(Date.now());
      }
     }catch(_refreshError){
      if(active.current&&stamp===generation.current)setError('الرسالة اتبعت، لكن تحديث المحادثة فشل مؤقتًا. استخدم تحديث المحادثات فقط؛ لا تُعد الإرسال.');
     }
    }catch(e){
     if(stamp===generation.current&&!accepted)report(e);
    }finally{sendInFlight.current=false;if(active.current)setSending(false);}
   }}
  ],{cancelable:false});
 };
 if(!session||demo)return <View><Header title="واتساب" subtitle="محادثات العملاء"/><Empty icon="whatsapp" text="اربط حساب WHMCS لعرض محادثات واتساب الحقيقية"/></View>;

 return <View style={{gap:13,paddingBottom:35}}>
  {selected?<Pressable accessibilityRole="button" accessibilityLabel="العودة إلى محادثات واتساب" onPress={close}
   style={{flexDirection:'row-reverse',alignItems:'center',gap:8,alignSelf:'flex-start',paddingVertical:6}}>
   <Icon name="arrow-right" color={C.green} size={21}/><T color={C.green} weight="800" size={13}>كل المحادثات</T>
  </Pressable>:null}
  {selected?
   <Card style={{padding:15,backgroundColor:C.surface,gap:10}}>
    <View style={{flexDirection:'row-reverse',alignItems:'center',gap:12}}>
     <View style={{width:50,height:50,borderRadius:18,backgroundColor:C.green+'1C',borderColor:C.green+'40',borderWidth:1,justifyContent:'center',alignItems:'center'}}>
      <T color={C.green} weight="900" size={17}>{waAvatar(selected.display_name)}</T>
     </View>
     <View style={{flex:1,gap:2}}>
      <T weight="900" size={18} lines={1}>{selected.display_name}</T>
      <T color={C.muted} size={12}>{selected.phone}</T>
     </View>
     <Icon name="whatsapp" color={C.green} size={27}/>
    </View>
    <View style={{flexDirection:'row-reverse',gap:8,flexWrap:'wrap'}}>
     <Pill color={windowOpen?C.green:C.orange} icon={windowOpen?'clock-check-outline':'clock-alert-outline'}
      label={windowOpen?'نافذة الرد مفتوحة — '+Math.ceil(remaining/3600)+' س':'نافذة الرد مغلقة'}/>
     {selected.client_id?<Pill color={C.blue} label={'WHMCS #'+selected.client_id}/>:null}
    </View>
   </Card>:
   <View style={{gap:5,paddingBottom:7}}>
    <View style={{flexDirection:'row-reverse',alignItems:'center',justifyContent:'space-between'}}>
     <View style={{gap:3}}><T size={26} weight="900">واتساب</T><T color={C.muted} size={12}>صندوق رسائل العملاء</T></View>
     <View style={{width:53,height:53,borderRadius:19,backgroundColor:C.green+'19',borderWidth:1,borderColor:C.green+'35',alignItems:'center',justifyContent:'center'}}>
      <Icon name="whatsapp" size={30} color={C.green}/>
     </View>
    </View>
    {connected?<View style={{flexDirection:'row-reverse',alignItems:'center',gap:7,marginTop:5}}>
     <View style={{height:7,width:7,borderRadius:5,backgroundColor:C.green}}/>
     <T color={C.green} size={11}>{session&&telegramWhatsAppReady(session)?'متصل عبر TelegramNotify':'متصل بمحادثات WHMCS'}</T>
     <T color={C.muted} size={10}>• تحديث كل 15 ثانية أثناء فتح التطبيق</T>
    </View>:null}
   </View>}
  {error?<View style={{gap:10}}>
   <Notice tone="warning" title="تعذر الاتصال بواتساب" message={error}/>
   <Action secondary label="إعادة المحاولة" disabled={busy}
    onPress={()=>void (connected?refresh():connectWithBrowser())}/>
  </View>:null}
  {!connected?<Card style={{gap:15,padding:18}}>
   <View style={{flexDirection:'row-reverse',alignItems:'center',gap:12}}>
    <View style={{height:46,width:46,borderRadius:15,backgroundColor:C.green+'18',alignItems:'center',justifyContent:'center'}}>
     <Icon name="shield-lock-outline" color={C.green} size={26}/>
    </View>
    <View style={{flex:1,gap:3}}>
     <T size={16} weight="900">اتصال واتساب الآمن</T>
     <T size={12} color={C.muted}>نفس موديول واتساب الحالي من غير أي إضافات على السيرفر</T>
    </View>
   </View>
   <Notice title="من TelegramNotify v3.4.2 الموجود"
    message="افتح إضافات WHMCS ← TelegramNotify v3.4.2، واضغط Generate Mobile Key. انسخ الرمز هنا. مش محتاج موديول جديد أو جلسة Admin في التطبيق."/>
   <T weight="800" size={12}>رمز ربط TelegramNotify</T>
   <TextInput accessibilityLabel="رمز ربط واتساب من TelegramNotify" value={telegramKey}
    onChangeText={setTelegramKey} autoCapitalize="none" autoCorrect={false}
    secureTextEntry placeholder="الصق رمز الربط 64 حرف" placeholderTextColor={C.muted}
    style={{color:C.text,textAlign:'left',backgroundColor:C.surface2,padding:15,borderColor:C.stroke,
     borderWidth:1,borderRadius:15,fontSize:14}}/>
   <Action label={telegramBusy?'جارٍ ربط واتساب...':'ربط محادثات واتساب عبر تيليجرام'} icon="whatsapp"
    disabled={telegramBusy||busy||!/^[a-f0-9]{64}$/i.test(telegramKey.trim())}
    onPress={()=>void connectWithTelegram()}/>
   <Notice title="بديل لو احتجته"
    message="تسجيل دخول WHMCS Admin القديم موجود تحت، لكن مش مطلوب بعد تفعيل الربط من TelegramNotify."/>
   <T weight="800" size={12}>مجلد إدارة WHMCS</T>
   <TextInput accessibilityLabel="مجلد إدارة WHMCS" value={directory}
    onChangeText={v=>{setDirectory(v);setNeedsOtp(false);setOtp('');setError('');}}
    autoCapitalize="none" autoCorrect={false} placeholder="admin أو رابط الإدارة"
    placeholderTextColor={C.muted} style={{color:C.text,textAlign:'left',backgroundColor:C.surface2,
     padding:15,borderColor:C.stroke,borderWidth:1,borderRadius:15,fontSize:15}}/>
   <Action secondary label={busy?'جارٍ الاتصال...':'بديل: تسجيل دخول WHMCS Admin'} icon="account-key"
    disabled={busy||!directoryLoaded} onPress={()=>void connectWithBrowser()}/>
   {connectStep?<T size={11} color={C.muted}>{connectStep}</T>:null}
   <Pressable accessibilityRole="button" onPress={()=>setShowLegacy(v=>!v)} style={{alignSelf:'center',padding:7}}>
    <T color={C.muted} size={12}>{showLegacy?'إخفاء خيارات الدخول التقليدية':'خيارات الدخول التقليدية'} </T>
   </Pressable>
   {showLegacy?<View style={{gap:11}}>
    {session.mode==='api'&&!needsOtp?<View style={{gap:9}}>
     <TextInput accessibilityLabel="اسم مستخدم WHMCS Admin" value={adminUser} onChangeText={setAdminUser}
      autoCapitalize="none" autoCorrect={false} placeholder="اسم موظف WHMCS Admin"
      placeholderTextColor={C.muted} style={{color:C.text,textAlign:'left',padding:13,backgroundColor:C.surface2,
       borderRadius:12,borderColor:C.stroke,borderWidth:1}}/>
     <TextInput accessibilityLabel="كلمة مرور WHMCS Admin" value={adminPass} onChangeText={setAdminPass}
      placeholder="كلمة المرور" secureTextEntry autoCapitalize="none" autoCorrect={false}
      placeholderTextColor={C.muted} style={{color:C.text,textAlign:'left',padding:13,backgroundColor:C.surface2,
       borderRadius:12,borderColor:C.stroke,borderWidth:1}}/>
    </View>:null}
    {needsOtp?<TextInput accessibilityLabel="رمز التحقق الثنائي" value={otp} onChangeText={setOtp}
     keyboardType="number-pad" secureTextEntry placeholder="رمز التحقق الثنائي"
     placeholderTextColor={C.muted} style={{color:C.text,textAlign:'center',padding:13,backgroundColor:C.surface2,borderRadius:12}}/>:null}
    <Action secondary label={needsOtp?'تأكيد رمز التحقق':'الدخول ببيانات الموظف'}
     disabled={busy||(session.mode==='api'&&!needsOtp&&(!adminUser.trim()||!adminPass))}
     onPress={()=>void connectSaved()}/>
    <Action secondary label={openingBrowser?'جارٍ الفتح...':'فتح صندوق واتساب من المتصفح'} icon="open-in-new"
     disabled={openingBrowser} onPress={()=>void openBrowser()}/>
   </View>:null}
  </Card>:null}
  {busy?<View style={{alignItems:'center',padding:8}}><ActivityIndicator color={C.green}/></View>:null}
  {connected&&!selected?<>
   {telegramWhatsAppReady(session)?<Pressable accessibilityRole="button" onPress={()=>void disconnectTelegram()}
    style={{alignSelf:'flex-end',paddingVertical:4}}>
    <T size={11} color={C.muted}>فصل اتصال TelegramNotify</T>
   </Pressable>:null}
   <View style={{flexDirection:'row-reverse',gap:8,alignItems:'center'}}>
    <View style={{flex:1}}><Search value={search}
     onChange={v=>{generation.current++;setSearch(v);}} placeholder="ابحث بالاسم أو رقم الهاتف"/></View>
   </View>
   <View style={{flexDirection:'row-reverse',justifyContent:'space-between',alignItems:'center',gap:9}}>
    <View style={{flexDirection:'row-reverse',gap:8,alignItems:'center'}}>
     <Pressable accessibilityRole="button" onPress={()=>{generation.current++;setUnreadOnly(false);}}
      style={{paddingHorizontal:16,paddingVertical:10,borderWidth:1,borderColor:!unreadOnly?C.green+'66':C.stroke,
       backgroundColor:!unreadOnly?C.green+'16':C.surface,borderRadius:14}}>
      <T weight="800" size={12} color={!unreadOnly?C.green:C.muted}>الكل</T>
     </Pressable>
     <Pressable accessibilityRole="button" onPress={()=>{generation.current++;setUnreadOnly(true);}}
      style={{flexDirection:'row-reverse',gap:6,paddingHorizontal:12,paddingVertical:10,borderWidth:1,
       borderColor:unreadOnly?C.green+'66':C.stroke,backgroundColor:unreadOnly?C.green+'16':C.surface,borderRadius:14}}>
      <T weight="800" size={12} color={unreadOnly?C.green:C.muted}>غير المقروءة</T>
      {unread>0?<View style={{paddingHorizontal:6,borderRadius:10,backgroundColor:C.green}}>
       <T size={10} weight="900" color={C.bg}>{String(unread)}</T>
      </View>:null}
     </Pressable>
    </View>
    <Pressable accessibilityRole="button" accessibilityLabel="تحديث المحادثات" disabled={busy}
     onPress={()=>void refresh()} style={{padding:11,backgroundColor:C.surface,borderRadius:14,borderColor:C.stroke,borderWidth:1}}>
     <Icon name="refresh" color={busy?C.muted:C.green} size={20}/>
    </Pressable>
   </View>
   <View style={{flexDirection:'row-reverse',justifyContent:'space-between',paddingHorizontal:3}}>
    <T weight="800" size={13}>المحادثات</T><T color={C.muted} size={11}>{rows.length} محادثة</T>
   </View>
   <Card style={{paddingVertical:3,paddingHorizontal:12,gap:0}}>
    {rows.length?rows.map(row=><Pressable key={row.id} onPress={()=>void open(row)}
     accessibilityRole="button" accessibilityLabel={'فتح محادثة '+row.display_name}
     style={({pressed})=>({flexDirection:'row-reverse',alignItems:'center',paddingVertical:15,gap:12,
      borderBottomWidth:1,borderBottomColor:C.stroke,opacity:pressed?0.68:1})}>
     <View style={{height:51,width:51,borderRadius:19,backgroundColor:C.green+'18',
      borderColor:C.green+'2A',borderWidth:1,alignItems:'center',justifyContent:'center'}}>
      <T color={C.green} size={17} weight="900">{waAvatar(row.display_name)}</T>
     </View>
     <View style={{flex:1,gap:4}}>
      <View style={{flexDirection:'row-reverse',alignItems:'center',justifyContent:'space-between',gap:5}}>
       <T weight="900" size={14} lines={1} style={{flex:1}}>{row.display_name}</T>
       <T color={C.muted} size={10}>{waClock(row.last_message_at)}</T>
      </View>
      <T lines={1} size={12} color={C.muted}>{row.last_message_preview||'رسالة بدون نص'}</T>
      <View style={{flexDirection:'row-reverse',alignItems:'center',justifyContent:'space-between'}}>
       <T size={10} color={C.muted}>{row.phone}</T>
       {row.unread_count>0?<View style={{minWidth:24,height:24,alignItems:'center',justifyContent:'center',
        paddingHorizontal:5,borderRadius:12,backgroundColor:C.green}}>
        <T size={11} weight="900" color={C.bg}>{String(row.unread_count)}</T></View>:null}
      </View>
     </View>
    </Pressable>):!busy?<Empty icon="chat-outline" text={unreadOnly?'مفيش محادثات غير مقروءة':'لا توجد محادثات مطابقة للبحث'}/>:null}
   </Card>
  </>:null}
  {selected?<>
   {older&&messages.length?<Action secondary label={loadingOlder?'جارٍ جلب الأقدم...':'تحميل رسائل أقدم'}
    disabled={loadingOlder} onPress={()=>void more()}/>:null}
   <View style={{gap:9,paddingVertical:9,paddingHorizontal:4}}>
    {messages.map(message=>{
     const outgoing=message.direction==='outgoing';
     return <View key={message.id} style={{alignItems:outgoing?'flex-end':'flex-start',width:'100%'}}>
      <View style={{maxWidth:'88%',minWidth:98,backgroundColor:outgoing?'#183A33':C.surface,
       borderRadius:19,borderTopLeftRadius:outgoing?19:5,borderTopRightRadius:outgoing?5:19,
       borderWidth:1,borderColor:outgoing?C.green+'40':C.stroke,paddingHorizontal:15,paddingVertical:11,gap:7}}>
       <T size={13} style={{textAlign:'right'}}>{message.body||message.media_filename||
        (message.has_media?'مرفق '+message.message_type:'رسالة '+message.message_type)}</T>
       {message.has_media?<View style={{flexDirection:'row-reverse',alignItems:'center',gap:5}}>
        <Icon name="paperclip" size={13} color={C.muted}/>
        <T color={C.muted} size={11}>{message.media_filename||message.message_type}</T>
       </View>:null}
       <View style={{flexDirection:'row-reverse',alignItems:'center',gap:5}}>
        <T color={C.muted} size={10}>{waClock(message.timestamp)}</T>
        {outgoing?<Icon name={message.status==='read'?'check-all':'check'} size={13}
         color={message.status==='read'?C.blue:C.muted}/>:null}
        {outgoing&&message.status?<T size={10} color={C.muted}>{message.status}</T>:null}
       </View>
       {message.error_text?<T color={C.orange} size={11}>{message.error_text}</T>:null}
      </View>
     </View>;
    })}
    {!messages.length&&!busy?<Empty text="مفيش رسائل محفوظة للمحادثة دي" icon="message-text-outline"/>:null}
   </View>
   <Card style={{gap:11,padding:13}}>
    {!windowOpen?<Notice tone="warning" title="نافذة واتساب مغلقة"
     message="مينفعش تبعت رسالة نصية عادية بعد مرور 24 ساعة من آخر رسالة واردة. استنى رسالة جديدة من العميل أو استخدم قالب Meta معتمد في الواجهة الأصلية."/>:null}
    <View style={{flexDirection:'row-reverse',alignItems:'flex-end',gap:9}}>
     <TextInput accessibilityLabel="اكتب رسالة واتساب" multiline value={draft}
      onChangeText={setDraft} maxLength={4096} editable={windowOpen&&!sending}
      onFocus={onComposerFocus} placeholder={windowOpen?'اكتب ردك هنا...':'الرد غير متاح حتى تصل رسالة جديدة'}
      placeholderTextColor={C.muted} style={{minHeight:55,maxHeight:130,flex:1,backgroundColor:C.surface2,
       color:C.text,borderWidth:1,borderColor:C.stroke,borderRadius:17,
       paddingHorizontal:14,paddingVertical:12,textAlign:'right',textAlignVertical:'top',fontSize:14}}/>
     <Pressable accessibilityRole="button" accessibilityLabel="إرسال رسالة واتساب" onPress={send}
      disabled={sending||busy||!draft.trim()||!windowOpen}
      style={({pressed})=>({width:53,height:53,alignItems:'center',justifyContent:'center',
       borderRadius:18,backgroundColor:C.green,opacity:sending||busy||!draft.trim()||!windowOpen?0.38:pressed?0.7:1})}>
      {sending?<ActivityIndicator color={C.bg}/>:<Icon name="send" size={21} color={C.bg}/>}
     </Pressable>
    </View>
    <T color={C.muted} size={10}>{draft.length}/4096 حرف • يتم الإرسال عبر موديول واتساب الأصلي</T>
   </Card>
  </>:null}
 </View>;
}
