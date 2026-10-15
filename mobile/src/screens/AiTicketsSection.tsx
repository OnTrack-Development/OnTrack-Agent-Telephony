import React,{useEffect,useRef,useState} from 'react';
import {ActivityIndicator,Pressable,View} from 'react-native';
import * as SecureStore from 'expo-secure-store';
import {md5} from 'js-md5';
import type {Session,Ticket} from '../types';
import {C} from '../theme';
import {getApiRetryAfterMs} from '../lib/api';
import {AiAdminUser,AiReviewedTicket,checkActiveAiTicket,fetchObservedResponders} from '../lib/aiTicketReview';
import {fetchTicketQueue} from '../lib/tickets';
import {Action,Card,Icon,Pill,T} from '../components/UI';

const PER_PAGE=30,DISCOVER=5;
const keyFor=(s:Session)=>'whmcs-ai-admin-id-'+md5(s.baseUrl+'|'+(s.mode==='admin'?s.username:s.identifier));
const matchKey=(u:AiAdminUser)=>u.id>0?'id:'+u.id:'reply:'+u.fullName.toLocaleLowerCase('en-US').trim();
const remembered=(key:string):AiAdminUser|null=>{
 if(key.startsWith('reply:')&&key.slice(6).trim()){
  const raw=key.slice(6).trim();
  const name=raw.toLowerCase()==='ai_agent'?'Ai_Agent':raw;
  return {id:0,username:name,fullName:name,source:'reply',disabled:false,ambiguousFullName:false};
 }
 if(/^id:[1-9]\d*$/.test(key)){
  const id=Number(key.slice(3));
  if(Number.isSafeInteger(id))return {id,username:'',fullName:'موظف #'+id,
   source:'directory',disabled:false,ambiguousFullName:false};
 }
 return null;
};
const textOnly=(s:string)=>s.replace(/<[^>]*>/g,' ').replace(/\s+/g,' ').trim();

export function AiTicketsSection({session,demo,onOpen}:{
 session:Session|null;demo:boolean;onOpen:(ticket:Ticket)=>void;
}){
 const [ready,setReady]=useState(false),[account,setAccount]=useState<AiAdminUser|null>(null);
 const [rows,setRows]=useState<Ticket[]>([]),[confirmed,setConfirmed]=useState<AiReviewedTicket[]>([]);
 const [total,setTotal]=useState<number|null>(null),[offset,setOffset]=useState(0),[verified,setVerified]=useState(0);
 const [busy,setBusy]=useState(false),[error,setError]=useState('');
 const [chooser,setChooser]=useState(false),[finding,setFinding]=useState(false);
 const [candidates,setCandidates]=useState<AiAdminUser[]>([]);
 const run=useRef(0),[request,setRequest]=useState({start:0,serial:0});
 useEffect(()=>{
  let active=true;setReady(false);setAccount(null);
  if(session){
   void SecureStore.getItemAsync(keyFor(session)).then(value=>{
    if(active)setAccount(value?remembered(value):null);
   }).catch(()=>{}).finally(()=>{if(active)setReady(true);});
  }else setReady(true);
  return()=>{active=false;run.current++;};
 },[session]);
 useEffect(()=>{
  if(!ready||!session||demo)return;
  const generation=++run.current;
  if(request.start===0){setRows([]);setConfirmed([]);setVerified(0);setTotal(null);setOffset(0);}
  setBusy(true);setError('');
  void (async()=>{
   try{
    const page=await fetchTicketQueue(session,'allActive',request.start,PER_PAGE);
    if(generation!==run.current)return;
    if(!page.ok){setError(page.error||'تعذرت قراءة التذاكر النشطة');return;}
    setTotal(page.total);
    const fresh=page.tickets.filter(t=>!rows.some(previous=>previous.id===t.id));
    setRows(previous=>request.start===0?fresh:[...previous,...fresh]);
    setOffset(request.start+PER_PAGE);
    if(!account)return;
    // WHMCS GetTickets cannot filter by replying admin. Confirm each GetTicket
    // sequentially using the shared API rate limiter; show results as they arrive.
    for(const ticket of fresh){
     if(run.current!==generation)return;
     if(getApiRetryAfterMs()>0){
      setError('الـAPI طلب الانتظار. اضغط تحديث بعد انتهاء مهلة WHMCS.');return;
     }
     const response=await checkActiveAiTicket(session,ticket,account);
     if(run.current!==generation)return;
     if(response.kind==='error'){
      if(response.rateLimited){setError('WHMCS حدّد معدل الطلبات؛ أعد المحاولة بعد المهلة.');return;}
      setError('تعذر التحقق من بعض التذاكر؛ العدد المعروض جزئي.');
     }else if(response.kind==='match'){
      setConfirmed(old=>old.some(x=>x.ticket.id===ticket.id)?old:[...old,response.review]);
     }
     setVerified(x=>x+1);
    }
   }catch(e){
    if(generation===run.current)setError(e instanceof Error?e.message:'تعذر فحص التذاكر');
   }finally{
    if(generation===run.current)setBusy(false);
   }
  })();
  return()=>{run.current++;};
 },[session,demo,ready,account?.id,account?.fullName,request.serial]);
 const discover=async()=>{
  if(!session||busy||finding||!rows.length)return;
  setChooser(true);setFinding(true);setError('');
  try{
   const seen=new Map<string,AiAdminUser>();
   for(const ticket of rows.slice(0,DISCOVER)){
    if(getApiRetryAfterMs()>0){setError('حماية WHMCS API نشطة؛ أعد المحاولة لاحقًا.');break;}
    const result=await fetchObservedResponders(session,ticket);
    if(result.rateLimited){setError('وصلنا لحد طلبات WHMCS؛ أعد البحث لاحقًا.');break;}
    for(const user of result.users)seen.set(matchKey(user),user);
   }
   setCandidates([...seen.values()].sort((a,b)=>a.fullName.localeCompare(b.fullName,'ar')));
  }catch(e){setError(e instanceof Error?e.message:'تعذر العثور على أسماء الموظفين');}
  finally{setFinding(false);}
 };
 useEffect(()=>{
  // First-run fallback: no guessed account, discover genuine reply authors instead.
  if(ready&&!account&&rows.length&&!busy&&!chooser&&!finding)void discover();
 },[ready,account,rows.length,busy]);
 const choose=(user:AiAdminUser)=>{
  setAccount(user);setChooser(false);setCandidates([]);
  if(session)void SecureStore.setItemAsync(keyFor(session),matchKey(user),{
   keychainAccessible:SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY
  }).catch(()=>{});
  setRequest(p=>({start:0,serial:p.serial+1}));
 };
 const update=()=>setRequest(p=>({start:0,serial:p.serial+1}));
 const next=()=>setRequest(p=>({start:offset,serial:p.serial+1}));
 if(!session||demo)return null;
 return <View style={{marginTop:19,gap:8}}>
  <View style={{flexDirection:'row-reverse',alignItems:'center',justifyContent:'space-between',gap:8}}>
   <View style={{flexDirection:'row-reverse',alignItems:'center',gap:7,flex:1}}>
    <Icon name="robot-outline" size={20} color={C.purple}/>
    <T size={16} weight="900">تذاكر آخر رد من الـAI</T>
   </View>
   <Pill color={C.purple} label={String(confirmed.length)+' تذكرة'}/>
  </View>
  <Card style={{gap:9,padding:12}}>
   <View style={{flexDirection:'row-reverse',alignItems:'center',justifyContent:'space-between',gap:8}}>
    <T size={11} color={C.muted} lines={1}>
     {account?'الحساب: '+account.fullName:'اختر حساب الرد الآلي'}
    </T>
    <Pressable accessibilityRole="button" onPress={()=>void discover()}
     disabled={busy||finding} style={{paddingVertical:5,paddingHorizontal:7}}>
     <T color={C.purple} size={11} weight="800">تغيير</T>
    </Pressable>
   </View>
   {chooser?<View style={{gap:5}}>
    {finding?<ActivityIndicator color={C.purple}/>:null}
    {candidates.map(user=><Pressable key={matchKey(user)} onPress={()=>choose(user)}
     accessibilityRole="button" style={{paddingVertical:9,paddingHorizontal:10,
      borderRadius:9,backgroundColor:C.surface2}}>
     <T weight="800" size={12}>{user.fullName}</T>
    </Pressable>)}
    {!finding&&!candidates.length?<T color={C.muted} size={11}>
     لا توجد أسماء موظفين مؤكدة في التذاكر المفحوصة حتى الآن.
    </T>:null}
   </View>:null}
   <T color={C.muted} size={10}>
    {busy?'جارٍ التحقق من آخر رد لكل تذكرة… ':''}
    تم فحص {verified} من {rows.length} تذاكر محمّلة
    {total!==null?' • الإجمالي النشط '+total:''}
   </T>
   {busy?<ActivityIndicator size="small" color={C.purple}/>:null}
   {error?<T color={C.orange} size={11}>{error}</T>:null}
   {confirmed.map(item=><Pressable key={item.ticket.id} accessibilityRole="button"
    onPress={()=>onOpen(item.ticket)} style={({pressed})=>({flexDirection:'row-reverse',gap:9,
     paddingVertical:9,borderTopWidth:1,borderTopColor:C.stroke,opacity:pressed?.7:1})}>
    <Icon name="ticket-outline" size={20} color={C.purple}/>
    <View style={{flex:1,gap:3}}>
     <T size={12} weight="800" lines={1}>{item.ticket.subject}</T>
     <T size={10} color={C.muted} lines={1}>#{item.ticket.number} • {item.ticket.customer} • {item.ticket.status}</T>
     <T size={10} color={C.muted} lines={2}>{textOnly(item.message)}</T>
     {item.transferMentioned?<T size={10} color={C.orange}>ذُكر تحويل لموظف — يُرجى مراجعة التنفيذ</T>:null}
    </View>
    <Icon name="chevron-left" size={16} color={C.muted}/>
   </Pressable>)}
   {!busy&&account&&!confirmed.length?<T size={11} color={C.muted}>
    لا توجد تذاكر مطابقة في الجزء الذي اكتمل فحصه.
   </T>:null}
   {total!==null&&offset<total&&!busy?<Action compact secondary
    label="فحص تذاكر أقدم" icon="chevron-down" onPress={next}/>:null}
   <Action compact secondary icon="refresh" label="تحديث تذاكر الـAI"
    disabled={busy||finding} onPress={update}/>
   <T size={10} color={C.muted}>يُستبعد المقفول والمسند لموظف آخر. التحويل إلى قسم بشري مشترك دون إسناد يحتاج حالة تحويل موثوقة من الموديول للتحقق منه.</T>
  </Card>
 </View>;
}
