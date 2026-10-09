import React,{useCallback,useEffect,useRef,useState} from 'react';
import {ActivityIndicator,Alert,AppState,BackHandler,Modal,Pressable,RefreshControl,ScrollView,StatusBar,View} from 'react-native';
import {C} from './src/theme';
import {SafeAreaProvider,SafeAreaView} from 'react-native-safe-area-context';
import {UpdateGate} from './src/components/UpdateGate';
import type {DemoState,Page,Session} from './src/types';
import {seed} from './src/data/demo';
import {connect as connectApi,loadSession,loadOverview,loadPage,getTicketThread,replyToTicket,signOut} from './src/lib/api';
import {Action,Card,Icon,T} from './src/components/UI';
import {Connect} from './src/screens/Connect';
import {Home} from './src/screens/Home';
import {Tickets} from './src/screens/Tickets';
import {Directory} from './src/screens/Directory';
import {WhatsApp} from './src/screens/WhatsApp';
import {AiOps} from './src/screens/AiOps';
import {Settings} from './src/screens/Settings';
import {Explorer} from './src/screens/Explorer';
const empty:DemoState={tickets:[],clients:[],invoices:[],services:[],orders:[],domains:[],chats:[],agents:[],queue:[]};
const nav:{page:Page,label:string,icon:string}[]=[
 {page:'home',label:'الرئيسية',icon:'view-dashboard-outline'},
 {page:'tickets',label:'التذاكر',icon:'ticket-outline'},
 {page:'whatsapp',label:'واتساب',icon:'whatsapp'},
 {page:'ai',label:'AI',icon:'robot-outline'},
 {page:'more',label:'المزيد',icon:'dots-grid'}
];
const menu:{page:Page,label:string,icon:string}[]=[
 {page:'clients',label:'العملاء',icon:'account-multiple-outline'},
 {page:'invoices',label:'الفواتير',icon:'receipt-text-outline'},
 {page:'services',label:'الخدمات',icon:'server-network'},
 {page:'orders',label:'الطلبات',icon:'cart-outline'},
 {page:'domains',label:'الدومينات',icon:'web'},
 {page:'explorer',label:'دليل WHMCS الكامل',icon:'view-grid-outline'},
 {page:'settings',label:'الإعدادات',icon:'cog-outline'}
];
function CommandApp(){
 const [initializing,setInitializing]=useState(true),[session,setSession]=useState<Session|null>(null),[demo,setDemo]=useState(false);
 const [data,setData]=useState<DemoState>(empty),[page,setPage]=useState<Page>('home'),[loading,setLoading]=useState(false);
 const [error,setError]=useState(''),[errors,setErrors]=useState<Record<string,string>>({}),[caps,setCaps]=useState<Record<string,boolean>>({}),[totals,setTotals]=useState<Record<string,number|null>>({}),[moreBusy,setMoreBusy]=useState(false),[lastSync,setLastSync]=useState(''),[history,setHistory]=useState<Page[]>([]),[detail,setDetail]=useState<{title:string,lines:[string,string][]}|null>(null);
 const refresh=useCallback(async(s:Session)=>{
   setLoading(true);
   try{
    const result=await loadOverview(s);
    setData(result.state);setCaps(result.capabilities);setErrors(result.errors);setTotals(result.totals);setLastSync(new Date().toLocaleTimeString('ar-EG'));setError('');
   }catch(e){setError(e instanceof Error?e.message:'خطأ غير متوقع أثناء القراءة');}
   finally{setLoading(false);}
 },[]);
 useEffect(()=>{let active=true;loadSession().then(s=>{if(!active)return;setSession(s);setInitializing(false);if(s)void refresh(s);}).catch(()=>setInitializing(false));return()=>{active=false;};},[refresh]);
 useEffect(()=>{if(!session||demo)return;const listener=AppState.addEventListener('change',s=>{if(s==='active')void refresh(session);});return()=>listener.remove();},[session,demo,refresh]);
 const navigate=(p:Page)=>{if(p!==page){setHistory(h=>[...h,page].slice(-20));setPage(p);}setDetail(null);};
 const backRef=useRef<()=>boolean>(()=>false);
 backRef.current=()=>{
  if(detail){setDetail(null);return true;}
  if(page!=='home'){setPage(history[history.length-1]??'home');setHistory(h=>h.slice(0,-1));return true;}
  Alert.alert('تأكيد الخروج','هل تريد إغلاق WHMCS؟',[{text:'إلغاء',style:'cancel'},{text:'خروج',style:'destructive',onPress:()=>BackHandler.exitApp()}]);
  return true;
 };
 useEffect(()=>{const sub=BackHandler.addEventListener('hardwareBackPress',()=>backRef.current());return()=>sub.remove();},[]);
 const loadMore=async(key:'tickets'|'clients'|'invoices'|'services'|'orders'|'domains')=>{
  if(!session||moreBusy||!caps[key+'.read'])return;
  const offset=data[key].length;setMoreBusy(true);
  try{const pageResult=await loadPage(session,key,offset,50);
   if(!pageResult.ok){Alert.alert('تعذر تحميل المزيد',pageResult.error||'فشل القراءة');return;}
   setData(prev=>({...prev,[key]:[...prev[key],...pageResult.records.filter((r:any)=>!prev[key].some((x:any)=>x.id===r.id))]}));
   setTotals(prev=>({...prev,[key]:pageResult.total}));
  }finally{setMoreBusy(false);}
 };
 const connect=async(config:Session)=>{
   const result=await connectApi(config);
   if(!result.ok||!result.data){Alert.alert('WHMCS رفض الاتصال',result.error||'تحقق من بيانات API والصلاحيات');return;}
   setSession(result.data);setDemo(false);setHistory([]);setPage('home');await refresh(result.data);
 };
 const logout=async()=>{await signOut();setDemo(false);setSession(null);setData(empty);setCaps({});setErrors({});setTotals({});setHistory([]);setError('');setPage('home');};
 const reply=async(id:number,text:string)=>{
  if(demo){setData(d=>({...d,tickets:d.tickets.map(t=>t.id===id?{...t,status:'Answered',message:text}:t)}));Alert.alert('وضع تجريبي','تم تعديل البيانات المحلية فقط.');return true;}
  if(!session||!caps['tickets.read'])return false;
  const r=await replyToTicket(session,id,text);
  if(!r.ok){Alert.alert('تعذر إرسال الرد',r.error||'حدث خطأ');return false;}
  await refresh(session);Alert.alert('تم الإرسال','تم تسجيل الرد بنجاح في WHMCS.');return true;
 };
 const openTicket=async(id:number)=>{
  if(demo){const t=data.tickets.find(t=>t.id===id);return t?[{id:'sample',message:t.message||'',name:t.customer,date:t.updated,admin:false}]:[];}
  if(!session)return null;
  const r=await getTicketThread(session,id);
  if(!r.ok||!r.data){Alert.alert('تعذر قراءة التذكرة',r.error||'فشل الاتصال');return null;}
  const ticket=r.data as any;
  const replies=ticket.replies?.reply||[];
  const arr=Array.isArray(replies)?replies:(replies?[replies]:[]);
  const initial={id:`initial-${id}`,message:String(ticket.message||''),name:String(ticket.name||ticket.email||''),date:String(ticket.date||''),admin:false};
  return [initial,...arr.map((m:any,i:number)=>({id:String(m.id||i),message:String(m.message||''),name:String(m.name||m.admin||''),date:String(m.date||''),admin:!!m.admin}))].filter(x=>x.message);
 };
 const sendWhatsApp=async(id:string,text:string)=>{
   if(demo){setData(d=>({...d,chats:d.chats.map(c=>c.id===id?{...c,last:text,messages:[...c.messages,{id:`local-${Date.now()}`,from:'agent',body:text,at:'الآن'}]}:c)}));Alert.alert('تجريبي','لم تُرسل أي رسالة حقيقية');return true;}
   Alert.alert('غير متاح','لا يوجد API موثق لموديول الواتساب في الكود المتاح؛ لن نرسل إلى مسار مفترض.');return false;
 };
 if(initializing)return <View style={{flex:1,backgroundColor:C.bg,justifyContent:'center',alignItems:'center'}}><ActivityIndicator color={C.red} size="large"/></View>;
 if(!session&&!demo)return <Connect onPair={connect} onDemo={()=>{setDemo(true);setData(JSON.parse(JSON.stringify(seed)));setCaps({'tickets.read':true,'tickets.reply':true,'whatsapp.read':true,'whatsapp.send':true,'ai.read':true});setPage('home');}}/>;
 const body=()=>{
  if(page==='home')return <Home data={data} demo={demo} navigate={navigate} capabilities={caps} totals={totals}/>;
  if(page==='tickets')return <Tickets tickets={data.tickets} onReply={reply} onOpen={openTicket} demo={demo} canReply={demo||!!caps['tickets.read']} total={totals.tickets} onLoadMore={()=>loadMore('tickets')} moreBusy={moreBusy} error={errors.tickets}/>;
  if(page==='whatsapp')return <WhatsApp chats={data.chats} demo={demo} enabled={!!caps['whatsapp.read']} canSend={demo||!!caps['whatsapp.send']} onSend={sendWhatsApp}/>;
  if(page==='ai')return <AiOps agents={data.agents} queue={data.queue} connected={!!caps['ai.read']} demo={demo}/>;
  if(page==='more')return <View><T size={26} weight="900">كل الأقسام</T><T color={C.muted} style={{marginBottom:20}}>إدارة WHMCS والموديولات من مكان واحد</T><View style={{flexDirection:'row-reverse',flexWrap:'wrap',gap:12}}>{menu.map(m=><Pressable key={m.page} onPress={()=>navigate(m.page)} style={{width:'47%',padding:17,backgroundColor:C.surface,borderWidth:1,borderColor:C.stroke,borderRadius:18,gap:10}}><Icon name={m.icon} size={25} color={C.red}/><T weight="800" size={15}>{m.label}</T><Icon name="arrow-left" size={17} color={C.muted}/></Pressable>)}</View></View>;
  if(page==='settings')return <Settings session={session} demo={demo} onLogout={logout} capabilities={caps} errors={errors}/>;
  if(page==='explorer')return demo?<View><T color={C.orange}>دليل API يحتاج ربط WHMCS حقيقي (غير متاح في الديمو).</T></View>:session?<Explorer session={session} onDetails={(title,lines)=>setDetail({title,lines})}/>:null;
  return <Directory page={page} data={data} onDetails={(title,lines)=>setDetail({title,lines})} total={totals[page]} error={errors[page]} loading={moreBusy} onLoadMore={()=>loadMore(page as 'clients'|'invoices'|'services'|'orders'|'domains')}/>;
 };
 const currentTab=nav.some(n=>n.page===page)?page:'more';
 return <View style={{flex:1,backgroundColor:C.bg}}><StatusBar barStyle="light-content" translucent={false} backgroundColor={C.bg}/>
  <View style={{flexDirection:'row-reverse',paddingHorizontal:19,paddingTop:10,paddingBottom:9,justifyContent:'space-between',alignItems:'center',borderBottomWidth:1,borderBottomColor:C.stroke}}><T weight="900" size={12} color={C.red}>WHMCS</T><View style={{flexDirection:'row-reverse',gap:8,alignItems:'center'}}><Icon name={demo?'flask-outline':'shield-check'} color={demo?C.orange:C.green} size={16}/><T size={10} color={C.muted}>{demo?'DEMO':lastSync?`API • ${lastSync}`:'WHMCS API'}</T></View></View>
  {Object.keys(errors).length>0&&!demo?<Pressable style={{backgroundColor:'#483820',padding:9}} onPress={()=>navigate('settings')}><T color={C.orange} size={11}>بعض الأقسام غير متاحة لصلاحيات API الحالية — التفاصيل في الإعدادات</T></Pressable>:null}
  {error?<Pressable style={{backgroundColor:'#47212A',padding:11}} onPress={()=>session&&refresh(session)}><T color={C.orange} size={12}>تعذر التحديث: {error} — اضغط لإعادة المحاولة</T></Pressable>:null}
  <ScrollView key={page} contentContainerStyle={{padding:18,paddingBottom:35}} refreshControl={<RefreshControl refreshing={loading} tintColor={C.red} onRefresh={()=>session?void refresh(session):undefined}/>} keyboardShouldPersistTaps="handled">{body()}</ScrollView>
  <View style={{flexDirection:'row-reverse',borderTopWidth:1,borderTopColor:C.stroke,backgroundColor:C.surface,paddingVertical:9,paddingHorizontal:8}}>{nav.map(item=><Pressable key={item.page} onPress={()=>navigate(item.page)} style={{flex:1,alignItems:'center',paddingVertical:5,gap:4}}><Icon name={item.icon} size={22} color={currentTab===item.page?C.red:C.muted}/><T size={10} color={currentTab===item.page?C.red:C.muted} weight={currentTab===item.page?'800':'400'}>{item.label}</T></Pressable>)}</View>
  <Modal visible={!!detail} transparent animationType="slide" onRequestClose={()=>setDetail(null)}><View style={{flex:1,justifyContent:'flex-end',backgroundColor:'#000A'}}><View style={{backgroundColor:C.surface,borderTopLeftRadius:24,borderTopRightRadius:24,padding:22,maxHeight:'82%'}}><T weight="900" size={21}>{detail?.title||''}</T><T color={C.muted} style={{marginBottom:14}}>تفاصيل السجل — للقراءة فقط</T><ScrollView>{(detail?.lines||[]).map(([k,v],i)=><View key={`${k}-${i}`} style={{paddingVertical:10,borderBottomWidth:1,borderBottomColor:C.stroke}}><T size={11} color={C.muted}>{k}</T><T weight="600">{v}</T></View>)}</ScrollView><View style={{marginTop:16}}><Action label="إغلاق" secondary onPress={()=>setDetail(null)}/></View></View></View></Modal>
 </View>;
}

export default function App(){return <SafeAreaProvider><SafeAreaView edges={['top','bottom']} style={{flex:1,backgroundColor:C.bg}}><CommandApp/><UpdateGate/></SafeAreaView></SafeAreaProvider>;}
