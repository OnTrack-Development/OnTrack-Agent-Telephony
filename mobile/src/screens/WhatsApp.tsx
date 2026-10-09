import React,{useCallback,useEffect,useRef,useState} from 'react';
import {ActivityIndicator,Alert,AppState,BackHandler,Pressable,TextInput,View} from 'react-native';
import {C} from '../theme';
import type {Session} from '../types';
import {Action,Card,Empty,Header,Icon,Pill,T} from '../components/UI';
import {AdminAccess} from '../components/AdminAccess';
import {adminSessionReady} from '../lib/adminSession';
import {WaConversation,WaMessage,conversationMessages,listConversations,markConversationRead,prepareWhatsApp,sendWhatsAppText} from '../lib/whatsapp';

export function WhatsApp({session,demo=false,onComposerFocus,onDetailChange}:{session:Session|null;demo:boolean;onComposerFocus?:()=>void;onDetailChange?:(active:boolean)=>void}){
 const [connected,setConnected]=useState(!!session&&adminSessionReady(session)),[search,setSearch]=useState(''),[unreadOnly,setUnreadOnly]=useState(false);
 const [rows,setRows]=useState<WaConversation[]>([]),[unread,setUnread]=useState(0),[selected,setSelected]=useState<WaConversation|null>(null);
 const [messages,setMessages]=useState<WaMessage[]>([]),[draft,setDraft]=useState(''),[busy,setBusy]=useState(false),[sending,setSending]=useState(false),[error,setError]=useState('');
 const [older,setOlder]=useState(true),[loadingOlder,setLoadingOlder]=useState(false),[windowAt,setWindowAt]=useState(Date.now()),[now,setNow]=useState(Date.now());
 const generation=useRef(0),readInFlight=useRef(false),sendInFlight=useRef(false),active=useRef(true),selectedId=useRef<number|null>(null);
 selectedId.current=selected?.id||null;
 const close=()=>{generation.current++;setSelected(null);setMessages([]);setDraft('');setError('');};
 useEffect(()=>{active.current=true;return()=>{active.current=false;generation.current++;};},[]);
 useEffect(()=>{onDetailChange?.(!!selected);return()=>onDetailChange?.(false);},[!!selected]);
 useEffect(()=>{if(!selected)return;const sub=BackHandler.addEventListener('hardwareBackPress',()=>{close();return true;});return()=>sub.remove();},[!!selected]);
 const report=(e:unknown)=>{
  if(!active.current)return;
  setError(e instanceof Error?e.message:'تعذر الاتصال');
  if(session&&!adminSessionReady(session)){setConnected(false);setRows([]);setMessages([]);setSelected(null);}
 };
 const refresh=useCallback(async()=>{
  if(!session||demo||!connected||readInFlight.current||AppState.currentState!=='active')return;
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
 const connect=async()=>{
  if(!session)return;
  setBusy(true);setError('');
  try{await prepareWhatsApp(session);setConnected(true);const list=await listConversations(session);if(active.current){setRows(list.conversations);setUnread(list.unread);}}
  catch(e){report(e);setConnected(false);}
  finally{if(active.current)setBusy(false);}
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
    try{
     await sendWhatsAppText(session,id,text);
     if(active.current&&stamp===generation.current){setDraft('');setError('');}
     // Sending is confirmed by the existing module. A later refresh failure does not re-send.
     const data=await conversationMessages(session,id);
     if(active.current&&stamp===generation.current){setMessages(prev=>[...prev.filter(m=>!data.messages.some(x=>x.id===m.id)),...data.messages].sort((a,b)=>a.id-b.id));setSelected(data.conversation);setWindowAt(Date.now());}
    }catch(e){if(stamp===generation.current)report(e);}
    finally{sendInFlight.current=false;if(active.current)setSending(false);}
   }}
  ],{cancelable:false});
 };
 if(!session||demo)return <View><Header title="واتساب" subtitle="محادثات العملاء"/><Empty icon="whatsapp" text="اربط حساب WHMCS لعرض محادثات واتساب الحقيقية"/></View>;
 return <View style={{gap:14,paddingBottom:24}}>
  {selected?<Pressable onPress={close} style={{flexDirection:'row-reverse',gap:8,paddingVertical:8}}><Icon name="arrow-right" color={C.green}/><T color={C.green}>المحادثات</T></Pressable>:null}
  <Header title={selected?.display_name||'واتساب'} subtitle={selected?.phone||'محادثات العملاء'} right={<Icon name="whatsapp" size={29} color={C.green}/>}/>
  {error?<Card style={{gap:10}}><T size={12} color={C.orange}>{error}</T><Action secondary label="إعادة المحاولة" disabled={busy} onPress={()=>void (connected?refresh():connect())}/></Card>:null}
  {!connected?<><AdminAccess key={error} session={session} onReady={()=>void connect()}/>{adminSessionReady(session)?<Action label="تحميل المحادثات" disabled={busy} onPress={()=>void connect()}/>:null}</>:null}
  {busy?<ActivityIndicator color={C.green}/>:null}
  {connected&&!selected?<>
   <View style={{flexDirection:'row-reverse',gap:8,alignItems:'center'}}><View style={{flex:1}}><TextInput accessibilityLabel="بحث المحادثات" value={search} onChangeText={v=>{generation.current++;setSearch(v);}} placeholder="اسم العميل أو الرقم" placeholderTextColor={C.muted} style={{backgroundColor:C.surface2,color:C.text,padding:12,borderRadius:12,textAlign:'right'}}/></View><Pill label={`${unread} غير مقروءة`} color={C.green}/></View>
   <Pressable onPress={()=>{generation.current++;setUnreadOnly(!unreadOnly);}} style={{flexDirection:'row-reverse',gap:8,alignItems:'center'}}><Icon name={unreadOnly?'checkbox-marked':'checkbox-blank-outline'} color={C.green}/><T size={12}>غير المقروءة فقط</T></Pressable>
   <Action secondary label="تحديث المحادثات" disabled={busy} onPress={()=>void refresh()}/>
   <Card style={{paddingVertical:3}}>{rows.length?rows.map(row=><Pressable key={row.id} onPress={()=>void open(row)} style={{paddingVertical:14,borderBottomWidth:1,borderBottomColor:C.stroke,gap:7}}>
    <View style={{flexDirection:'row-reverse',alignItems:'center',gap:10}}><Icon name="account-circle" size={34} color={C.green}/><View style={{flex:1,gap:4}}><T weight="800" size={14}>{row.display_name}</T><T size={11} color={C.muted}>{row.phone}</T></View>{row.unread_count>0?<Pill label={String(row.unread_count)} color={C.green}/>:null}</View>
    <T lines={1} size={12} color={C.muted}>{row.last_message_preview||'محادثة بدون نص'}</T><T size={10} color={C.muted}>{row.last_message_at}</T>
   </Pressable>):!busy?<Empty icon="whatsapp" text="لا توجد محادثات مطابقة"/>:null}</Card>
  </>:null}
  {selected?<>
   <Pill label={windowOpen?`نافذة الرد مفتوحة • ${Math.ceil(remaining/3600)} ساعة متبقية`:'نافذة الرد مغلقة'} color={windowOpen?C.green:C.orange}/>
   {older&&messages.length?<Action secondary label={loadingOlder?'جارٍ التحميل...':'تحميل رسائل أقدم'} disabled={loadingOlder} onPress={()=>void more()}/>:null}
   {messages.map(message=><View key={message.id} style={{alignSelf:message.direction==='outgoing'?'flex-end':'flex-start',width:'92%'}}><Card style={{gap:7,backgroundColor:message.direction==='outgoing'?'#123B32':C.surface}}>
    <T size={13}>{message.body||message.media_filename||(message.has_media?'مرفق: '+message.message_type:'رسالة '+message.message_type)}</T>
    {message.has_media?<T size={11} color={C.muted}>مرفق • {message.message_type}{message.media_filename?' • '+message.media_filename:''}</T>:null}
    <T size={10} color={C.muted}>{message.timestamp}{message.direction==='outgoing'?' • '+message.status:''}</T>
    {message.error_text?<T size={11} color={C.orange}>{message.error_text}</T>:null}
   </Card></View>)}
   {!messages.length&&!busy?<Empty text="لا توجد رسائل"/>:null}
   <Card style={{gap:12}}>
    <T weight="800">الرد على العميل</T>
    {!windowOpen?<T size={12} color={C.orange}>انتهت نافذة الرد. الإرسال النصي متوقف حتى يرسل العميل رسالة جديدة.</T>:null}
    <TextInput accessibilityLabel="رسالة واتساب" multiline value={draft} onChangeText={setDraft} maxLength={4096} onFocus={onComposerFocus} placeholder="اكتب رسالتك..." placeholderTextColor={C.muted} style={{minHeight:110,backgroundColor:C.surface2,color:C.text,borderRadius:12,padding:14,textAlign:'right',textAlignVertical:'top'}}/>
    <Action label={sending?'جارٍ الإرسال...':'إرسال الرسالة'} icon="send" disabled={sending||!draft.trim()||!windowOpen||busy} onPress={send}/>
   </Card>
  </>:null}
 </View>;
}
