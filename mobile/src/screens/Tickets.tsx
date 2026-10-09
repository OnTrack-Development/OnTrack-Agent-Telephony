import React,{useCallback,useEffect,useState} from 'react';
import {ActivityIndicator,Alert,BackHandler,Pressable,ScrollView,TextInput,View} from 'react-native';
import type {Session,Ticket} from '../types';
import {getApiRetryAfterMs} from '../lib/api';
import {C} from '../theme';
import {Action,Card,Divider,Header,Icon,Pill,T} from '../components/UI';
import {QueueKind,OperatorProfile,TicketDetail,TicketBatch,changeTicket,fetchOperatorProfile,
 fetchSupportStatuses,fetchTicketDetail,fetchTicketQueue,isActionable,isClosed,
 priorityColor,replyWithSignature,signatureText} from '../lib/tickets';

type Collection={rows:Ticket[],total:number|null,offset:number,error:string,loading:boolean};
const empty=():Collection=>({rows:[],total:null,offset:0,error:'',loading:false});
const color=(p:string)=>priorityColor(p)==='urgent'?C.red:priorityColor(p)==='normal'?C.orange:C.green;
const sections:{id:QueueKind;label:string}[]=[
 {id:'awaiting',label:'مطلوب رد'},{id:'allActive',label:'كل النشطة'},
 {id:'answered',label:'تم الرد'},{id:'closed',label:'مغلقة'},{id:'all',label:'كل التذاكر'}
];
const showPlain=(input:string)=>input.replace(/<br\s*\/?\s*>/gi,'\n').replace(/<\/p>/gi,'\n')
 .replace(/<[^>]*>/g,' ').replace(/&nbsp;/gi,' ').replace(/&amp;/gi,'&').replace(/&lt;/gi,'<').replace(/&gt;/gi,'>').trim();

export function Tickets({session,tickets,onReply,demo,onComposerFocus,onDetailChange}:{
 session:Session|null;tickets:Ticket[];onReply:(id:number,text:string)=>Promise<boolean>;
 demo:boolean;onComposerFocus?:()=>void;onDetailChange?:(active:boolean)=>void
}){
 const [mode,setMode]=useState<QueueKind>('awaiting'),[search,setSearch]=useState('');
 const [assigned,setAssigned]=useState<Collection>(empty);
 const [general,setGeneral]=useState<Collection>(empty);
 const [selected,setSelected]=useState<Ticket|null>(null),[detail,setDetail]=useState<TicketDetail|null>(null);
 const [detailError,setDetailError]=useState(''),[detailLoading,setDetailLoading]=useState(false);
 const [profile,setProfile]=useState<OperatorProfile|null>(null);
 const [reply,setReply]=useState(''),[withSignature,setWithSignature]=useState(true),[sending,setSending]=useState(false);
 const [changing,setChanging]=useState(false),[statuses,setStatuses]=useState<string[]>(['Open','Customer-Reply','Answered','Closed']);
 const [showStatus,setShowStatus]=useState(false),[showPriority,setShowPriority]=useState(false);
 const [reloadCounter,setReloadCounter]=useState(0);
 const close=()=>{setSelected(null);setDetail(null);setReply('');setDetailError('');setShowPriority(false);setShowStatus(false);};
 useEffect(()=>{onDetailChange?.(selected!==null);return()=>onDetailChange?.(false);},[selected!==null]);
 useEffect(()=>{
  if(!selected)return;
  const sub=BackHandler.addEventListener('hardwareBackPress',()=>{close();return true;});
  return()=>sub.remove();
 },[selected]);
 useEffect(()=>{
  if(!session||demo||!selected){if(!session||demo)setProfile(null);return;}
  let active=true;
  void fetchOperatorProfile(session).then(x=>{if(active)setProfile(x);});
  void fetchSupportStatuses(session).then(x=>{if(active)setStatuses(x);});
  return()=>{active=false;};
 },[session?.baseUrl,session?.mode,session?.username,session?.identifier,demo,selected?.id]);
 const load=useCallback(async(which:'assigned'|'general',offset=0)=>{
  const selectedQueue=which==='assigned'?'assigned':mode;
  const setter=which==='assigned'?setAssigned:setGeneral;
  if(!session||demo)return;
  setter(prev=>({...prev,loading:true,error:offset?prev.error:''}));
  let response:TicketBatch;
  try{response=await fetchTicketQueue(session,selectedQueue,offset,40);}
  catch(e){response={ok:false,tickets:[],total:null,error:e instanceof Error?e.message:'فشل تحميل التذاكر'};}
  setter(prev=>{
   if(!response.ok)return {...prev,loading:false,error:response.error||'تعذر القراءة'};
   const mapped=offset===0?response.tickets:[...prev.rows,...response.tickets.filter(x=>!prev.rows.some(t=>t.id===x.id))];
   return {rows:mapped,total:response.total,offset:offset+40,error:'',loading:false};
  });
 },[session,mode,demo]);
 useEffect(()=>{
  if(demo){
   setAssigned({...empty(),rows:tickets.filter(t=>(t.flag||0)>0&&isActionable(t.status))});
   setGeneral({...empty(),rows:tickets.filter(t=>mode==='awaiting'?isActionable(t.status):
       mode==='closed'?isClosed(t.status):mode==='answered'?t.status.toLowerCase()==='answered':true)});
   return;
  }
  // Keep previous rows until fresh data is received; a 429 cannot clear the screen.
  void load('assigned',0);void load('general',0);
 },[session?.baseUrl,session?.mode,session?.username,session?.identifier,mode,demo,reloadCounter]);
 useEffect(()=>{
  if(demo||!session||![assigned.error,general.error].some(x=>/429|اتصال|network|timeout/i.test(x)))return;
  const timer=setTimeout(()=>setReloadCounter(n=>n+1),Math.max(15000,getApiRetryAfterMs()+2500));
  return()=>clearTimeout(timer);
 },[assigned.error,general.error,session,demo]);
 const refresh=()=>setReloadCounter(n=>n+1);
 const open=async(ticket:Ticket)=>{
  setSelected(ticket);setDetail(null);setDetailLoading(true);setDetailError('');setReply('');
  if(demo){
   setDetail({id:ticket.id,number:ticket.number,subject:ticket.subject,customer:ticket.customer,
    department:ticket.department,status:ticket.status,priority:ticket.priority,flag:ticket.flag||0,
    messages:[{id:'demo',name:ticket.customer,message:ticket.message||'',date:ticket.updated,admin:false}],notes:[]});
   setDetailLoading(false);return;
  }
  if(!session){setDetailError('لم يتم ربط WHMCS');setDetailLoading(false);return;}
  const result=await fetchTicketDetail(session,ticket.id);
  setDetailLoading(false);
  if(result.ok&&result.detail)setDetail(result.detail);
  else setDetailError(result.error||'تعذر فتح التذكرة');
 };
 const updateField=(field:'priority'|'status',value:string)=>{
  if(!selected||!session||changing||demo)return;
  Alert.alert('تأكيد التعديل',`هل تريد تغيير ${field==='priority'?'الأولوية':'الحالة'} إلى ${value}؟`,[
   {text:'إلغاء',style:'cancel'},
   {text:'تأكيد',onPress:async()=>{
    setChanging(true);
    try{
     const r=await changeTicket(session,selected.id,field,value);
     if(!r.ok){Alert.alert('تعذر التعديل',r.error||'رفض WHMCS التعديل');return;}
     const refreshed=await fetchTicketDetail(session,selected.id);
     if(refreshed.ok&&refreshed.detail)setDetail(refreshed.detail);
     else setDetail(prev=>prev?{...prev,[field]:value}:prev);
     refresh();setShowStatus(false);setShowPriority(false);
    }finally{setChanging(false);}
   }}
  ]);
 };
 const send=()=>{
  if(!selected||!reply.trim()||sending)return;
  const signature=profile?.signature||'';
  const body=replyWithSignature(reply,signature,withSignature);
  Alert.alert('تأكيد الرد','سيتم إرسال الرد الحقيقي إلى العميل في WHMCS. هل تريد المتابعة؟',[
   {text:'إلغاء',style:'cancel'},
   {text:'إرسال',onPress:async()=>{
    setSending(true);
    try{
     const ok=await onReply(selected.id,body);
     if(ok){
      setReply('');refresh();
      if(session){
       const updated=await fetchTicketDetail(session,selected.id);
       if(updated.ok&&updated.detail)setDetail(updated.detail);
      }
     }
    }finally{setSending(false);}
   }}
  ]);
 };
 const filter=(xs:Ticket[])=>xs.filter(t=>`${t.number} ${t.subject} ${t.customer} ${t.priority} ${t.status}`.toLowerCase().includes(search.trim().toLowerCase()));
 const assignedShown=filter(assigned.rows).filter(t=>isActionable(t.status));
 const assignedIds=new Set(assignedShown.map(x=>x.id));
 const generalShown=filter(general.rows).filter(t=>
  mode==='awaiting'?isActionable(t.status)&&!assignedIds.has(t.id):
  mode==='closed'?isClosed(t.status):mode==='answered'?t.status.toLowerCase()==='answered':true
 ).filter(t=>!assignedIds.has(t.id));
 const row=(ticket:Ticket)=>{
  return <Pressable key={ticket.id} onPress={()=>void open(ticket)} style={{paddingVertical:13,borderBottomWidth:1,borderBottomColor:C.stroke,gap:7}}>
   <View style={{flexDirection:'row-reverse',alignItems:'center',gap:10}}>
    <View style={{padding:9,backgroundColor:C.redDark,borderRadius:12}}><Icon name="ticket-outline" color={C.red} size={21}/></View>
    <View style={{flex:1,gap:3}}><T weight="800" size={14} lines={2}>{ticket.subject}</T>
     <T color={C.muted} size={11} lines={1}>#{ticket.number} • {ticket.customer}</T></View>
    <Icon name="chevron-left" color={C.muted} size={18}/>
   </View>
   <View style={{flexDirection:'row-reverse',alignItems:'center',gap:6,flexWrap:'wrap'}}>
    <Pill label={ticket.priority||'Medium'} color={color(ticket.priority)}/>
    <Pill label={ticket.status||'غير معروف'} color={isActionable(ticket.status)?C.red:C.blue}/>
    {ticket.flag?<Pill label={ticket.assignedName||`Assigned #${ticket.flag}`} color={C.orange}/>:null}
    {ticket.replyCount!==null&&ticket.replyCount!==undefined?<Pill label={`${ticket.replyCount} رد`} color={C.blue}/>:null}
   </View>
   <T color={C.muted} size={10}>{ticket.department?ticket.department+' • ':''}{ticket.updated}</T>
  </Pressable>;
 };
 const section=(title:string,queue:Collection,shown:Ticket[],which:'assigned'|'general')=>
  <View style={{marginTop:18}}>
   <View style={{flexDirection:'row-reverse',alignItems:'center',justifyContent:'space-between',marginBottom:9}}>
    <T weight="900" size={18}>{title}</T>
    <Pill label={queue.total===null?`${shown.length} محمّلة`:`${queue.rows.length} من ${queue.total}`} color={which==='assigned'?C.orange:C.blue}/>
   </View>
   {queue.error?<T color={C.orange} size={12}>{queue.error}</T>:null}
   <Card style={{paddingVertical:5}}>
    {shown.length?shown.map(row):queue.loading?<ActivityIndicator color={C.red} style={{padding:30}}/>:
    <T color={C.muted} size={12} style={{paddingVertical:17}}>{queue.error?'تعذر تحميل القائمة':'لا توجد تذاكر مطابقة في السجلات المحمّلة'}</T>}
   </Card>
   {queue.total!==null&&queue.offset<queue.total&&!queue.error?
    <View style={{marginTop:10}}><Action secondary disabled={queue.loading} label={queue.loading?'جارٍ التحميل...':'تحميل المزيد'} onPress={()=>void load(which,queue.offset)}/></View>:null}
  </View>;
 if(selected){
  const sig=signatureText(profile?.signature||'');
  return <View style={{paddingBottom:24}}>
   <Pressable onPress={close} style={{flexDirection:'row-reverse',gap:8,alignItems:'center',paddingVertical:8,marginBottom:10}}>
    <Icon name="arrow-right" color={C.red}/><T color={C.red} weight="800">التذاكر</T>
   </Pressable>
   <Header title={`تذكرة #${detail?.number||selected.number}`} subtitle={detail?.department||selected.department}/>
   <Card style={{gap:10}}>
    <T weight="900" size={17}>{detail?.subject||selected.subject}</T>
    <T color={C.muted} size={12}>{detail?.customer||selected.customer}</T>
    <View style={{flexDirection:'row-reverse',gap:7,flexWrap:'wrap'}}>
     <Pill label={detail?.status||selected.status} color={C.blue}/>
     <Pill label={detail?.priority||selected.priority} color={color(detail?.priority||selected.priority)}/>
     {(detail?.flag||selected.flag)?<Pill label={`Assigned #${detail?.flag||selected.flag}`} color={C.orange}/>:null}
    </View>
    {!demo?<View style={{flexDirection:'row-reverse',gap:9}}>
     <View style={{flex:1}}><Action secondary compact disabled={!detail||changing} label="تغيير الأولوية" onPress={()=>{setShowPriority(!showPriority);setShowStatus(false);}}/></View>
     <View style={{flex:1}}><Action secondary compact disabled={!detail||changing} label="تغيير الحالة" onPress={()=>{setShowStatus(!showStatus);setShowPriority(false);}}/></View>
    </View>:null}
    {showPriority?<View style={{flexDirection:'row-reverse',flexWrap:'wrap',gap:7}}>{['Low','Medium','High'].map(p=>
     <Pressable key={p} style={{padding:10,backgroundColor:C.surface2,borderRadius:9}} onPress={()=>updateField('priority',p)}><T>{p}</T></Pressable>)}</View>:null}
    {showStatus?<View style={{flexDirection:'row-reverse',flexWrap:'wrap',gap:7}}>{statuses.map(s=>
     <Pressable key={s} style={{padding:10,backgroundColor:C.surface2,borderRadius:9}} onPress={()=>updateField('status',s)}><T>{s}</T></Pressable>)}</View>:null}
   </Card>
   <T weight="900" size={17} style={{marginTop:22,marginBottom:11}}>الردود والمحادثة</T>
   {detailLoading?<ActivityIndicator color={C.red}/>:detailError?<T color={C.orange}>{detailError}</T>:null}
   {detail?.messages.map((m,i)=><Card key={m.id+'-'+i} style={{marginBottom:10,gap:7,backgroundColor:m.admin?C.redDark:C.surface}}>
    <View style={{flexDirection:'row-reverse',justifyContent:'space-between',gap:10}}>
     <T color={m.admin?C.red:C.blue} weight="800">{m.name}{m.admin?' • الإدارة':''}</T>
     <T color={C.muted} size={10}>{m.date}</T>
    </View>
    <T size={13} style={{textAlign:'right'}}>{showPlain(m.message)||'—'}</T>
    {(m.attachmentNames||[]).map(a=><T key={a} color={C.muted} size={11}>مرفق: {a}</T>)}
   </Card>)}
   {detail?.notes.length?<><T weight="900" size={16} style={{marginTop:16,marginBottom:9}}>الملاحظات الداخلية</T>
    {detail.notes.map(n=><Card key={n.id} style={{marginBottom:9,gap:6}}>
     <T size={12} color={C.orange}>{n.name} • {n.date}</T><T>{showPlain(n.message)}</T>
    </Card>)}</>:null}
   <Card style={{marginTop:18,gap:13}}>
    <T weight="900" size={17}>الرد على العميل</T>
    <TextInput multiline numberOfLines={5} value={reply} onChangeText={setReply}
     placeholder="اكتب ردك هنا..." placeholderTextColor={C.muted}
     onFocus={()=>onComposerFocus?.()}
     style={{backgroundColor:C.surface2,color:C.text,padding:15,borderRadius:13,
      textAlign:'right',textAlignVertical:'top',minHeight:132,fontSize:15}}/>
    {sig?<Pressable onPress={()=>setWithSignature(!withSignature)} style={{flexDirection:'row-reverse',gap:10,alignItems:'center'}}>
      <Icon name={withSignature?'checkbox-marked':'checkbox-blank-outline'} color={C.red}/>
      <T weight="700">إرفاق توقيع الأدمن من WHMCS</T></Pressable>:null}
    {sig&&withSignature?<View style={{padding:12,borderRadius:10,backgroundColor:C.surface2,gap:5}}>
      <T color={C.muted} size={11}>التوقيع الذي سيُضاف عند الإرسال</T><T size={12}>{sig}</T>
    </View>:null}
    {!profile&&!demo?<T color={C.muted} size={11}>تعذّر قراءة توقيع الأدمن من GetAdminDetails؛ لن نضيف توقيعًا غير موثّق.</T>:null}
    <Action label={sending?'جارٍ الإرسال...':'تأكيد وإرسال الرد'} disabled={sending||!reply.trim()||(!demo&&!detail)}
     icon="send" onPress={send}/>
   </Card>
  </View>;
 }
 return <View style={{paddingBottom:20}}>
  <Header title="مركز التذاكر" subtitle="التذاكر المسندة أولًا ثم التذاكر التي تحتاج ردًا"/>
  <View style={{backgroundColor:C.surface,borderColor:C.stroke,borderWidth:1,borderRadius:13,flexDirection:'row-reverse',alignItems:'center',paddingHorizontal:12,marginBottom:14}}>
   <Icon name="magnify" color={C.muted}/><TextInput value={search} onChangeText={setSearch} placeholder="بحث في التذاكر المحمّلة..." placeholderTextColor={C.muted}
    style={{flex:1,color:C.text,height:47,textAlign:'right',paddingHorizontal:9}}/>
  </View>
  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{flexDirection:'row-reverse',gap:7,paddingBottom:12}}>
   {sections.map(x=><Pressable key={x.id} onPress={()=>setMode(x.id)} style={{backgroundColor:mode===x.id?C.red:C.surface2,paddingVertical:10,paddingHorizontal:14,borderRadius:13,borderWidth:1,borderColor:mode===x.id?C.red:C.stroke}}>
    <T size={12} weight="800">{x.label}</T></Pressable>)}
  </ScrollView>
  {section('التذاكر المسندة إليّ • Assigned',assigned,assignedShown,'assigned')}
  {section(mode==='awaiting'?'تذاكر مفتوحة تنتظر الرد':'تذاكر • '+(sections.find(s=>s.id===mode)?.label||''),general,generalShown,'general')}
  <View style={{marginTop:15}}><Action secondary label="تحديث القائمتين" icon="refresh" onPress={refresh}/></View>
 </View>;
}
