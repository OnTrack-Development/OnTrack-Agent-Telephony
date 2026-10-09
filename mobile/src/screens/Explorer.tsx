import React,{useState} from 'react';
import {ActivityIndicator,Pressable,View} from 'react-native';
import type {Session} from '../types';
import {callApi,listOf} from '../lib/api';
import {READ_ACTIONS,READ_CATEGORIES} from '../catalog/actions';
import type {ReadAction} from '../catalog/actions';
import {C} from '../theme';
import {Action,Card,Empty,Header,Icon,ItemRow,Pill,Search,Section,T} from '../components/UI';
const isSensitive=(name:string)=>/password|secret|accesskey|token|auth|hash|password2|gatewaytoken|cardnum|cvv|creditcard|servicepassword/i.test(name);
const safeValue=(value:unknown)=>typeof value==='object'?JSON.stringify(value).slice(0,280):String(value??'');
export function Explorer({session,onDetails}:{session:Session|null,onDetails:(title:string,lines:[string,string][])=>void}){
 const [selected,setSelected]=useState<ReadAction|null>(null),[filter,setFilter]=useState(''),[items,setItems]=useState<any[]>([]),[offset,setOffset]=useState(0),[total,setTotal]=useState(0),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const run=async(action:ReadAction,start=0)=>{
  if(!session)return;
  setBusy(true);setError('');
  try{
   const result=await callApi(session,action.action,{...action.params,...(action.action==='GetStats'?{}:{limitstart:start,limitnum:25})});
   if(!result.ok){setError(result.error||'غير مصرح به');if(start===0)setItems([]);return;}
   const r=result.data as any;
   const rows=action.root?listOf(r,action.root,action.item):[r];
   // Some API actions return a bare array or use a different plural wrapper; expose metadata if schema differs.
   if(action.root&&!rows.length){setItems(start?items:[r]);setTotal(1);setOffset(0);return;}
   setItems(start?[...items,...rows]:rows);setTotal(Number(r?.totalresults)||rows.length);setOffset(start);
  }finally{setBusy(false);}
 };
 const choose=(action:ReadAction)=>{setSelected(action);setItems([]);setFilter('');setTotal(0);void run(action);};
 if(!selected)return <View><Header title="دليل WHMCS" subtitle="أقسام API الرسمية — شاشات Native بدون WebView"/>{READ_CATEGORIES.map(group=><View key={group}><Section title={group}/><Card style={{paddingVertical:2}}>{READ_ACTIONS.filter(x=>x.category===group).map(x=><ItemRow key={x.action} icon={x.icon} heading={x.title} subtitle={x.action} onPress={()=>choose(x)} color={C.blue}/>)}</Card></View>)}</View>;
 const shown=items.filter(x=>JSON.stringify(x).toLowerCase().includes(filter.toLowerCase()));
 return <View><Pressable onPress={()=>{setSelected(null);setError('');}} style={{flexDirection:'row-reverse',alignItems:'center',gap:8,marginBottom:14}}><Icon name="arrow-right" color={C.red}/><T color={C.red} weight="700">رجوع للأقسام</T></Pressable><Header title={selected.title} subtitle={selected.action}/><Search value={filter} onChange={setFilter} placeholder="بحث داخل النتائج المعروضة..."/>{error?<Card><T color={C.orange}>{error}</T></Card>:null}<T color={C.muted} size={11} style={{marginBottom:8}}>المحمّل {items.length} من {total||'غير محدد'} — القراءة فقط</T><Card style={{paddingVertical:3}}>{shown.length?shown.map((record,i)=>{const pairs=Object.entries(record).filter(([k])=>!isSensitive(k)).map(([k,v])=>[k,safeValue(v)] as [string,string]);const title=String(record.domain||record.companyname||record.name||record.subject||record.title||record.id||`${selected.title} ${i+1}`);return <ItemRow key={`${i}-${record.id||record.name}`} icon={selected.icon} heading={title} subtitle={pairs.filter(([k])=>/status|email|duedate|firstname|lastname|currency/i.test(k)).slice(0,2).map(([k,v])=>`${k}: ${v}`).join(' • ')} onPress={()=>onDetails(title,pairs)}/>;}):busy?<ActivityIndicator color={C.red}/>:<Empty text="لا توجد بيانات أو الـAPI رجّع بنية غير متوقعة"/>}</Card>{busy?<ActivityIndicator color={C.red}/>:total>items.length?<View style={{marginTop:14}}><Action label="تحميل المزيد" secondary onPress={()=>void run(selected,offset+25)}/></View>:null}</View>;
}
