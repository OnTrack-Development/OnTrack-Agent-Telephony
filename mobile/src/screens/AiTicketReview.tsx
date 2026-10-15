import React,{useEffect,useRef,useState} from 'react';
import {ActivityIndicator,Pressable,TextInput,View} from 'react-native';
import * as SecureStore from 'expo-secure-store';
import {md5} from 'js-md5';
import type {QueueJob,Session,Ticket} from '../types';
import {C} from '../theme';
import {getApiRetryAfterMs} from '../lib/api';
import {AiAdminUser,AiReviewedTicket,checkAiLastReply,fetchAiAdminUsers,fetchObservedResponders} from '../lib/aiTicketReview';
import {fetchTicketQueue} from '../lib/tickets';
import {adminSessionReady} from '../lib/adminSession';
import {fetchAiSnapshot} from '../lib/aiSnapshot';
import {AdminAccess} from '../components/AdminAccess';
import {Action,Card,Header,Icon,Notice,Pill,Search,T} from '../components/UI';

const PAGE=20,SCAN=6,DISCOVERY_BATCH=5;
const choiceKey=(u:AiAdminUser)=>u.id>0?'id:'+u.id:'reply:'+u.fullName.trim().toLocaleLowerCase('en-US');
const keyFor=(s:Session)=>'whmcs-ai-admin-id-'+md5(s.baseUrl+'|'+(s.mode==='admin'?s.username:s.identifier));
const plain=(s:string)=>s.replace(/<br\s*\/?\s*>/gi,' ').replace(/<[^>]*>/g,' ')
 .replace(/&nbsp;/gi,' ').replace(/&amp;/gi,'&').replace(/\s+/g,' ').trim().slice(0,160);
const queueName=(state:string)=>state==='processing'?'جارٍ التنفيذ':
 state==='pending'?'في الانتظار':state==='retry'?'إعادة محاولة':state==='ready'?'جاهزة':state;

export function AiTicketReview({session,demo,paused=false,onBack,onOpen}:{
 session:Session|null;demo:boolean;paused?:boolean;onBack:()=>void;onOpen:(ticket:Ticket)=>void;
}){
 const [scope,setScope]=useState<'answered'|'allActive'>('answered');
 const [senderReady,setSenderReady]=useState(false);
 const [admins,setAdmins]=useState<AiAdminUser[]>([]),[selectedChoice,setSelectedChoice]=useState('');
 const [savedChoice,setSavedChoice]=useState(''),[usingReplies,setUsingReplies]=useState(false);
 const [discovering,setDiscovering]=useState(false),[discoveredCount,setDiscoveredCount]=useState(0),[discoveryError,setDiscoveryError]=useState('');
 const discoveredTickets=useRef(new Set<number>()),discoveryActive=useRef(false);
 const [adminsError,setAdminsError]=useState(''),[showAdmins,setShowAdmins]=useState(false);
 const [adminSearch,setAdminSearch]=useState(''),[search,setSearch]=useState('');
 const [rows,setRows]=useState<Ticket[]>([]),[total,setTotal]=useState<number|null>(null);
 const [offset,setOffset]=useState(0),[checked,setChecked]=useState(0);
 const [matches,setMatches]=useState<AiReviewedTicket[]>([]);
 const [loading,setLoading]=useState(false),[scanning,setScanning]=useState(false);
 const [error,setError]=useState(''),[scanError,setScanError]=useState('');
 const [queue,setQueue]=useState<QueueJob[]>([]),[queueReady,setQueueReady]=useState(false);
 const [queueBusy,setQueueBusy]=useState(false),[queueError,setQueueError]=useState('');
 const [showLogin,setShowLogin]=useState(false);
 const alive=useRef(true),version=useRef(0),autoScan=useRef(false),stopScan=useRef(false);
 useEffect(()=>()=>{alive.current=false;version.current++;},[]);
 useEffect(()=>{if(paused){stopScan.current=true;version.current++;setScanning(false);setLoading(false);}},[paused]);
 useEffect(()=>{
  let current=true;setSenderReady(false);setAdmins([]);setSelectedChoice('');setSavedChoice('');setAdminsError('');
  setUsingReplies(false);setDiscovering(false);setDiscoveredCount(0);setDiscoveryError('');discoveredTickets.current.clear();
  if(session){
   void (async()=>{
    const [saved,result]=await Promise.all([
     SecureStore.getItemAsync(keyFor(session)).catch(()=>null),
     fetchAiAdminUsers(session)
    ]);
    if(!current)return;
    const savedKey=typeof saved==='string'?(saved.startsWith('id:')||saved.startsWith('reply:')?saved:'id:'+saved):'';
    setSavedChoice(savedKey);
    if(!result.ok||!result.users.length){
     // Do not require an additional privileged API role just to review tickets.
     setUsingReplies(true);
     setAdminsError(result.error||'دليل الموظفين غير متاح');
    }else{
     setAdmins(result.users);
     const selected=result.users.find(u=>choiceKey(u)===savedKey);
     if(selected)setSelectedChoice(savedKey);
    }
    setSenderReady(true);
   })().catch(e=>{
    if(current){setAdminsError(e instanceof Error?e.message:'تعذر عرض الموظفين');setSenderReady(true);}
   });
  }else setSenderReady(true);
  return()=>{current=false;};
 },[session]);
 const selectedAdmin=admins.find(a=>choiceKey(a)===selectedChoice)||null;
 const shownAdmins=admins.filter(a=>(a.fullName+' '+a.username+' '+a.id)
  .toLowerCase().includes(adminSearch.trim().toLowerCase()));
 const selectAdmin=(admin:AiAdminUser)=>{
  if(loading||scanning||paused)return;
  setSelectedChoice(choiceKey(admin));setShowAdmins(false);setScanError('');
  if(session)void SecureStore.setItemAsync(keyFor(session),choiceKey(admin),{
   keychainAccessible:SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY
  }).catch(()=>{});
 };
 const load=async(start=0)=>{
  if(!session||demo||paused||loading||scanning)return;
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
 },[session,scope,demo,senderReady,selectedChoice]);
 const scan=async(all=false)=>{
  if(!session||demo||paused||loading||scanning||discovering||checked>=rows.length)return;
  if(!selectedAdmin){setScanError('اختار موظف WHMCS المحدد للـAI أولًا.');return;}
  const wait=getApiRetryAfterMs();
  if(wait>0){setScanError('WHMCS طلب الانتظار '+Math.ceil(wait/1000)+' ثانية.');return;}
  const running=version.current;
  stopScan.current=false;setScanning(true);setScanError('');
  for(let i=checked;i<(all?rows.length:Math.min(rows.length,checked+SCAN));i++){
   if(!alive.current||running!==version.current||stopScan.current)break;
   const result=await checkAiLastReply(session,rows[i]!,selectedAdmin);
   if(!alive.current||running!==version.current||stopScan.current)break;
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
  if(!paused&&!loading&&!discovering&&selectedAdmin&&rows.length&&checked===0&&autoScan.current){
   autoScan.current=false;
   void scan();
  }
 },[rows.length,loading,checked,selectedChoice,paused]);
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
 const discover=async()=>{
  if(!session||demo||paused||loading||scanning||discoveryActive.current||!usingReplies)return;
  const wait=getApiRetryAfterMs();
  if(wait>0){setDiscoveryError('انتظر '+Math.ceil(wait/1000)+' ثانية قبل البحث في الردود.');return;}
  const todo=rows.filter(t=>t.id>0&&!discoveredTickets.current.has(t.id)).slice(0,DISCOVERY_BATCH);
  if(!todo.length)return;
  discoveryActive.current=true;setDiscovering(true);setDiscoveryError('');
  const gen=version.current;
  for(const ticket of todo){
   if(!alive.current||paused||gen!==version.current)break;
   const result=await fetchObservedResponders(session,ticket);
   if(!alive.current||gen!==version.current)break;
   if(result.rateLimited){setDiscoveryError(result.error||'WHMCS طلب تأجيل الطلبات');break;}
   discoveredTickets.current.add(ticket.id);
   setDiscoveredCount(x=>x+1);
   if(result.error)setDiscoveryError('تعذرت قراءة بعض التذاكر، ويمكن المحاولة لاحقًا.');
   if(result.users.length){
    setAdmins(previous=>{
     const collected=[...previous];
     for(const admin of result.users){
      if(!collected.some(x=>choiceKey(x)===choiceKey(admin)))collected.push(admin);
     }
     return collected.sort((a,b)=>a.fullName.localeCompare(b.fullName,'ar'));
    });
   }
  }
  discoveryActive.current=false;if(alive.current&&gen===version.current)setDiscovering(false);
 };
 useEffect(()=>{
  if(usingReplies&&!paused&&!loading&&rows.length&&discoveredCount===0&&!discoveryActive.current)
   void discover();
 },[usingReplies,rows.length,loading,paused]);
 useEffect(()=>{
  if(usingReplies&&!selectedChoice&&savedChoice&&admins.some(u=>choiceKey(u)===savedChoice))
   setSelectedChoice(savedChoice);
 },[usingReplies,savedChoice,admins,selectedChoice]);
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
   <T size={11} color={C.muted}>الموظف المحدد للرد باسم AI في إعدادات موديول الدعم</T>
   <Pressable accessibilityRole="button" accessibilityLabel="اختيار موظف WHMCS المرتبط بالـAI"
    disabled={!senderReady||loading||scanning} onPress={()=>setShowAdmins(v=>!v)}
    style={({pressed})=>({flexDirection:'row-reverse',alignItems:'center',gap:8,
     borderWidth:1,borderColor:selectedAdmin?C.purple:C.stroke,
     borderRadius:11,backgroundColor:C.surface2,padding:11,opacity:pressed?0.75:1})}>
    <Icon name="account-search-outline" size={19} color={C.purple}/>
    <View style={{flex:1,gap:3}}>
     <T size={13} weight="800">{selectedAdmin?selectedAdmin.fullName:'اختار مستخدم الـAI من موظفي WHMCS'}</T>
     {selectedAdmin?<T size={10} color={C.muted}>{selectedAdmin.source==='reply'?'اسم ظهر في ردود WHMCS • تطابق بالاسم الظاهر':selectedAdmin.username+' • ID '+selectedAdmin.id}</T>:null}
    </View>
    <Icon name={showAdmins?'chevron-up':'chevron-down'} color={C.muted} size={18}/>
   </Pressable>
   {usingReplies?<Notice tone="info" title="جلب الموظفين من ردود التذاكر"
    message="صلاحية دليل الموظفين غير متاحة. هنستخرج الأسماء الفعلية من ردود التذاكر المسموح بقراءتها، بدون طلب صلاحية GetAdminUsers. الأسماء المستخرجة ليست دليلًا كاملًا للموظفين."/>:null}
   {adminsError&&!usingReplies?<Notice tone="warning" title="تعذر جلب الموظفين" message={adminsError}/>:null}
   {usingReplies?<View style={{gap:7}}>
    <T size={10} color={C.muted}>{'تمت مراجعة ردود '+discoveredCount+' من '+rows.length+' تذاكر محمّلة • '+admins.length+' أسماء موظفين'}</T>
    {discovering?<ActivityIndicator size="small" color={C.purple}/>:null}
    {discoveryError?<T color={C.orange} size={11}>{discoveryError}</T>:null}
    <Action compact secondary icon="account-search" label="اكتشف مزيدًا من الموظفين من الردود"
     disabled={loading||scanning||discovering||!rows.some(t=>!discoveredTickets.current.has(t.id))}
     onPress={()=>void discover()}/>
   </View>:null}
   {!senderReady?<ActivityIndicator size="small" color={C.purple}/>:null}
   {showAdmins?<View style={{gap:6}}>
    <TextInput value={adminSearch} onChangeText={setAdminSearch}
     placeholder="ابحث باسم الموظف أو اسم المستخدم" placeholderTextColor={C.muted}
     style={{color:C.text,backgroundColor:C.surface2,borderWidth:1,
      borderColor:C.stroke,borderRadius:10,textAlign:'right',paddingHorizontal:11,paddingVertical:8}}/>
    {shownAdmins.slice(0,40).map(admin=><Pressable key={admin.id}
     accessibilityRole="button" onPress={()=>selectAdmin(admin)}
     style={{flexDirection:'row-reverse',alignItems:'center',gap:8,
      borderRadius:10,padding:9,borderWidth:1,borderColor:choiceKey(admin)===selectedChoice?C.purple:C.stroke}}>
     <Icon name={choiceKey(admin)===selectedChoice?'radiobox-marked':'radiobox-blank'}
      color={choiceKey(admin)===selectedChoice?C.purple:C.muted} size={18}/>
     <View style={{flex:1,gap:2}}>
      <T size={12} weight="800">{admin.fullName}</T>
      <T size={10} color={C.muted}>{admin.source==='reply'?'من ردود التذاكر • تطابق بالاسم':admin.username+' • #'+admin.id}{admin.disabled?' • حساب معطل':''}</T>
     </View>
    </Pressable>)}
    {shownAdmins.length>40?<T size={10} color={C.muted}>استخدم البحث للوصول لباقي الموظفين.</T>:null}
    {!shownAdmins.length?<T size={11} color={C.muted}>لا يوجد موظف مطابق.</T>:null}
   </View>:null}
   <T size={10} color={C.muted}>اختار الحساب المستخدم في الموديول. عند غياب دليل الموظفين هنعتمد على الاسم المثبت في ردود WHMCS فقط، مع حفظ الاختيار على جهازك.</T>
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
   {scanning?<Action compact secondary icon="stop-circle-outline" label="إيقاف الفحص بعد الطلب الحالي"
    onPress={()=>{stopScan.current=true;}}/>:null}
   {selectedAdmin&&checked<rows.length?<Action compact secondary icon="magnify" disabled={loading||scanning||discovering}
    label="فحص الدفعة التالية (حتى 6)" onPress={()=>void scan()}/>:null}
   {selectedAdmin&&checked<rows.length?<Action compact secondary icon="magnify-scan" disabled={loading||scanning}
    label="فحص كل التذاكر المحمّلة تلقائيًا" onPress={()=>void scan(true)}/>:null}
   {usingReplies&&discoveredCount>=rows.length&&rows.length>0&&total!==null&&offset<total?
    <Action compact secondary icon="plus" label="تحميل تذاكر أكثر لاكتشاف موظفين آخرين"
     disabled={loading||scanning||discovering} onPress={()=>void load(offset)}/>:null}
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
