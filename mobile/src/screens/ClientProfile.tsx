import React,{useEffect,useRef,useState} from 'react';
import {ActivityIndicator,Pressable,ScrollView,View} from 'react-native';
import type {Client,Session} from '../types';
import {C} from '../theme';
import {Action,Card,Header,Icon,Pill,T} from '../components/UI';
import {fetchClientSummary,fetchClientTab} from '../lib/clientProfile';
import type {ClientSummary,ClientTab,ClientTabResult,ProfileField} from '../lib/clientProfile';
const tabs:{id:ClientTab;name:string}[]=[
 {id:'overview',name:'الملخص'},{id:'services',name:'الخدمات'},{id:'domains',name:'الدومينات'},
 {id:'invoices',name:'الفواتير'},{id:'tickets',name:'التذاكر'},{id:'orders',name:'الطلبات'},
 {id:'contacts',name:'جهات الاتصال'}
];
const text=(x:unknown)=>x===null||x===undefined?'':typeof x==='object'?JSON.stringify(x):String(x).trim();
const forbidden=/password|secret|token|private.?key|auth|كلمة.?المرور/i;
function DataSection({title,fields}:{title:string,fields:ProfileField[]}){
 return <Card style={{gap:9,marginBottom:13}}>
  <T weight="800" size={16}>{title}</T>
  {fields.length?fields.map(f=><View key={f.label} style={{paddingVertical:7,borderTopWidth:1,borderTopColor:C.stroke,flexDirection:'row-reverse',alignItems:'flex-start',gap:10}}>
    <T size={12} color={C.muted} style={{flex:1}}>{f.label}</T>
    <T size={13} style={{flex:2}}>{f.value}</T>
   </View>):<T size={12} color={C.muted}>لا توجد بيانات متاحة من WHMCS لهذا القسم</T>}
 </Card>;
}
function recordTitle(tab:ClientTab,row:Record<string,unknown>){
 if(tab==='services')return text(row.name||row.productname||row.domain||'خدمة');
 if(tab==='domains')return text(row.domainname||row.domain||'دومين');
 if(tab==='invoices')return 'فاتورة #'+text(row.invoicenum||row.id);
 if(tab==='tickets')return text(row.title||row.subject||'تذكرة')+' #'+text(row.tid||row.id);
 if(tab==='orders')return 'طلب #'+text(row.id);
 return [text(row.firstname),text(row.lastname)].filter(Boolean).join(' ')||text(row.email)||'جهة اتصال';
}
function recordSubtitle(tab:ClientTab,row:Record<string,unknown>){
 if(tab==='services')return [text(row.domain),text(row.status),text(row.nextduedate)].filter(Boolean).join(' • ');
 if(tab==='domains')return [text(row.status),text(row.expirydate||row.nextduedate)].filter(Boolean).join(' • ');
 if(tab==='invoices')return [text(row.total),text(row.currency),text(row.status),text(row.duedate)].filter(Boolean).join(' • ');
 if(tab==='tickets')return [text(row.status),text(row.deptname),text(row.lastreply)].filter(Boolean).join(' • ');
 if(tab==='orders')return [text(row.status),text(row.date),text(row.amount)].filter(Boolean).join(' • ');
 return [text(row.email),text(row.phonenumber)].filter(Boolean).join(' • ');
}
export function ClientProfile({session,client,onBack}:{session:Session;client:Client;onBack:()=>void}){
 const [tab,setTab]=useState<ClientTab>('overview'),[summary,setSummary]=useState<ClientSummary|null>(null);
 const [records,setRecords]=useState<Partial<Record<ClientTab,ClientTabResult>>>({});
 const [errors,setErrors]=useState<Partial<Record<ClientTab,string>>>({});
 const [busy,setBusy]=useState(false);
 const current=useRef(0);
 useEffect(()=>{
  const id=++current.current;
  setSummary(null);setRecords({});setErrors({});setTab('overview');setBusy(true);
  fetchClientSummary(session,client).then(r=>{
   if(id!==current.current)return;
   if(r.ok&&r.data)setSummary(r.data);else setErrors(prev=>({...prev,overview:r.error||'تعذر قراءة ملف العميل'}));
  }).finally(()=>{if(id===current.current)setBusy(false)});
  return()=>{current.current++};
 },[client.id,session]);
 const select=async(next:ClientTab,retry=false)=>{
  setTab(next);
  if(next==='overview'||(records[next]&&!retry))return;
  const id=++current.current;
  setBusy(true);setErrors(prev=>({...prev,[next]:''}));
  const r=await fetchClientTab(session,client.id,next);
  if(id!==current.current)return;
  setBusy(false);
  if(r.ok&&r.data)setRecords(prev=>({...prev,[next]:r.data}));
  else setErrors(prev=>({...prev,[next]:r.error||'تعذر قراءة البيانات'}));
 };
 const selected=records[tab];
 return <View style={{gap:12,paddingBottom:28}}>
  <Pressable onPress={onBack} style={{alignSelf:'flex-end',flexDirection:'row-reverse',gap:8,alignItems:'center'}}>
    <Icon name="arrow-right" color={C.blue}/><T color={C.blue} weight="700">كل العملاء</T>
  </Pressable>
  <Header title={summary?.title||client.name} subtitle={'العميل #'+client.id} right={<Icon name="account-details" size={26} color={C.blue}/>}/>
  <View style={{flexDirection:'row-reverse',gap:7,alignItems:'center'}}>
   <Pill label={summary?.status||client.status||'غير معروف'} color={C.green}/>
   <T size={12} color={C.muted}>{client.email}</T>
  </View>
  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{flexDirection:'row-reverse',gap:7,paddingVertical:8}}>
   {tabs.map(x=><Pressable key={x.id} onPress={()=>void select(x.id)}
    style={{paddingHorizontal:14,paddingVertical:10,backgroundColor:tab===x.id?C.red:C.surface,borderColor:C.stroke,borderWidth:1,borderRadius:12}}>
    <T weight="700" color={tab===x.id?C.white:C.text}>{x.name}</T>
   </Pressable>)}
  </ScrollView>
  {busy?<ActivityIndicator color={C.red}/>:null}
  {errors[tab]?<Card><T color={C.orange}>{errors[tab]}</T><Action label="إعادة المحاولة" secondary onPress={()=>tab==='overview'?void fetchClientSummary(session,client).then(r=>{if(r.ok&&r.data){setSummary(r.data);setErrors(e=>({...e,overview:''}))}}):void select(tab,true)}/></Card>:null}
  {tab==='overview'&&summary?<View>
    <DataSection title="البيانات الأساسية" fields={summary.fields}/>
    <DataSection title="ملخص الفواتير والتحصيل" fields={summary.billing}/>
    <DataSection title="الخدمات والدومينات والتذاكر" fields={summary.services}/>
    <DataSection title="معلومات إضافية" fields={summary.other}/>
    <DataSection title="الحقول المخصصة" fields={summary.custom}/>
    <DataSection title="ملاحظات الإدارة" fields={summary.notes?[{label:'ملاحظات',value:summary.notes}]:[]}/>
   </View>:null}
  {tab!=='overview'&&selected?<View style={{gap:10}}>
   <T size={12} color={C.muted}>{selected.total===null?selected.records.length+' سجل محمّل':selected.records.length+' من '+selected.total}</T>
   {selected.records.map((item,i)=> {
    const pairs=Object.entries(item).filter(([key,value])=>!forbidden.test(key)&&value!==null&&value!==undefined&&typeof value!=='object')
     .slice(0,30).map(([label,value])=>({label,value:text(value)})).filter(v=>v.value);
    return <Card key={String(item.id||i)} style={{gap:7}}>
     <T weight="800">{recordTitle(tab,item)}</T><T size={12} color={C.muted}>{recordSubtitle(tab,item)}</T>
     {pairs.map(field=><View key={field.label} style={{flexDirection:'row-reverse',gap:9}}>
       <T color={C.muted} size={11} style={{flex:1}}>{field.label}</T>
       <T size={12} style={{flex:2}}>{field.value}</T>
      </View>)}
    </Card>
   })}
   {!selected.records.length?<Card><T color={C.muted}>لا توجد سجلات في القسم ده</T></Card>:null}
   </View>:null}
 </View>;
}
