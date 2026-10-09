import React,{useEffect,useRef,useState} from 'react';
import {ActivityIndicator,Alert,BackHandler,Pressable,TextInput,View} from 'react-native';
import {C} from '../theme';
import type {Chat,ChatMessage,Session} from '../types';
import {Action,Card,Empty,Header,Icon,ItemRow,Pill,Search,T} from '../components/UI';
import {getWhatsAppInbox,getWhatsAppThread,loadWaPair,pairWhatsApp,sendWhatsAppText,unpairWhatsApp} from '../lib/whatsappBridge';

export function WhatsApp({session,chats:demoChats=[],demo=false,enabled=false,canSend=false,onSend}:{
 session:Session|null;chats:Chat[];enabled:boolean;canSend:boolean;onSend:(id:string,text:string)=>Promise<boolean>;demo:boolean;
}){
 const [chats,setChats]=useState<Chat[]>([]),[selected,setSelected]=useState<Chat|null>(null);
 const [messages,setMessages]=useState<ChatMessage[]>([]),[q,setQ]=useState(''),[draft,setDraft]=useState('');
 const [code,setCode]=useState(''),[paired,setPaired]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const [sending,setSending]=useState(false),generation=useRef(0);
 const load=async(s:Session)=>{
  const ticket=++generation.current;
  setBusy(true);setError('');
  const result=await getWhatsAppInbox(s);
  if(ticket!==generation.current)return;
  setBusy(false);
  if(result.ok&&result.data){setChats(result.data);setPaired(true);}
  else{setError(result.error||'تعذر تحميل WhatsApp Inbox');if(result.code==='AUTH_EXPIRED'||result.code==='NOT_PAIRED')setPaired(false);}
 };
 useEffect(()=>{
  if(demo){setChats(demoChats);setPaired(true);return;}
  if(!session){setPaired(false);return;}
  let active=true;
  void loadWaPair(session.baseUrl).then(p=>{
   if(!active)return;
   setPaired(!!p);
   if(p)void load(session);
  });
  return()=>{active=false;generation.current++};
 },[session?.baseUrl,session?.identifier,session?.username,demo]);
 useEffect(()=>{
  if(!selected)return;
  const sub=BackHandler.addEventListener('hardwareBackPress',()=>{setSelected(null);return true});
  return()=>sub.remove();
 },[selected]);
 const pair=async()=>{
  if(!session||busy)return;
  setBusy(true);setError('');
  const r=await pairWhatsApp(session,code);
  setBusy(false);
  if(!r.ok){setError(r.error||'فشل الربط');return;}
  setCode('');setPaired(true);await load(session);
 };
 const open=async(chat:Chat)=>{
  setSelected(chat);setMessages(chat.messages);setError('');
  if(!demo&&session){
   setBusy(true);
   const r=await getWhatsAppThread(session,chat.id);
   setBusy(false);
   if(r.ok&&r.data)setMessages(r.data);
   else setError(r.error||'تعذر تحميل المحادثة');
  }
 };
 const send=async()=>{
  if(!selected||!draft.trim()||sending)return;
  if(demo){const ok=await onSend(selected.id,draft.trim());if(ok)setDraft('');return;}
  if(!session)return;
  const text=draft.trim();setSending(true);setError('');
  const r=await sendWhatsAppText(session,selected.id,text);
  setSending(false);
  if(!r.ok){setError(r.error||'تعذر إرسال رسالة واتساب');return;}
  setDraft('');
  const read=await getWhatsAppThread(session,selected.id);
  if(read.ok&&read.data)setMessages(read.data);
  else setError('تم تأكيد الإرسال، لكن تحديث المحادثة تأخر.');
 };
 if(!demo&&!paired)return <View style={{gap:14,paddingBottom:25}}>
  <Header title="WhatsApp Inbox" subtitle="الربط الآمن بمحادثات الموديول على WHMCS" right={<Icon name="whatsapp" color={C.green} size={30}/>}/>
  <Card style={{gap:12}}>
   <T weight="800" size={17}>ربط الجهاز بالواتساب</T>
   <T color={C.muted} size={12}>افتح إضافة OnTrack Command Mobile في لوحة WHMCS وأنشئ رمز ربط للجهاز بصلاحية WhatsApp. الرمز مختلف عن Webhook Verify Token الخاص بـMeta.</T>
   <TextInput value={code} onChangeText={setCode} autoCapitalize="characters" autoCorrect={false} maxLength={12}
    placeholder="رمز الربط — 12 حرفًا أو رقمًا" placeholderTextColor={C.muted}
    style={{borderWidth:1,borderColor:C.stroke,backgroundColor:C.surface2,borderRadius:12,padding:14,color:C.text,textAlign:'center',fontSize:17}}/>
   <Action label={busy?'جارٍ الربط...':'ربط محادثات واتساب'} icon="shield-link-variant" disabled={busy||!/^[A-F0-9]{12}$/i.test(code.trim())} onPress={()=>void pair()}/>
  </Card>
  {error?<Card><T color={C.orange}>{error}</T></Card>:null}
  <T color={C.muted} size={12}>يحتاج تركيب Companion مستقل على سيرفر WHMCS مرة واحدة. موديول whatsapp_notifications الأصلي والويبهوك الخاص به يظلان بدون تعديل.</T>
 </View>;
 if(selected)return <View style={{gap:12,paddingBottom:35}}>
  <Pressable onPress={()=>setSelected(null)} style={{flexDirection:'row-reverse',gap:8,alignItems:'center'}}>
   <Icon name="arrow-right" color={C.green}/><T color={C.green}>المحادثات</T>
  </Pressable>
  <Header title={selected.name} subtitle={selected.phone}/>
  {busy?<ActivityIndicator color={C.green}/>:null}
  <Card style={{minHeight:230,gap:10}}>
   {messages.map(m=><View key={m.id} style={{alignSelf:m.from==='agent'?'flex-start':'flex-end',backgroundColor:m.from==='agent'?'#183A33':C.surface2,padding:12,borderRadius:15,maxWidth:'92%',gap:5}}>
    <T>{m.body}</T><T color={C.muted} size={10}>{m.at}</T>
   </View>)}
   {!messages.length?<Empty icon="message-text-outline" text="لا توجد رسائل متاحة لهذه المحادثة"/>:null}
  </Card>
  <View style={{flexDirection:'row-reverse',gap:10,alignItems:'center'}}>
   <TextInput multiline value={draft} onChangeText={setDraft} placeholder="رسالتك..." placeholderTextColor={C.muted}
    style={{flex:1,borderWidth:1,borderColor:C.stroke,backgroundColor:C.surface,padding:13,borderRadius:13,color:C.text,textAlign:'right'}}/>
   <Pressable onPress={()=>void send()} disabled={sending||!draft.trim()} style={{padding:14,borderRadius:12,backgroundColor:sending?C.surface2:C.green}}>
    <Icon name="send" color={C.bg}/>
   </Pressable>
  </View>
  {error?<T color={C.orange} size={12}>{error}</T>:null}
  <T color={C.muted} size={11}>الإرسال من خلال خدمة الموديول الأصلية، مع الالتزام بفترة خدمة العميل ذات الـ24 ساعة وسياسات Meta.</T>
 </View>;
 const list=chats.filter(c=>(c.name+' '+c.phone).toLowerCase().includes(q.toLowerCase()));
 return <View style={{gap:11,paddingBottom:25}}>
  <Header title="WhatsApp Inbox" subtitle="محادثات حقيقية من موديول WHMCS" right={<Icon name="whatsapp" color={C.green} size={30}/>}/>
  {!demo?<View style={{flexDirection:'row-reverse',gap:8}}>
   <View style={{flex:1}}><Action secondary compact label={busy?'جارٍ التحميل...':'تحديث المحادثات'} icon="refresh" disabled={busy} onPress={()=>session&&void load(session)}/></View>
   <Action compact secondary icon="logout" label="فصل" onPress={()=>Alert.alert('فصل واتساب','هل تريد إلغاء ربط الجهاز؟',[
    {text:'إلغاء',style:'cancel'},
    {text:'فصل',style:'destructive',onPress:async()=>{await unpairWhatsApp(session);setPaired(false);setChats([]);}}
   ])}/>
  </View>:null}
  {error?<Card><T color={C.orange}>{error}</T></Card>:null}
  <Search value={q} onChange={setQ} placeholder="اسم العميل أو رقم الهاتف..."/>
  {busy?<ActivityIndicator color={C.green}/>:null}
  <Card style={{paddingVertical:3}}>
   {list.length?list.map(chat=><ItemRow key={chat.id} icon="message-text"
    heading={chat.name} subtitle={chat.last||chat.phone} color={C.green}
    right={chat.unread?<Pill color={C.red} label={chat.unread+' جديد'}/>:<T color={C.muted} size={11}>{chat.time}</T>}
    onPress={()=>void open(chat)}/>):<Empty icon="whatsapp" text={demo?'لا توجد محادثات':'لا توجد محادثات في الواتساب أو تعذر جلبها'}/>}
  </Card>
 </View>;
}
