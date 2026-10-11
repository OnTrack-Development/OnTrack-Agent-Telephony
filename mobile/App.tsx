import React,{useCallback,useEffect,useRef,useState} from 'react';
import {ActivityIndicator,Alert,AppState,BackHandler,Keyboard,KeyboardAvoidingView,Modal,Platform,Pressable,RefreshControl,ScrollView,StatusBar,TextInput,View} from 'react-native';
import {C} from './src/theme';
import {SafeAreaProvider,SafeAreaView,useSafeAreaInsets} from 'react-native-safe-area-context';
import {UpdateGate} from './src/components/UpdateGate';
import * as SplashScreen from 'expo-splash-screen';
void SplashScreen.preventAutoHideAsync().catch(()=>{});
import type {DemoState,Page,Session} from './src/types';
import {seed} from './src/data/demo';
import {connect as connectApi,loadSession,loadOverview,loadPage,getTicketThread,replyToTicket,signOut,getApiRetryAfterMs} from './src/lib/api';
import type {SectionKey} from './src/lib/api';
import {Action,Card,Icon,T} from './src/components/UI';
import {Connect} from './src/screens/Connect';
import {Home} from './src/screens/Home';
import {Tickets} from './src/screens/Tickets';
import {Directory} from './src/screens/Directory';
import {WhatsApp} from './src/screens/WhatsApp';
import {AiOps} from './src/screens/AiOps';
import {Settings} from './src/screens/Settings';
import {Explorer} from './src/screens/Explorer';
import {resetAdminSessions,adminSessionReady} from './src/lib/adminSession';
import * as Notifications from 'expo-notifications';
import {enableDeviceNotifications,ingestNotificationSnapshot,whmcsSectionNotifications,whatsAppNotifications} from './src/lib/notifications';
import {listConversations,getWhatsAppRetryAfterMs} from './src/lib/whatsapp';
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
 const insets=useSafeAreaInsets();
 const pageScroll=useRef<ScrollView>(null);
 const [keyboardVisible,setKeyboardVisible]=useState(false),[ticketDetailOpen,setTicketDetailOpen]=useState(false);

 const composerFocused=useRef(false);
 const focusedText=useRef<any>(null),scrollOffset=useRef(0);
 const keyboardY=useRef<number|null>(null);
 const [keyboardPadding,setKeyboardPadding]=useState(0);
 // On edge-to-edge Android, adjustResize alone may leave inputs under the IME.
 const revealFocusedInput=()=>{
  if(!composerFocused.current||keyboardY.current===null)return;
  const input=focusedText.current||(TextInput as any).State?.currentlyFocusedInput?.();
  if(!input?.measureInWindow)return;
  input.measureInWindow((_x:number,y:number,_w:number,h:number)=>{
   if(!composerFocused.current||keyboardY.current===null)return;
   const overlap=y+h-(keyboardY.current-26);
   if(overlap>0)pageScroll.current?.scrollTo({y:Math.max(0,scrollOffset.current+overlap),animated:true});
  });
 };
 const revealComposer=()=>{
  composerFocused.current=true;
  focusedText.current=(TextInput as any).State?.currentlyFocusedInput?.()||null;
  for(const ms of [70,230,460,740])setTimeout(revealFocusedInput,ms);
 };
 useEffect(()=>{
  const shown=Keyboard.addListener('keyboardDidShow',event=>{
   keyboardY.current=event.endCoordinates.screenY;
   setKeyboardPadding(Math.max(200,event.endCoordinates.height+75));setKeyboardVisible(true);
   if(composerFocused.current)for(const ms of [70,220,450])setTimeout(revealFocusedInput,ms);
  });
  const hidden=Keyboard.addListener('keyboardDidHide',()=>{
   keyboardY.current=null;setKeyboardPadding(0);setKeyboardVisible(false);
   composerFocused.current=false;focusedText.current=null;
  });
  return()=>{shown.remove();hidden.remove();};
 },[]);
 const [initializing,setInitializing]=useState(true),[session,setSession]=useState<Session|null>(null),[demo,setDemo]=useState(false);
 const [data,setData]=useState<DemoState>(empty),[page,setPage]=useState<Page>('home'),[loading,setLoading]=useState(false);
 const [ticketReload,setTicketReload]=useState(0);
 const pageRef=useRef<Page>('home');pageRef.current=page;
 const [error,setError]=useState(''),[errors,setErrors]=useState<Record<string,string>>({}),[caps,setCaps]=useState<Record<string,boolean>>({}),[totals,setTotals]=useState<Record<string,number|null>>({}),[moreBusy,setMoreBusy]=useState(false),[lastSync,setLastSync]=useState(''),[history,setHistory]=useState<Page[]>([]),[detail,setDetail]=useState<{title:string,lines:[string,string][]}|null>(null);
 const refreshInFlight=useRef(false),lastRefreshAt=useRef<Record<string,number>>({}),retryTimer=useRef<ReturnType<typeof setTimeout>|null>(null),generation=useRef(0);
 const refresh=useCallback(async(s:Session,force=false,section?:SectionKey)=>{
  const current=pageRef.current;
  const wanted=section||(current==='home'?'tickets':(['clients','invoices','services','orders','domains'].includes(current)?current as SectionKey:undefined));
  if(!wanted)return;
  if(refreshInFlight.current){
   if(!retryTimer.current)retryTimer.current=setTimeout(()=>{retryTimer.current=null;void refresh(s,true,wanted);},6000);
   return;
  }
  if(!force&&Date.now()-(lastRefreshAt.current[wanted]||0)<120000)return;
  if(getApiRetryAfterMs()>0){
   if(!retryTimer.current)retryTimer.current=setTimeout(()=>{retryTimer.current=null;void refresh(s,true,wanted);},getApiRetryAfterMs()+3500);
   return;
  }
  refreshInFlight.current=true;lastRefreshAt.current[wanted]=Date.now();
  const snapshot=generation.current;
  setLoading(true);
  try{
   const result=await loadOverview(s,[wanted]);
   if(generation.current!==snapshot)return;
   // Keep last successful data during temporary network/429 errors.
   setData(prev=>{
    const next={...prev};
    for(const key of ['tickets','clients','invoices','services','orders','domains'] as const)
     if(result.capabilities[key+'.read'])(next as any)[key]=(result.state as any)[key];
    return next;
   });
   setCaps(prev=>{
    const next={...prev,...result.capabilities};
    for(const key of Object.keys(result.errors))
     if(/429|اتصال|network|timeout/i.test(result.errors[key]||''))next[key+'.read']=prev[key+'.read']||false;
    return next;
   });
   setErrors(prev=>{const next={...prev};delete next[wanted];return {...next,...result.errors};});
   setTotals(prev=>({...prev,...Object.fromEntries(Object.entries(result.totals).filter(([key])=>result.capabilities[key+'.read']))}));
   setLastSync(new Date().toLocaleTimeString('ar-EG'));setError('');
   if(result.capabilities[wanted+'.read']){
    const rows=(result.state as any)[wanted]||[];
    void ingestNotificationSnapshot(s,wanted,whmcsSectionNotifications(wanted,rows));
   }
   if(Object.values(result.errors).some(e=>/429|اتصال|network|timeout/i.test(e))){
    if(retryTimer.current)clearTimeout(retryTimer.current);
    retryTimer.current=setTimeout(()=>{retryTimer.current=null;void refresh(s,true,wanted);},Math.max(60000,getApiRetryAfterMs()+4000));
   }
  }catch(e){
   if(generation.current!==snapshot)return;
   setError(e instanceof Error?e.message:'تعذر الاتصال مؤقتًا');
   if(retryTimer.current)clearTimeout(retryTimer.current);
   retryTimer.current=setTimeout(()=>{retryTimer.current=null;void refresh(s,true,wanted);},Math.max(60000,getApiRetryAfterMs()+4000));
  }finally{refreshInFlight.current=false;setLoading(false);}
 },[]);
 useEffect(()=>()=>{generation.current++;if(retryTimer.current)clearTimeout(retryTimer.current);},[]);
 useEffect(()=>{let active=true;loadSession().then(s=>{if(!active)return;setSession(s);setInitializing(false);if(s)void refresh(s);}).catch(()=>setInitializing(false));return()=>{active=false;};},[refresh]);
 useEffect(()=>{if(!initializing)void SplashScreen.hideAsync().catch(()=>{});},[initializing]);
 useEffect(()=>{if(!session||demo)return;const listener=AppState.addEventListener('change',s=>{if(s==='active')void refresh(session);});return()=>listener.remove();},[session,demo,refresh]);
 useEffect(()=>{
  if(!session||demo)return;
  let disposed=false;
  void enableDeviceNotifications().catch(()=>{});
  const sections:SectionKey[]=['tickets','invoices','orders','services','domains'];
  let index=0,busy=false;
  // One WHMCS read every 100 s, rotating sections, to avoid concurrent polling / HTTP 429.
  const tick=async()=>{
   if(disposed||busy||AppState.currentState!=='active'||getApiRetryAfterMs()>0)return;
   busy=true;
   const section=sections[index++%sections.length]!;
   try{
    const result=await loadPage(session,section,0,30);
    if(result.ok&&!disposed)
     await ingestNotificationSnapshot(session,section,whmcsSectionNotifications(section,result.records));
   }catch{}finally{busy=false;}
  };
  const timer=setInterval(()=>void tick(),100000);
  const foreground=AppState.addEventListener('change',state=>{
   if(state==='active')void tick();
  });
  return()=>{disposed=true;clearInterval(timer);foreground.remove();};
 },[session,demo]);
 useEffect(()=>{
  if(!session||demo)return;
  let destroyed=false,reading=false;
  const poll=async()=>{
   if(destroyed||reading||AppState.currentState!=='active'
      ||!adminSessionReady(session)||getWhatsAppRetryAfterMs(session)>0)return;
   reading=true;
   try{
    const r=await listConversations(session);
    if(!destroyed)await ingestNotificationSnapshot(session,'whatsapp',whatsAppNotifications(r.conversations));
   }catch{}finally{reading=false;}
  };
  const timer=setInterval(()=>void poll(),120000);
  return()=>{destroyed=true;clearInterval(timer);};
 },[session,demo]);
 useEffect(()=>{
  if(!session||demo)return;
  if(['clients','invoices','services','orders','domains'].includes(page))
   void refresh(session,false,page as SectionKey);
 },[session,page,demo,refresh]);
 const navigate=(p:Page)=>{if(p!==page){setHistory(h=>[...h,page].slice(-20));setPage(p);}setDetail(null);};
 useEffect(()=>{
  const sub=Notifications.addNotificationResponseReceivedListener(response=>{
   const target=response.notification.request.content.data?.section;
   const pageName=target==='whatsapp'||target==='tickets'||target==='invoices'||target==='orders'
    ||target==='services'||target==='domains'?target:null;
   if(pageName)navigate(pageName);
  });
  return()=>sub.remove();
 },[page]);
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
 const connect=async(config:Session)=>{generation.current++;if(retryTimer.current)clearTimeout(retryTimer.current);retryTimer.current=null;
   const result=await connectApi(config);
   if(!result.ok||!result.data){Alert.alert('WHMCS رفض الاتصال',result.error||'تحقق من بيانات API والصلاحيات');return;}
   lastRefreshAt.current={};setSession(result.data);setDemo(false);setHistory([]);setPage('home');await refresh(result.data,true,'tickets');
 };
 const logout=async()=>{generation.current++;if(retryTimer.current)clearTimeout(retryTimer.current);retryTimer.current=null;await resetAdminSessions();await signOut();setDemo(false);setSession(null);setData(empty);setCaps({});setErrors({});setTotals({});setHistory([]);setError('');setPage('home');};
 const reply=async(id:number,text:string,identity?:{clientId:number;contactId:number;name:string;email:string})=>{
  if(demo){setData(d=>({...d,tickets:d.tickets.map(t=>t.id===id?{...t,status:'Answered',message:text}:t)}));Alert.alert('وضع تجريبي','تم تعديل البيانات المحلية فقط.');return true;}
  if(!session)return false; // WHMCS enforces actual reply permission; list/read failures aren't reply denials.
  const r=await replyToTicket(session,id,text,identity);
  if(!r.ok){Alert.alert('تعذر إرسال الرد',r.error||'حدث خطأ');return false;}
  setTimeout(()=>void refresh(session,true),3500);Alert.alert('تم الإرسال','تم تسجيل الرد بنجاح في WHMCS.');return true;
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
 if(initializing)return <View style={{flex:1,backgroundColor:C.bg,justifyContent:'center',alignItems:'center'}}><ActivityIndicator color={C.red} size="large"/></View>;
 if(!session&&!demo)return <Connect onPair={connect} onDemo={()=>{setDemo(true);setData(JSON.parse(JSON.stringify(seed)));setCaps({'tickets.read':true,'tickets.reply':true,'whatsapp.read':true,'whatsapp.send':true,'ai.read':true});setPage('home');}}/>;
 const body=()=>{
  if(page==='home')return <Home data={data} demo={demo} navigate={navigate} capabilities={caps} totals={totals}/>;
  if(page==='tickets')return <Tickets session={session} tickets={data.tickets} reloadSignal={ticketReload} onReply={reply} demo={demo} onComposerFocus={revealComposer} onDetailChange={setTicketDetailOpen}/>;
  if(page==='whatsapp')return <WhatsApp session={session} demo={demo} onComposerFocus={revealComposer} onDetailChange={setTicketDetailOpen}/>;
  if(page==='ai')return <AiOps agents={data.agents} queue={data.queue} session={session} demo={demo}/>;
  if(page==='more')return <View><T size={26} weight="900">كل الأقسام</T><T color={C.muted} style={{marginBottom:20}}>إدارة WHMCS والموديولات من مكان واحد</T><View style={{flexDirection:'row-reverse',flexWrap:'wrap',gap:12}}>{menu.map(m=><Pressable key={m.page} onPress={()=>navigate(m.page)} style={{width:'47%',padding:17,backgroundColor:C.surface,borderWidth:1,borderColor:C.stroke,borderRadius:18,gap:10}}><Icon name={m.icon} size={25} color={C.red}/><T weight="800" size={15}>{m.label}</T><Icon name="arrow-left" size={17} color={C.muted}/></Pressable>)}</View></View>;
  if(page==='settings')return <Settings session={session} demo={demo} onLogout={logout} capabilities={caps} errors={errors}/>;
  if(page==='explorer')return demo?<View><T color={C.orange}>دليل API يحتاج ربط WHMCS حقيقي (غير متاح في الديمو).</T></View>:session?<Explorer session={session} onDetails={(title,lines)=>setDetail({title,lines})}/>:null;
  return <Directory session={session} page={page} data={data} onDetails={(title,lines)=>setDetail({title,lines})} total={totals[page]} error={errors[page]} loading={moreBusy} onLoadMore={()=>loadMore(page as 'clients'|'invoices'|'services'|'orders'|'domains')} onReload={()=>session&&void refresh(session,true,page as SectionKey)}/>;
 };
 const currentTab=nav.some(n=>n.page===page)?page:'more';
 return <View style={{flex:1,backgroundColor:C.bg}}><StatusBar barStyle="light-content" translucent={false} backgroundColor={C.bg}/>
  <View style={{flexDirection:'row-reverse',paddingHorizontal:19,paddingTop:10,paddingBottom:9,justifyContent:'space-between',alignItems:'center',borderBottomWidth:1,borderBottomColor:C.stroke}}><T weight="900" size={12} color={C.red}>WHMCS</T><View style={{flexDirection:'row-reverse',gap:8,alignItems:'center'}}><Icon name={demo?'flask-outline':'shield-check'} color={demo?C.orange:C.green} size={16}/><T size={10} color={C.muted}>{demo?'DEMO':lastSync?`API • ${lastSync}`:'WHMCS API'}</T></View></View>
  {Object.keys(errors).length>0&&!demo?<Pressable style={{backgroundColor:'#483820',padding:9}} onPress={()=>{if(session)void refresh(session,true);}}><T color={C.orange} size={11}>{Object.values(errors).some(x=>/429/.test(x))?'WHMCS API مؤقتًا مشغول — إعادة تلقائية بعد انتهاء الانتظار':'تعذر تحميل بعض البيانات — اضغط لإعادة المحاولة'}</T></Pressable>:null}
  {error?<Pressable style={{backgroundColor:'#47212A',padding:11}} onPress={()=>session&&refresh(session)}><T color={C.orange} size={12}>تعذر التحديث: {error} — اضغط لإعادة المحاولة</T></Pressable>:null}
  <KeyboardAvoidingView style={{flex:1}} behavior={Platform.OS==='ios'?'padding':undefined}>
   <ScrollView ref={pageScroll} key={page} keyboardDismissMode={Platform.OS==='ios'?'interactive':'none'} keyboardShouldPersistTaps="handled"
    automaticallyAdjustKeyboardInsets={Platform.OS==='ios'}
     onScroll={event=>{scrollOffset.current=event.nativeEvent.contentOffset.y}} scrollEventThrottle={16}
     onContentSizeChange={()=>{if(composerFocused.current&&keyboardVisible)revealFocusedInput();}}
    contentContainerStyle={{padding:18,paddingBottom:keyboardVisible?keyboardPadding+insets.bottom+140:Math.max(35,insets.bottom+24)}}
    refreshControl={<RefreshControl refreshing={loading} tintColor={C.red} onRefresh={()=>page==='tickets'?setTicketReload(x=>x+1):session?void refresh(session,true):undefined}/>}>
    {body()}
   </ScrollView>
  </KeyboardAvoidingView>
  {!keyboardVisible&&!ticketDetailOpen?<View style={{flexDirection:'row-reverse',borderTopWidth:1,borderTopColor:C.stroke,backgroundColor:C.surface,paddingTop:4,paddingBottom:4,paddingHorizontal:8,minHeight:60,alignItems:'center'}}>{nav.map(item=><Pressable key={item.page} onPress={()=>navigate(item.page)} style={{flex:1,alignItems:'center',justifyContent:'center',paddingVertical:3,gap:2}}><Icon name={item.icon} size={22} color={currentTab===item.page?C.red:C.muted}/><T size={10} color={currentTab===item.page?C.red:C.muted} weight={currentTab===item.page?'800':'400'}>{item.label}</T></Pressable>)}</View>:null}
  <Modal visible={!!detail} transparent animationType="slide" onRequestClose={()=>setDetail(null)}><View style={{flex:1,justifyContent:'flex-end',backgroundColor:'#000A'}}><View style={{backgroundColor:C.surface,borderTopLeftRadius:24,borderTopRightRadius:24,padding:22,maxHeight:'82%'}}><T weight="900" size={21}>{detail?.title||''}</T><T color={C.muted} style={{marginBottom:14}}>تفاصيل السجل — للقراءة فقط</T><ScrollView>{(detail?.lines||[]).map(([k,v],i)=><View key={`${k}-${i}`} style={{paddingVertical:10,borderBottomWidth:1,borderBottomColor:C.stroke}}><T size={11} color={C.muted}>{k}</T><T weight="600">{v}</T></View>)}</ScrollView><View style={{marginTop:16,paddingBottom:insets.bottom+14}}><Action label="إغلاق" secondary onPress={()=>setDetail(null)}/></View></View></View></Modal>
 </View>;
}

export default function App(){return <SafeAreaProvider><SafeAreaView edges={['top','bottom']} style={{flex:1,backgroundColor:C.bg}}><CommandApp/><UpdateGate/></SafeAreaView></SafeAreaProvider>;}
