import React,{useEffect,useRef,useState} from 'react';
import {BackHandler,Pressable,TextInput,View} from 'react-native';
import {Alert} from './Feedback';
import {C} from '../theme';
import type {Session,Ticket} from '../types';
import {Action,Card,Header,Icon,Pill,T} from './UI';
import {callApi} from '../lib/api';
import {newTicketParams,supportDepartments,verifyTicketClient} from '../lib/createTicket';
export function NewTicket({session,onCancel,onCreated,onComposerFocus}:{session:Session;onCancel:()=>void;onCreated:(ticket:Ticket)=>void;onComposerFocus?:()=>void}){
 const [departments,setDepartments]=useState<{id:number;name:string}[]>([]),[department,setDepartment]=useState(0);
 const [clientId,setClientId]=useState(''),[client,setClient]=useState<{id:number;name:string;email:string}|null>(null),[guest,setGuest]=useState(false);
 const [name,setName]=useState(''),[email,setEmail]=useState(''),[subject,setSubject]=useState(''),[message,setMessage]=useState(''),[priority,setPriority]=useState('Medium');
 const [busy,setBusy]=useState(false),[error,setError]=useState(''),[submitted,setSubmitted]=useState(false);
 const active=useRef(true),clientGeneration=useRef(0),sending=useRef(false);
 const loadDepartments=async()=>{try{const values=await supportDepartments(session);if(active.current){setDepartments(values);setError('');}}catch(e){if(active.current)setError(e instanceof Error?e.message:'تعذر قراءة الأقسام');}};
 useEffect(()=>{active.current=true;void loadDepartments();const back=BackHandler.addEventListener('hardwareBackPress',()=>{if(!sending.current)onCancel();return true;});return()=>{active.current=false;back.remove();};},[session]);
 const verify=async()=>{
  const stamp=++clientGeneration.current;setBusy(true);setError('');
  try{const value=await verifyTicketClient(session,Number(clientId));if(active.current&&stamp===clientGeneration.current)setClient(value);}
  catch(e){if(active.current&&stamp===clientGeneration.current)setError(e instanceof Error?e.message:'تعذر التحقق');}
  finally{if(active.current)setBusy(false);}
 };
 const send=()=>{
  if(sending.current||submitted)return;
  let params:Record<string,string|number>;
  try{if(!guest&&!client)throw Error('تحقق من العميل أولًا');params=newTicketParams({departmentId:department,subject,message,priority,...(guest?{name,email}:{clientId:client!.id})});}
  catch(e){setError(e instanceof Error?e.message:'بيانات غير مكتملة');return;}
  sending.current=true;setBusy(true);setError('');
  Alert.alert('إنشاء تذكرة',`إنشاء التذكرة «${subject.trim()}» لصالح ${guest?name:client!.name} في ${departments.find(d=>d.id===department)?.name}؟`,[
   {text:'إلغاء',style:'cancel',onPress:()=>{sending.current=false;if(active.current)setBusy(false);}},
   {text:'إنشاء',onPress:async()=>{
    try{
     const r=await callApi(session,'OpenTicket',params);
     if(!active.current)return;
     if(!r.ok){if(['NETWORK_ERROR','INVALID_JSON'].includes(r.code||'')||/^HTTP_5/.test(r.code||'')){setSubmitted(true);setError('تعذر التأكد من الإنشاء. ارجع لقائمة التذاكر وتحقق قبل إنشاء تذكرة أخرى.');}else setError(r.error||'رفض WHMCS إنشاء التذكرة');return;}
     setSubmitted(true);const data:any=r.data,id=Number(data?.id);
     if(!Number.isSafeInteger(id)||id<1){setError('WHMCS أكد الإنشاء لكن لم يرجع رقم التذكرة. ارجع للقائمة وتحقق قبل إنشاء تذكرة أخرى.');return;}
     onCreated({id,number:String(data.tid||id),subject:subject.trim(),customer:guest?name:client!.name,department:departments.find(d=>d.id===department)?.name||'',priority,status:'Open',updated:''});
    }catch(e){if(active.current)setError(e instanceof Error?e.message:'تعذر التأكد من الإنشاء؛ راجع قائمة التذاكر قبل المحاولة مرة أخرى.');}
    finally{sending.current=false;if(active.current)setBusy(false);}
   }}
  ],{cancelable:false});
 };
 const style={backgroundColor:C.surface2,color:C.text,padding:13,borderRadius:12,textAlign:'right' as const};
 return <View style={{gap:15,paddingBottom:24}}>
  <Pressable disabled={busy} onPress={onCancel} style={{flexDirection:'row-reverse',gap:8,paddingVertical:8}}><Icon name="arrow-right" color={C.red}/><T color={C.red}>التذاكر</T></Pressable>
  <Header title="إضافة تذكرة" subtitle="إنشاء تذكرة جديدة في WHMCS"/>
  <Card style={{gap:13}}>
   <View style={{flexDirection:'row-reverse',gap:8}}><View style={{flex:1}}><Action secondary={!guest} compact label="زائر" disabled={busy} onPress={()=>{clientGeneration.current++;setGuest(true);}}/></View><View style={{flex:1}}><Action secondary={guest} compact label="عميل مسجل" disabled={busy} onPress={()=>{clientGeneration.current++;setGuest(false);}}/></View></View>
   {guest?<><TextInput accessibilityLabel="اسم الزائر" value={name} onChangeText={setName} placeholder="اسم الزائر" placeholderTextColor={C.muted} style={style}/><TextInput accessibilityLabel="إيميل الزائر" value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" placeholder="إيميل الزائر" placeholderTextColor={C.muted} style={style}/></>:<>
    <TextInput accessibilityLabel="رقم العميل" value={clientId} onChangeText={v=>{clientGeneration.current++;setClientId(v);setClient(null);}} keyboardType="number-pad" placeholder="رقم العميل في WHMCS" placeholderTextColor={C.muted} style={style}/>
    <Action secondary compact label="التحقق من العميل" disabled={busy||!clientId} onPress={()=>void verify()}/>
    {client?<T size={12} color={C.green}>{client.name} • {client.email} • #{client.id}</T>:null}
   </>}
   <T weight="800">القسم</T><View style={{flexDirection:'row-reverse',flexWrap:'wrap',gap:7}}>{departments.map(d=><Pressable key={d.id} disabled={busy} onPress={()=>setDepartment(d.id)}><Pill label={d.name} color={department===d.id?C.red:C.muted}/></Pressable>)}</View>
   {!departments.length?<Action secondary compact label="إعادة تحميل الأقسام" onPress={()=>void loadDepartments()}/>:null}
   <TextInput accessibilityLabel="موضوع التذكرة" value={subject} onChangeText={setSubject} maxLength={255} placeholder="موضوع التذكرة" placeholderTextColor={C.muted} style={style}/>
   <T weight="800">الأولوية</T><View style={{flexDirection:'row-reverse',gap:9}}>{['Low','Medium','High'].map(p=><Pressable key={p} disabled={busy} onPress={()=>setPriority(p)}><Pill label={p} color={priority===p?C.red:C.muted}/></Pressable>)}</View>
   <TextInput accessibilityLabel="رسالة التذكرة" multiline value={message} onChangeText={setMessage} maxLength={30000} onFocus={onComposerFocus} placeholder="اكتب رسالة التذكرة..." placeholderTextColor={C.muted} style={{...style,minHeight:140,textAlignVertical:'top'}}/>
   {error?<T size={12} color={C.orange}>{error}</T>:null}
   <Action label={busy?'جارٍ التنفيذ...':submitted?'راجع قائمة التذاكر':'تأكيد وإنشاء التذكرة'} icon="send" disabled={busy||submitted||!department||!subject.trim()||!message.trim()} onPress={send}/>
  </Card>
 </View>;
}
