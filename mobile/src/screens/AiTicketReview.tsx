import React,{useEffect,useRef,useState} from 'react';
import {ActivityIndicator,Pressable,TextInput,View} from 'react-native';
import * as SecureStore from 'expo-secure-store';
import {md5} from 'js-md5';
import type {QueueJob,Session,Ticket} from '../types';
import {C} from '../theme';
import {getApiRetryAfterMs} from '../lib/api';
import {AiReviewedTicket,checkAiLastReply} from '../lib/aiTicketReview';
import {fetchTicketQueue} from '../lib/tickets';
import {adminSessionReady} from '../lib/adminSession';
import {fetchAiSnapshot} from '../lib/aiSnapshot';
import {AdminAccess} from '../components/AdminAccess';
import {Action,Card,Header,Icon,Notice,Pill,Search,T} from '../components/UI';

const PAGE=20,SCAN=6;
const keyFor=(s:Session)=>'whmcs-ai-sender-'+md5(s.baseUrl);
const plain=(s:string)=>s.replace(/<br\s*\/?\s*>/gi,' ').replace(/<[^>]*>/g,' ')
 .replace(/&nbsp;/gi,' ').replace(/&amp;/gi,'&').replace(/\s+/g,' ').trim().slice(0,160);
const queueName=(state:string)=>state==='processing'?'جارٍ التنفيذ':
 state==='pending'?'في الانتظار':state==='retry'?'إعادة محاولة':state==='ready'?'جاهزة':state;

export function AiTicketReview({session,demo,onBack,onOpen}:{
 session:Session|null;demo:boolean;onBack:()=>void;onOpen:(ticket:Ticket)=>void;
}){
 const [scope,setScope]=useState<'answered'|'allActive'>('answered');
 const [senderReady,setSenderReady]=useState(false);
 const [sender,setSender]=useState('AI'),[search,setSearch]=useState('');
 const [rows,setRows]=useState<Ticket[]>([]),[total,setTotal]=useState<number|null>(null);
 const [offset,setOffset]=useState(0),[checked,setChecked]=useState(0);
 const [matches,setMatches]=useState<AiReviewedTicket[]>([]);
 const [loading,setLoading]=useState(false),[scanning,setScanning]=useState(false);
 const [error,setError]=useState(''),[scanError,setScanError]=useState('');
 const [queue,setQueue]=useState<QueueJob[]>([]),[queueReady,setQueueReady]=useState(false);
 const [queueBusy,setQueueBusy]=useState(false),[queueError,setQueueError]=useState('');
 const [showLogin,setShowLogin]=useState(false);
 const alive=useRef(true),version=useRef(0),autoScan=useRef(false);
 useEffect(()=>()=>{alive.current=false;version.current++;},[]);
 useEffect(()=>{
  let current=true;setSenderReady(false);setSender('AI');
  if(session)void SecureStore.getItemAsync(keyFor(session)).then(value=>{
   if(current&&value&&value.length<=400)setSender(value);
  }).catch(()=>{}).finally(()=>{if(current)setSenderReady(true);});
  return()=>{current=false;};
 },[session]);
 const persist=()=>{if(session&&sender.trim())void SecureStore.setItemAsync(keyFor(session),sender.trim()).catch(()=>{});};
 const load=async(start=0)=>{
  if(!session||demo||loading||scanning)return;
  const versionAt=++version.current;
  setLoading(true);setError('');setScanError('');
  if(start===0){setRows([]);setMatches([]);setChecked(0);setTotal(null);setOffset(0);}
  try{
   const response=await fetchTicketQueue(session,scope,start,PAGE);
   if(!alive.current||versionAt!==version.current)return;
   if(!response.ok){setError(response.error||'تعذر قراءة تذاكر WHMCS');return;}
   setRows(prev=>start===0?response.tickets:[
    ...prev,...response.tickets.filter(t=>!prev.some(x=>x.id===t.id))]);
   setTotal(response.total);setOffset(start+PAGE);
   if(start===0)autoScan.current=true;
  }catch(e){if(alive.current&&versionAt===version.current)setError(e instanceof Error?e.message:'خطأ اتصال');}
  finally{if(alive.current&&versionAt===version.current)setLoading(false);}
 };
 useEffect(()=>{
  version.current++;setRows([]);setMatches([]);setChecked(0);setTotal(null);setOffset(0);
  autoScan.current=false;
  if(session&&!demo&&senderReady)void load();
 },[session,scope,demo,senderReady]);
 const scan=async()=>{
  if(!session||demo||loading||scanning||checked>=rows.length)return;
  if(!sender.trim()){setScanError('اكتب اسم مستخدم AI في WHMCS.');return;}
  const wait=getApiRetryAfterMs();
  if(wait>0){setScanError('WHMCS طلب الانتظار '+Math.ceil(wait/1000)+' ثانية.');return;}
  const running=version.current;
  setScanning(true);setScanError('');
  for(let i=checked;i<Math.min(rows.length,checked+SCAN);i++){
   if(!alive.current||running!==version.current)break;
   const result=await checkAiLastReply(session,rows[i]!,sender);
   if(!alive.current||running!==version.current)break;
   if(result.kind==='error'){
    setScanError(result.message+' — التذكرة غير محسوبة ضمن النتائج المؤكدة.');
    if(result.rateLimited)break;
   }else if(result.kind==='match'){
    setMatches(prev=>prev.some(x=>x.ticket.id===result.review.ticket.id)?prev:[...prev,result.review]);
   }
   setChecked(i+1);
  }
  if(alive.current&&running===version.current)setScanning(false);
 };
 useEffect(()=>{
  if(!loading&&rows.length&&checked===0&&autoScan.current){
   autoScan.current=false;
   void scan();
  }
 },[rows.length,loading,checked,sender]);
 const loadQueue=async()=>{
  if(!session||demo||!adminSessionReady(session)||queueBusy)return;
  setQueueBusy(true);setQueueError('');
  try{
   const result=await fetchAiSnapshot(session);
   if(alive.current){
    setQueue(result.queue.filter(q=>['processing','pending','retry','ready','queued','waiting']
     .includes(q.state.toLowerCase())));
    setQueueReady(true);
   }
  }catch(e){
   if(alive.current){setQueueReady(false);setQueueError(e instanceof Error?e.message:'تعذر قراءة طابور AI');}
  }finally{if(alive.current)setQueueBusy(false);}
 };
 useEffect(()=>{if(session&&!demo&&adminSessionReady(session))void loadQueue();},[session,demo]);
 const changeSender=(value:string)=>{setSender(value);setChecked(0);setMatches([]);setScanError('');autoScan.current=false;};
 const visible=matches.filter(x=>(x.ticket.subject+' '+x.ticket.number+' '+x.ticket.customer+' '+x.message)
  .toLowerCase().includes(search.trim().toLowerCase()));
 const openQueue=(item:QueueJob)=>{
  if(item.ticket<=0||!Number.isSafeInteger(item.ticket))return;
  onOpen({id:item.ticket,number:String(item.ticket),subject:'تذكرة AI #'+item.ticket,
   customer:'',department:'',priority:'',status:'غير متحقق',updated:'',flag:0,replyCount:null});
 };
 return <View style={{gap:12,paddingBottom:24}}>
  <Pressable accessibilityRole="button" onPress={onBack}
   style={{flexDirection:'row-reverse',alignItems:'center',gap:7,paddingVertical:7}}>
   <Icon name="arrow-right" color={C.red} size={18}/><T color={C.red} weight="800">العودة للتذاكر</T>
  </Pressable>
  <Header title="مراجعة تذاكر الـAI" subtitle="آخر رد مؤكد والطابور الحالي"
   right={<Icon name="robot-outline" size={26} color={C.purple}/>}/>
  <Card style={{gap:9}}>
   <View style={{flexDirection:'row-reverse',gap:7}}>
    <View style={{flex:1}}><Action compact label="تم الرد" secondary={scope!=='answered'}
     disabled={scanning||loading} onPress={()=>setScope('answered')}/></View>
    <View style={{flex:1}}><Action compact label="كل غير المغلقة" secondary={scope!=='allActive'}
     disabled={scanning||loading} onPress={()=>setScope('allActive')}/></View>
   </View>
   <T size={11} color={C.muted}>اسم مستخدم الـAI في WHMCS (يمكن كتابة عدة أسماء مفصولة بفاصلة)</T>
   <TextInput value={sender} onChangeText={changeSender} onBlur={persist}
    editable={senderReady&&!loading&&!scanning} placeholder="AI" placeholderTextColor={C.muted} autoCapitalize="none"
    style={{borderWidth:1,borderColor:C.stroke,borderRadius:10,backgroundColor:C.surface2,
     color:C.text,paddingVertical:9,paddingHorizontal:12,textAlign:'right'}}/>
   <T size={10} color={C.muted}>يتم مطابقة صاحب آخر رد فعلي، وليس حالة التذكرة وحدها. الفحص تدريجي لحماية WHMCS API.</T>
  </Card>
  <Card style={{gap:9}}>
   <View style={{flexDirection:'row-reverse',justifyContent:'space-between',alignItems:'center'}}>
    <T size={14} weight="800">التذاكر التي آخر رد فيها من AI</T>
    <Pill label={String(matches.length)+' مؤكدة'} color={C.purple}/>
   </View>
   <T size={11} color={C.muted}>تم فحص {checked} من {rows.length} محمّلة{total!==null?' • إجمالي '+total:''} — القائمة جزئية حتى اكتمال الفحص.</T>
   {loading||scanning?<View style={{flexDirection:'row-reverse',alignItems:'center',gap:8}}>
    <ActivityIndicator size="small" color={C.red}/><T size={11} color={C.muted}>{loading?'تحميل القائمة':'فحص آخر رد...'}</T>
   </View>:null}
   {error?<Notice tone="warning" title="تعذر تحميل القائمة" message={error}/>:null}
   {scanError?<Notice tone="warning" title="فحص غير مكتمل" message={scanError}/>:null}
   <Search value={search} onChange={setSearch} placeholder="بحث في النتائج المؤكدة"/>
   {visible.map(item=><Pressable key={item.ticket.id} onPress={()=>onOpen(item.ticket)}
    accessibilityRole="button" style={({pressed})=>({gap:6,paddingVertical:10,
     borderBottomWidth:1,borderBottomColor:C.stroke,opacity:pressed?0.72:1})}>
    <View style={{flexDirection:'row-reverse',alignItems:'center',gap:7}}>
     <Icon name="ticket-outline" size={18} color={C.purple}/>
     <View style={{flex:1,gap:2}}>
      <T size={13} weight="800" lines={2}>{item.ticket.subject}</T>
      <T size={10} color={C.muted}>#{item.ticket.number} • {item.ticket.customer}</T>
     </View><Icon name="chevron-left" size={16} color={C.muted}/>
    </View>
    <View style={{flexDirection:'row-reverse',gap:5,flexWrap:'wrap'}}>
     <Pill label={item.ticket.status} color={C.blue}/>
     <Pill label={'آخر رد: '+item.author} color={C.purple}/>
     {item.transferMentioned?<Pill label="ذُكر تحويل — يحتاج مراجعة" color={C.orange}/>:null}
    </View>
    <T size={11} color={C.muted} lines={2}>{plain(item.message)}</T>
    <T size={10} color={C.muted}>{item.date}</T>
   </Pressable>)}
   {!visible.length&&!loading&&!scanning?<T size={11} color={C.muted}>لا توجد نتائج مؤكدة في الجزء الذي تم فحصه.</T>:null}
   {checked<rows.length?<Action compact secondary icon="magnify" disabled={loading||scanning}
    label="فحص الدفعة التالية (حتى 6)" onPress={()=>void scan()}/>:null}
   {checked>=rows.length&&total!==null&&offset<total?<Action compact secondary icon="plus"
    disabled={loading||scanning} label="تحميل تذاكر أخرى" onPress={()=>void load(offset)}/>:null}
   <Action compact secondary icon="refresh" disabled={loading||scanning}
    label="إعادة الفحص من البداية" onPress={()=>{void load();void loadQueue();}}/>
  </Card>
  <Card style={{gap:9}}>
   <View style={{flexDirection:'row-reverse',alignItems:'center',justifyContent:'space-between'}}>
    <T size={14} weight="800">مهام AI الجارية والمنتظرة</T>
    {queueReady?<Pill label={String(queue.length)} color={C.green}/>:null}
   </View>
   {session&&!demo&&!adminSessionReady(session)?<>
    <Notice tone="info" title="يتطلب جلسة إدارة" message="لا يمكن التأكد من المهام الجارية بدون الاتصال بغرفة عمليات موديول AI."/>
    <Action compact secondary icon="login" label={showLogin?'إخفاء تسجيل الدخول':'تسجيل دخول الإدارة'}
     onPress={()=>setShowLogin(x=>!x)}/>
    {showLogin?<AdminAccess session={session} onReady={()=>void loadQueue()}/>:null}
   </>:null}
   {queueError?<Notice tone="warning" title="الطابور غير متاح" message={queueError}/>:null}
   {queueBusy?<ActivityIndicator color={C.purple}/>:null}
   {queueReady&&queue.length===0?<T size={11} color={C.muted}>لا توجد تذاكر قيد المعالجة أو الانتظار في آخر لقطة من الموديول.</T>:null}
   {queue.map(item=><Pressable key={item.ticket} onPress={()=>openQueue(item)}
    accessibilityRole="button" style={({pressed})=>({gap:5,paddingVertical:10,
    borderBottomWidth:1,borderBottomColor:C.stroke,opacity:pressed?0.7:1})}>
    <View style={{flexDirection:'row-reverse',gap:7,alignItems:'center'}}>
     <Icon name="robot-outline" color={item.state==='processing'?C.green:C.orange} size={17}/>
     <T size={12} weight="800">تذكرة #{item.ticket}</T><View style={{flex:1}}/>
     <Pill label={queueName(item.state)} color={item.state==='processing'?C.green:C.orange}/>
    </View><T color={C.muted} size={10}>الوكيل: {item.agent||'غير محدد'} {item.since?'• '+item.since:''}</T>
   </Pressable>)}
   {session&&adminSessionReady(session)?<Action compact secondary icon="refresh"
    disabled={queueBusy} label="تحديث الطابور" onPress={()=>void loadQueue()}/>:null}
   <T size={10} color={C.muted}>ذكر التحويل داخل رد AI لا يثبت نجاحه أو فشله؛ افتح التذكرة للتحقق من الحالة الفعلية.</T>
  </Card>
 </View>;
}
