import React,{useCallback,useEffect,useRef,useState} from 'react';
import {ActivityIndicator,AppState,BackHandler,Keyboard,KeyboardAvoidingView,Modal,Platform,Pressable,RefreshControl,ScrollView,StatusBar,TextInput,View} from 'react-native';
import {Alert,FeedbackHost} from './src/components/Feedback';
import {C} from './src/theme';
import {SafeAreaProvider,SafeAreaView,useSafeAreaInsets} from 'react-native-safe-area-context';
import {UpdateGate} from './src/components/UpdateGate';
import {AnimatedSplash} from './src/components/AnimatedSplash';
import {PageMotion} from './src/components/PageMotion';
import * as SplashScreen from 'expo-splash-screen';
void SplashScreen.preventAutoHideAsync().catch(()=>{});
import type {DemoState,Page,Session} from './src/types';
import {seed} from './src/data/demo';
import {connect as connectApi,loadSession,loadOverview,loadPage,getTicketThread,replyToTicket,signOut,getApiRetryAfterMs} from './src/lib/api';
import type {SectionKey} from './src/lib/api';
import {Action,Card,Icon,Notice,T} from './src/components/UI';
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
 const [introFinished,setIntroFinished]=useState(false);
 const [initializing,setInitializing]=useState(true),[session,setSession]=useState<Session|null>(null),[demo,setDemo]=useState(false);
 const [data,setData]=useState<DemoState>(empty),[page,setPage]=useState<Page>('home'),[loading,setLoading]=useState(false);
 const [ticketReload,setTicketReload]=useState(0);
 const [notificationTarget,setNotificationTarget]=useState<{page:SectionKey|'whatsapp';id:number|null}|null>(null);
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

 // Keep the native launch surface until AnimatedSplash has painted its first frame.

 useEffect(()=>{if(!session||demo)return;const listener=AppState.addEventListener('change',s=>{if(s==='active')void refresh(session);});return()=>listener.remove();},[session,demo,refresh]);
 useEffect(()=>{
  if(!session||demo)return;
  let disposed=false;
  void enableDeviceNotifications().catch(()=>{});
  const sections:SectionKey[]=['tickets','orders','clients','invoices','services','domains'];
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
 const navigate=(p:Page)=>{setNotificationTarget(null);if(p!==page){setHistory(h=>[...h,page].slice(-20));setPage(p);}setDetail(null);};
 const routeNotification=(payload:any)=>{
  if(!payload||typeof payload!=='object')return;
  const kind=payload.section;
  const categories=['tickets','orders','clients','invoices','services','domains','whatsapp'];
  if(typeof kind!=='string'||!categories.includes(kind))return;
  const id=Number(payload.id);
  const verified=Number.isSafeInteger(id)&&id>0?id:null;
  navigate(kind as Page);
  setNotificationTarget({page:kind as SectionKey|'whatsapp',id:verified});
 };
 useEffect(()=>{
  const sub=Notifications.addNotificationResponseReceivedListener(response=>{
   routeNotification(response.notification.request.content.data);
   void Notifications.clearLastNotificationResponseAsync().catch(()=>{});
  });
  return()=>sub.remove();
 },[page]);
 useEffect(()=>{
  let active=true;
  void Notifications.getLastNotificationResponseAsync().then(response=>{
   if(!active||!response)return;
   routeNotification(response.notification.request.content.data);
   void Notifications.clearLastNotificationResponseAsync().catch(()=>{});
  }).catch(()=>{});
  return()=>{active=false;};
 },[]);
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
 if(!introFinished)return <AnimatedSplash ready={!initializing} onFinish={()=>setIntroFinished(true)}/>;
 if(!session&&!demo)return <Connect onPair={connect} onDemo={()=>{setDemo(true);setData(JSON.parse(JSON.stringify(seed)));setCaps({'tickets.read':true,'tickets.reply':true,'whatsapp.read':true,'whatsapp.send':true,'ai.read':true});setPage('home');}}/>;
 const body=()=>{
  if(page==='home')return <Home data={data} demo={demo} navigate={navigate} capabilities={caps} totals={totals}/>;
  if(page==='tickets')return <Tickets session={session} tickets={data.tickets} reloadSignal={ticketReload} onReply={reply} demo={demo} onComposerFocus={revealComposer} onDetailChange={setTicketDetailOpen}
   focusTicket={notificationTarget?.page==='tickets'&&notificationTarget.id?{id:notificationTarget.id,number:String(notificationTarget.id),subject:'',customer:'',department:'',priority:'Medium',status:'Open',updated:''}:undefined}
   onClose={()=>setNotificationTarget(null)}/>;
  if(page==='whatsapp')return <WhatsApp session={session} demo={demo} onComposerFocus={revealComposer} onDetailChange={setTicketDetailOpen}/>;
  if(page==='ai')return <AiOps agents={data.agents} queue={data.queue} session={session} demo={demo}/>;
  if(page==='more')return <View style={{gap:16,paddingBottom:24}}>
    <View style={{marginBottom:6,gap:5}}><T size={28} weight="900">مساحة الإدارة</T><T color={C.muted} size={13}>كل أدوات WHMCS مرتّبة في مكان واحد</T></View>
    <View style={{flexDirection:'row-reverse',flexWrap:'wrap',gap:12}}>
     {menu.map(m=><Pressable accessibilityRole="button" accessibilityLabel={m.label} key={m.page} onPress={()=>navigate(m.page)}
      style={({pressed})=>({width:'47.9%',minHeight:138,padding:16,backgroundColor:C.surface,
       borderWidth:1,borderColor:C.stroke,borderRadius:20,justifyContent:'space-between',
       opacity:pressed?0.76:1})}>
      <View style={{flexDirection:'row-reverse',justifyContent:'space-between',alignItems:'center'}}>
       <View style={{height:47,width:47,borderRadius:15,backgroundColor:C.red+'14',alignItems:'center',justifyContent:'center'}}>
        <Icon name={m.icon} size={24} color={C.red}/>
       </View>
       <Icon name="arrow-top-left" size={18} color={C.muted}/>
      </View>
      <T weight="800" size={15}>{m.label}</T>
     </Pressable>)}
    </View>
   </View>;
  if(page==='settings')return <Settings session={session} demo={demo} onLogout={logout} capabilities={caps} errors={errors}/>;
  if(page==='explorer')return demo?<View><T color={C.orange}>دليل API يحتاج ربط WHMCS حقيقي (غير متاح في الديمو).</T></View>:session?<Explorer session={session} onDetails={(title,lines)=>setDetail({title,lines})}/>:null;
  return <Directory session={session} page={page} data={data} onDetails={(title,lines)=>setDetail({title,lines})} total={totals[page]} error={errors[page]} loading={moreBusy} onLoadMore={()=>loadMore(page as 'clients'|'invoices'|'services'|'orders'|'domains')} onReload={()=>session&&void refresh(session,true,page as SectionKey)}
  onComposerFocus={revealComposer} focusRecordId={notificationTarget?.page===page?notificationTarget.id||undefined:undefined} onFocusExit={()=>setNotificationTarget(null)}/>;
 };
 const currentTab=nav.some(n=>n.page===page)?page:'more';
 return <View style={{flex:1,backgroundColor:C.bg}}><StatusBar barStyle="light-content" translucent={false} backgroundColor={C.bg}/>
  <View style={{flexDirection:'row-reverse',paddingHorizontal:21,paddingTop:13,paddingBottom:14,
   justifyContent:'space-between',alignItems:'center',borderBottomWidth:1,borderBottomColor:C.stroke,
   backgroundColor:C.bg}}>
   <View style={{flexDirection:'row-reverse',alignItems:'center',gap:10}}>
    <View style={{width:32,height:32,borderRadius:10,backgroundColor:C.red,alignItems:'center',justifyContent:'center'}}>
     <Icon name="chart-timeline-variant" color={C.white} size={19}/>
    </View>
    <View style={{gap:1}}><T weight="900" size={15} style={{textAlign:'left',writingDirection:'ltr'}}>WHMCS</T>
     <T color={C.muted} size={9} style={{textAlign:'left',letterSpacing:1.1,writingDirection:'ltr'}}>ADMIN CONSOLE</T></View>
   </View>
   <View style={{flexDirection:'row-reverse',alignItems:'center',gap:7,
    backgroundColor:C.surface,borderWidth:1,borderColor:C.stroke,borderRadius:100,paddingHorizontal:10,paddingVertical:8}}>
    <View style={{height:7,width:7,borderRadius:4,backgroundColor:demo?C.orange:C.green}}/>
    <T size={10} color={C.muted}>{demo?'وضع العرض':lastSync?'مُزامن '+lastSync:'متصل بـ WHMCS'}</T>
   </View>
  </View>
  {Object.keys(errors).length>0&&!demo?<View style={{paddingHorizontal:18,paddingTop:10}}><Notice tone="warning" title={Object.values(errors).some(x=>/429/.test(x))?'اتصال WHMCS مشغول مؤقتًا':'بعض البيانات لم تُحمّل'} message="اضغط لإعادة المحاولة عند استقرار الاتصال" onPress={()=>{if(session)void refresh(session,true);}}/></View>:null}
  {error?<View style={{paddingHorizontal:18,paddingTop:8}}><Notice tone="danger" title="تعذر تحديث البيانات" message={error} onPress={()=>session&&void refresh(session)}/></View>:null}
  <KeyboardAvoidingView style={{flex:1}} behavior={Platform.OS==='ios'?'padding':undefined}>
   <ScrollView ref={pageScroll} key={page} keyboardDismissMode={Platform.OS==='ios'?'interactive':'none'} keyboardShouldPersistTaps="handled"
    automaticallyAdjustKeyboardInsets={Platform.OS==='ios'}
     onScroll={event=>{scrollOffset.current=event.nativeEvent.contentOffset.y}} scrollEventThrottle={16}
     onContentSizeChange={()=>{if(composerFocused.current&&keyboardVisible)revealFocusedInput();}}
    contentContainerStyle={{padding:18,paddingBottom:keyboardVisible?keyboardPadding+insets.bottom+140:Math.max(35,insets.bottom+24)}}
    refreshControl={<RefreshControl refreshing={loading} tintColor={C.red} onRefresh={()=>page==='tickets'?setTicketReload(x=>x+1):session?void refresh(session,true):undefined}/>}>
    <PageMotion key={page}>{body()}</PageMotion>
   </ScrollView>
  </KeyboardAvoidingView>
  {!keyboardVisible&&!ticketDetailOpen?<View style={{flexDirection:'row-reverse',
   borderTopWidth:1,borderTopColor:C.stroke,backgroundColor:C.surface,
   paddingTop:8,paddingBottom:Math.max(5,insets.bottom?4:8),paddingHorizontal:8,minHeight:67,
   alignItems:'center'}}>
   {nav.map(item=>{
    const active=currentTab===item.page;
    return <Pressable key={item.page} accessibilityRole="tab" accessibilityState={{selected:active}}
     onPress={()=>navigate(item.page)} style={({pressed})=>({flex:1,alignItems:'center',
      justifyContent:'center',paddingVertical:5,gap:5,opacity:pressed?0.7:1})}>
     <View style={{width:51,height:31,borderRadius:15,backgroundColor:active?C.red+'1C':'transparent',
      justifyContent:'center',alignItems:'center'}}>
      <Icon name={item.icon} size={22} color={active?C.red:C.muted}/>
     </View>
     <T size={10} color={active?C.text:C.muted} weight={active?'800':'500'}>{item.label}</T>
    </Pressable>;
   })}
  </View>:null}
  <Modal visible={!!detail} transparent animationType="slide" onRequestClose={()=>setDetail(null)}><View style={{flex:1,justifyContent:'flex-end',backgroundColor:'#000A'}}><View style={{backgroundColor:C.surface,borderTopLeftRadius:24,borderTopRightRadius:24,padding:22,maxHeight:'82%'}}><T weight="900" size={21}>{detail?.title||''}</T><T color={C.muted} style={{marginBottom:14}}>تفاصيل السجل — للقراءة فقط</T><ScrollView>{(detail?.lines||[]).map(([k,v],i)=><View key={`${k}-${i}`} style={{paddingVertical:10,borderBottomWidth:1,borderBottomColor:C.stroke}}><T size={11} color={C.muted}>{k}</T><T weight="600">{v}</T></View>)}</ScrollView><View style={{marginTop:16,paddingBottom:insets.bottom+14}}><Action label="إغلاق" secondary onPress={()=>setDetail(null)}/></View></View></View></Modal>
 </View>;
}

export default function App(){return <SafeAreaProvider><SafeAreaView edges={['top','bottom']} style={{flex:1,backgroundColor:C.bg}}><CommandApp/><UpdateGate/><FeedbackHost/></SafeAreaView></SafeAreaProvider>;}
