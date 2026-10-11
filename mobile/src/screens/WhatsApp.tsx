import React,{useCallback,useEffect,useRef,useState} from 'react';
import {ActivityIndicator,AppState,BackHandler,Linking,Pressable,TextInput,View} from 'react-native';
import {Alert} from '../components/Feedback';
import {C} from '../theme';
import type {Session} from '../types';
import {Action,Card,Empty,Header,Icon,Notice,Pill,Search,T} from '../components/UI';
import {adminSessionReady,checkedAdminUrl,loginAdmin,loginWhatsAppWithBrowser,saveAdminDirectory,savedAdminDirectory,validateAdminDirectory} from '../lib/adminSession';
import {WaConversation,WaMessage,conversationMessages,listConversations,markConversationRead,prepareWhatsApp,sendWhatsAppText,getWhatsAppRetryAfterMs} from '../lib/whatsapp';
import {ingestNotificationSnapshot,whatsAppNotifications} from '../lib/notifications';

/** Browser cookies are distinct from API credentials. Reuse Chrome's *existing*
 * WHMCS administrator session without collecting another admin password. */
export function existingWhatsAppInboxUrl(baseUrl:string,directory:string):string {
 const dir=validateAdminDirectory(directory,baseUrl);
 return checkedAdminUrl(baseUrl,dir,dir+'/addonmodules.php?module=whatsapp_notifications&action=chat');
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
 const generation=useRef(0),readInFlight=useRef(false),sendInFlight=useRef(false),active=useRef(true),selectedId=useRef<number|null>(null);
 selectedId.current=selected?.id||null;
 const close=()=>{generation.current++;setSelected(null);setMessages([]);setDraft('');setError('');};
 useEffect(()=>{active.current=true;return()=>{active.current=false;generation.current++;};},[]);
 useEffect(()=>{let mounted=true;
  setDirectoryLoaded(false);
  if(session)void savedAdminDirectory(session).then(dir=>{if(mounted){setDirectory(dir);setDirectoryLoaded(true);}}).catch(()=>{if(mounted)setDirectoryLoaded(true);});
  return()=>{mounted=false;};
 },[session]);
 useEffect(()=>{onDetailChange?.(!!selected);return()=>onDetailChange?.(false);},[!!selected]);
 useEffect(()=>{if(!selected)return;const sub=BackHandler.addEventListener('hardwareBackPress',()=>{close();return true;});return()=>sub.remove();},[!!selected]);
 const report=(e:unknown)=>{
  if(!active.current)return;
  setError(e instanceof Error?e.message:'تعذر الاتصال');
  if(session&&!adminSessionReady(session)){setConnected(false);setRows([]);setMessages([]);setSelected(null);}
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

 return <View style={{gap:14,paddingBottom:24}}>
  {selected?<Pressable onPress={close} style={{flexDirection:'row-reverse',gap:8,paddingVertical:8}}><Icon name="arrow-right" color={C.green}/><T color={C.green}>المحادثات</T></Pressable>:null}
  <Header title={selected?.display_name||'واتساب'} subtitle={selected?.phone||'محادثات العملاء'} right={<Icon name="whatsapp" size={29} color={C.green}/>}/>
  {error?<View style={{gap:9}}><Notice tone="warning" title="تعذر تحديث واتساب" message={error}/>
  <Action secondary label="إعادة المحاولة" disabled={busy} onPress={()=>void (connected?refresh():session?.mode==='admin'?connectSaved():openBrowser())}/></View>:null}
  {!connected?<Card style={{gap:15}}>
   <View style={{flexDirection:'row-reverse',alignItems:'center',gap:9}}>
    <Icon name="shield-check-outline" color={C.green} size={27}/>
    <View style={{flex:1,gap:3}}>
     <T size={16} weight="800">اتصال WHMCS محفوظ</T>
     <T size={12} color={C.muted}>{session.mode==='admin'
      ?'سنستخدم جلسة WHMCS Admin المحفوظة بعد التأكد من صلاحيات الموظف.'
      :'الربط بـAPI فقط لا يتيح محادثات الموديول. يلزم تسجيل دخول WHMCS Admin منفصل هنا لعرض واتساب داخل التطبيق.'}</T>
    </View>
   </View>
   <T weight="800" size={14}>مسار إدارة WHMCS</T>
   <TextInput accessibilityLabel="مسار إدارة WHMCS" value={directory}
    onChangeText={v=>{setDirectory(v);setNeedsOtp(false);setOtp('');setError('');}}
    autoCapitalize="none" autoCorrect={false} placeholder="admin أو رابط الإدارة الكامل"
    placeholderTextColor={C.muted} style={{color:C.text,textAlign:'left',
      backgroundColor:C.surface2,padding:13,borderColor:C.stroke,borderWidth:1,borderRadius:12}}/>
   <T color={C.muted} size={12}>اكتب اسم المجلد فقط (مثال: on) أو الصق رابط الإدارة اللي فاتحه في المتصفح.</T>

   <Action label={busy?'جارٍ الاتصال...':'فتح تسجيل الدخول الآمن لواتساب'}
    icon="whatsapp" disabled={busy||!directoryLoaded} onPress={()=>void connectWithBrowser()}/>
   <Notice tone="info" title="بدون أي موديول إضافي"
    message="تسجيل دخول WHMCS Admin يتم مرة داخل نافذة آمنة بالتطبيق. بعدها نقرأ الرسائل ونرد عبر ajax.php الموجود في whatsapp_notifications، بنفس جلسة الموظف وصلاحياته."/>
   <Action secondary label={showLegacy?'إخفاء الطريقة القديمة':'خيارات تسجيل الدخول القديمة'}
    onPress={()=>setShowLegacy(!showLegacy)}/>
   {showLegacy?<>
   {session.mode==='api'&&!needsOtp?<View style={{gap:10}}>
    <T weight="800" size={13}>بيانات موظف WHMCS Admin المصرح له</T>
    <TextInput accessibilityLabel="اسم مستخدم إدارة WHMCS" value={adminUser}
     onChangeText={setAdminUser} placeholder="اسم مستخدم الإدارة" autoCapitalize="none"
     autoCorrect={false} placeholderTextColor={C.muted}
     style={{color:C.text,textAlign:'left',backgroundColor:C.surface2,
      padding:14,borderWidth:1,borderColor:C.stroke,borderRadius:13}}/>
    <TextInput accessibilityLabel="كلمة مرور إدارة WHMCS" value={adminPass}
     onChangeText={setAdminPass} placeholder="كلمة مرور الموظف" secureTextEntry
     autoCapitalize="none" autoCorrect={false} placeholderTextColor={C.muted}
     style={{color:C.text,textAlign:'left',backgroundColor:C.surface2,
      padding:14,borderWidth:1,borderColor:C.stroke,borderRadius:13}}/>
   </View>:null}
   {needsOtp?<TextInput accessibilityLabel="رمز التحقق بخطوتين" value={otp}
    onChangeText={setOtp} keyboardType="number-pad" secureTextEntry
    placeholder="رمز التحقق من WHMCS" placeholderTextColor={C.muted}
    style={{color:C.text,textAlign:'center',padding:13,backgroundColor:C.surface2,
     borderWidth:1,borderColor:C.stroke,borderRadius:13}}/>:null}
   <Action label={busy?'جارٍ الاتصال...':needsOtp?'تأكيد رمز التحقق':'اتصال صندوق واتساب داخل التطبيق'}
    icon="whatsapp" disabled={busy||(session.mode==='api'&&!needsOtp&&(!adminUser.trim()||!adminPass))}
    onPress={()=>void connectSaved()}/>
   {connectStep?<T color={C.muted} size={11}>{connectStep}</T>:null}
   <Notice tone="info" title="موديول واتساب لم يتغير"
    message="مستخدم API لا يملك جلسة إدارة تلقائيًا. سيتم استخدام تسجيل دخول الموظف المصرح له فقط، دون تخزين كلمة المرور الإضافية أو تعديل الموديول."/>
   <Action secondary icon="open-in-new" label={openingBrowser?'جارٍ الفتح...':'فتح Inbox الموجود باستخدام المتصفح'}
    disabled={openingBrowser} onPress={()=>void openBrowser()}/>
   <T size={11} color={C.muted}>نفس موديول واتساب الموجود، من غير تغيير الـWebhook.</T>
   </>:null>
  </Card>:null}
  {busy?<ActivityIndicator color={C.green}/>:null}
  {connected&&!selected?<>
   <View style={{flexDirection:'row-reverse',gap:8,alignItems:'center'}}><View style={{flex:1}}>
    <Search value={search} onChange={v=>{generation.current++;setSearch(v);}} placeholder="اسم العميل أو رقم الهاتف"/>
   </View><Pill label={`${unread} غير مقروءة`} color={C.green}/></View>
   <Pressable onPress={()=>{generation.current++;setUnreadOnly(!unreadOnly);}} style={{flexDirection:'row-reverse',gap:8,alignItems:'center'}}><Icon name={unreadOnly?'checkbox-marked':'checkbox-blank-outline'} color={C.green}/><T size={12}>غير المقروءة فقط</T></Pressable>
   <Action secondary label="تحديث المحادثات" disabled={busy} onPress={()=>void refresh()}/>
   <Card style={{paddingVertical:3}}>{rows.length?rows.map(row=><Pressable key={row.id} onPress={()=>void open(row)} accessibilityRole="button" accessibilityLabel={row.display_name}
    style={({pressed})=>({paddingVertical:17,borderBottomWidth:1,borderBottomColor:C.stroke,gap:9,opacity:pressed?0.72:1})}>
    <View style={{flexDirection:'row-reverse',alignItems:'center',gap:10}}><View style={{width:44,height:44,borderRadius:16,backgroundColor:C.green+'19',
     borderWidth:1,borderColor:C.green+'35',justifyContent:'center',alignItems:'center'}}>
     <Icon name="account-outline" size={22} color={C.green}/></View><View style={{flex:1,gap:4}}><T weight="800" size={14}>{row.display_name}</T><T size={11} color={C.muted}>{row.phone}</T></View>{row.unread_count>0?<Pill label={String(row.unread_count)} color={C.green}/>:null}</View>
    <T lines={1} size={12} color={C.muted}>{row.last_message_preview||'محادثة بدون نص'}</T><T size={10} color={C.muted}>{row.last_message_at}</T>
   </Pressable>):!busy?<Empty icon="whatsapp" text="لا توجد محادثات مطابقة"/>:null}</Card>
  </>:null}
  {selected?<>
   <Pill label={windowOpen?`نافذة الرد مفتوحة • ${Math.ceil(remaining/3600)} ساعة متبقية`:'نافذة الرد مغلقة'} color={windowOpen?C.green:C.orange}/>
   {older&&messages.length?<Action secondary label={loadingOlder?'جارٍ التحميل...':'تحميل رسائل أقدم'} disabled={loadingOlder} onPress={()=>void more()}/>:null}
   {messages.map(message=><View key={message.id} style={{alignSelf:message.direction==='outgoing'?'flex-end':'flex-start',width:'92%'}}><Card style={{gap:8,backgroundColor:message.direction==='outgoing'?'#17352E':C.surface,
    borderRadius:19,borderColor:message.direction==='outgoing'?C.green+'45':C.stroke}}>
    <T size={13}>{message.body||message.media_filename||(message.has_media?'مرفق: '+message.message_type:'رسالة '+message.message_type)}</T>
    {message.has_media?<T size={11} color={C.muted}>مرفق • {message.message_type}{message.media_filename?' • '+message.media_filename:''}</T>:null}
    <T size={10} color={C.muted}>{message.timestamp}{message.direction==='outgoing'?' • '+message.status:''}</T>
    {message.error_text?<T size={11} color={C.orange}>{message.error_text}</T>:null}
   </Card></View>)}
   {!messages.length&&!busy?<Empty text="لا توجد رسائل"/>:null}
   <Card style={{gap:12}}>
    <T weight="800">الرد على العميل</T>
    {!windowOpen?<T size={12} color={C.orange}>انتهت نافذة الرد. الإرسال النصي متوقف حتى يرسل العميل رسالة جديدة.</T>:null}
    <TextInput accessibilityLabel="رسالة واتساب" multiline value={draft} onChangeText={setDraft} maxLength={4096} onFocus={onComposerFocus} placeholder="اكتب رسالتك..." placeholderTextColor={C.muted} style={{minHeight:121,backgroundColor:C.surface2,color:C.text,borderWidth:1,
     borderColor:C.stroke,borderRadius:16,padding:16,textAlign:'right',textAlignVertical:'top'}}/>
    <Action label={sending?'جارٍ الإرسال...':'إرسال الرسالة'} icon="send" disabled={sending||!draft.trim()||!windowOpen||busy} onPress={send}/>
   </Card>
  </>:null}
 </View>;
}
