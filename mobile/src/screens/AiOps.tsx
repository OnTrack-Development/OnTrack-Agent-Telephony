import React,{useEffect,useRef,useState} from 'react';
import {ActivityIndicator,AppState,View} from 'react-native';
import {C} from '../theme';
import type {AiAgent,QueueJob,Session} from '../types';
import {Action,Card,Empty,Header,Icon,ItemRow,Metric,Pill,Section,T} from '../components/UI';
import {AdminAccess} from '../components/AdminAccess';
import {adminSessionReady} from '../lib/adminSession';
import {fetchAiSnapshot} from '../lib/aiSnapshot';
export function AiOps({agents:initialAgents,queue:initialQueue,session,demo}:{agents:AiAgent[],queue:QueueJob[],session:Session|null,demo:boolean}){
 const [agents,setAgents]=useState(initialAgents),[queue,setQueue]=useState(initialQueue);
 const [connected,setConnected]=useState(demo),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const [reload,setReload]=useState(0),[generatedAt,setGeneratedAt]=useState('');
 const inFlight=useRef(false);
 useEffect(()=>{
  if(!session||demo)return;
  let active=true;
  const load=async()=>{
   if(!adminSessionReady(session)||inFlight.current||AppState.currentState!=='active')return;
   inFlight.current=true;setBusy(true);
   try{const result=await fetchAiSnapshot(session);if(active){setAgents(result.agents);setQueue(result.queue);setConnected(true);setGeneratedAt(result.generatedAt);setError('');}}
   catch(e){if(active){setError(e instanceof Error?e.message:'تعذر الاتصال');if(!adminSessionReady(session)){setConnected(false);setAgents([]);setQueue([]);}}}
   finally{inFlight.current=false;if(active)setBusy(false);}
  };
  void load();const timer=setInterval(()=>void load(),30000);
  const resume=AppState.addEventListener('change',state=>{if(state==='active')void load();});
  return()=>{active=false;clearInterval(timer);resume.remove();};
 },[session,demo,reload]);
 return <View>{session&&!demo&&!adminSessionReady(session)?<AdminAccess key={error} session={session} onReady={()=>setReload(n=>n+1)}/>:null}{error?<T size={12} color={C.orange}>{error}</T>:null}{busy?<ActivityIndicator color={C.purple}/>:null}<View style={{marginVertical:12}}><Action secondary label="تحديث غرفة العمليات" disabled={busy||!session||!adminSessionReady(session)} onPress={()=>setReload(n=>n+1)}/></View>{generatedAt?<T size={10} color={C.muted}>{generatedAt}</T>:null}<Header title="AI Operations" subtitle="غرفة وكلاء الدعم الذكي" right={<Icon name="robot-outline" size={29} color={C.purple}/>}/><Card style={{backgroundColor:'#211A33',borderColor:'#4E376B'}}><View style={{flexDirection:'row-reverse',alignItems:'center',gap:8}}><Icon name="shield-half-full" color={C.purple}/><T weight="700">{demo?'بيانات محاكاة فقط':connected?'تم الاتصال بالموديول':'موديول AI غير موصول بعد'}</T></View><T color={C.muted} size={12} style={{marginTop:8}}>كل الوكلاء والعقود والصلاحيات تظل في Backend الأصلي؛ التطبيق للمتابعة والتنفيذ المسموح فقط.</T></Card><Section title="حالة الفريق"/><View style={{flexDirection:'row-reverse',flexWrap:'wrap',gap:10}}><Metric icon="robot" label="إجمالي الوكلاء" value={connected?`${agents.length}`:'—'} color={C.purple}/><Metric icon="progress-clock" label="مهام بالطابور" value={connected?`${queue.length}`:'—'} color={C.orange}/></View><Section title="فريق الوكلاء"/><Card style={{paddingVertical:3}}>{agents.length?agents.map(a=><ItemRow key={a.id} icon={a.icon||'robot'} heading={a.name} subtitle={`${a.role} • ${a.tasks} مهمة`} color={a.status==='working'?C.green:a.status==='review'?C.orange:C.purple} right={<Pill label={a.status} color={a.status==='working'?C.green:a.status==='review'?C.orange:C.muted}/>}/>):<Empty icon="robot-outline" text="لا توجد بيانات وكلاء حتى ربط الموديول"/>}</Card><Section title="الطابور والمراجعات"/><Card style={{paddingVertical:3}}>{queue.length?queue.map(j=><ItemRow key={j.id} icon="clipboard-text-clock-outline" heading={`تذكرة #${j.ticket}`} subtitle={`${j.agent} • ${j.since}`} right={<Pill label={j.state} color={j.state==='processing'?C.green:C.orange}/>}/>):<Empty text="لا توجد مهام في الطابور"/>}</Card></View>;
}
