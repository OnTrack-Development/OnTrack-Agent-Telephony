import React,{useEffect,useMemo,useState} from 'react';
import {ActivityIndicator,BackHandler,Pressable,View} from 'react-native';
import {C} from '../theme';
import type {DemoState,Page,Client,Session} from '../types';
import {ClientProfile} from './ClientProfile';
import {RecordDetails} from './RecordDetails';
import {InvoiceActions} from '../components/InvoiceActions';
import {orderTitle} from '../lib/orderManagement';
import {callApi} from '../lib/api';
import {Action,Card,Empty,Header,Icon,Notice,Pill,Search,T} from '../components/UI';

const config:Record<string,{title:string;subtitle:string;icon:string;key:keyof DemoState}>={
 clients:{title:'العملاء',subtitle:'بيانات العملاء وملفاتهم',icon:'account-group-outline',key:'clients'},
 invoices:{title:'الفواتير',subtitle:'المستحقات والتحصيل',icon:'receipt-text-outline',key:'invoices'},
 services:{title:'الخدمات',subtitle:'الاشتراكات وتواريخ التجديد',icon:'server-network',key:'services'},
 orders:{title:'الطلبات',subtitle:'متابعة طلبات العملاء',icon:'cart-outline',key:'orders'},
 domains:{title:'الدومينات',subtitle:'الدومينات والتجديدات',icon:'web',key:'domains'}
};
type Filter='focus'|'all'|'paid'|'closed';
const available:Record<string,{label:string;value:Filter}[]>={
 clients:[{label:'الكل',value:'all'},{label:'الفعّالة',value:'focus'},{label:'المغلقة',value:'closed'}],
 services:[{label:'الجارية',value:'focus'},{label:'الكل',value:'all'},{label:'الملغاة',value:'closed'}],
 invoices:[{label:'المستحقة',value:'focus'},{label:'الكل',value:'all'},{label:'المدفوعة',value:'paid'}],
 orders:[{label:'المعلّقة',value:'focus'},{label:'الكل',value:'all'},{label:'المكتملة',value:'paid'}],
 domains:[{label:'الفعّالة',value:'focus'},{label:'الكل',value:'all'},{label:'المنتهية',value:'closed'}]
};
const str=(x:any)=>x===undefined||x===null?'':String(x).trim();
const statusColor=(status:string)=>/^(active|paid|accepted)$/i.test(status)?C.green:
 /^(unpaid|pending|overdue|suspended|expiring)$/i.test(status)?C.orange:
 /^(fraud|cancelled|terminated|closed|expired)$/i.test(status)?C.red:C.muted;
export const matchesRecordStatus=(page:Page,status:string,filter:Filter)=>{
 if(filter==='all')return true;
 if(filter==='paid')return /^(paid|active|accepted)$/i.test(status);
 if(filter==='closed')return /^(cancelled|terminated|closed|expired|inactive)$/i.test(status);
 if(page==='invoices')return /^(unpaid|overdue|payment pending)$/i.test(status);
 if(page==='orders')return /^(pending|fraud|payment pending)$/i.test(status);
 if(page==='services')return !/^(cancelled|terminated)$/i.test(status);
 return /^(active|expiring|pending)$/i.test(status);
};
export function listRecordSummary(page:Page,r:any):{title:string;primary:string;secondary:string}{
 if(page==='services')return {
  title:str(r.domain)||str(r.plan)||'خدمة #'+r.id,
  primary:[r.plan,r.renewal?'التجديد '+r.renewal:''].filter(Boolean).join(' • '),
  secondary:'خدمة #'+r.id
 };
 if(page==='invoices')return {
  title:'فاتورة #'+r.id,primary:[r.amount!==undefined?String(r.amount)+' '+str(r.currency):'',r.due?'الاستحقاق '+r.due:''].filter(Boolean).join(' • '),
  secondary:r.customer?'العميل: '+r.customer:''
 };
 if(page==='orders')return {
  title:orderTitle(r),primary:[r.product,r.created].filter(Boolean).join(' • '),
  secondary:r.customer?'العميل: '+r.customer:''
 };
 if(page==='domains')return {
  title:str(r.name)||'دومين #'+r.id,
  primary:r.expiry?'الانتهاء '+r.expiry:'',
  secondary:'دومين #'+r.id
 };
 return {title:str(r.name)||'عميل #'+r.id,primary:str(r.email),secondary:'عميل #'+r.id};
}
export function Directory({page,data,onDetails,total,error,loading,onLoadMore,session,onReload,onComposerFocus,focusRecordId,onFocusExit}:{
 page:Page;data:DemoState;onDetails:(title:string,lines:[string,string][])=>void;total?:number|null;error?:string;
 onComposerFocus?:()=>void;focusRecordId?:number;onFocusExit?:()=>void;
 loading?:boolean;onLoadMore:()=>void;session?:Session|null;onReload?:()=>void;
}){
 const cfg=config[page], [q,setQ]=useState(''),[filter,setFilter]=useState<Filter>('focus');
 const [selectedClient,setSelectedClient]=useState<Client|null>(null);
 const [selected,setSelected]=useState<{id:number;[key:string]:any}|null>(null);
 const [focusError,setFocusError]=useState('');
 const [invoiceSelection,setInvoiceSelection]=useState<number[]>([]);
 useEffect(()=>{setSelected(null);setSelectedClient(null);setInvoiceSelection([]);setQ('');setFilter(page==='clients'?'all':'focus');},[page]);
 useEffect(()=>{
  if(!session||!Number.isSafeInteger(focusRecordId)||!focusRecordId||focusRecordId<1)return;
  let active=true;setFocusError('');
  if(page!=='clients'){
   setSelected({id:focusRecordId});return()=>{active=false;};
  }
  void callApi(session,'GetClientsDetails',{clientid:focusRecordId}).then(result=>{
   if(!active)return;
   const row:any=(result.data as any)?.client||result.data;
   if(!result.ok||Number(row?.id||row?.userid)!==focusRecordId){
    setFocusError(result.error||'تعذر تأكيد بيانات العميل من WHMCS');return;
   }
   setSelectedClient({id:focusRecordId,name:[row.firstname,row.lastname].filter(Boolean).join(' ')||String(row.companyname||''),email:String(row.email||''),status:String(row.status||''),initials:'',services:0});
  });
  return()=>{active=false;};
 },[focusRecordId,page,session]);
 useEffect(()=>{
  if(!selected&&!selectedClient)return;
  const sub=BackHandler.addEventListener('hardwareBackPress',()=>{
   if(selected)setSelected(null);else setSelectedClient(null);
   return true;
  });
  return()=>sub.remove();
 },[selected,selectedClient]);
 const records=useMemo(()=>cfg?(data[cfg.key] as any[]):[],[cfg?.key,data]);
 const shown=records.filter((r:any)=>{
  const details=listRecordSummary(page,r);
  return matchesRecordStatus(page,str(r.status),filter) &&
   [details.title,details.primary,details.secondary,str(r.id)].some(x=>x.toLowerCase().includes(q.trim().toLowerCase()));
 });
 const selectedInvoices=page==='invoices'?records.filter((r:any)=>invoiceSelection.includes(Number(r.id))).map((r:any)=>({id:Number(r.id),status:str(r.status)})):[];
 const toggleInvoice=(id:number)=>setInvoiceSelection(prev=>prev.includes(id)?prev.filter(n=>n!==id):prev.length<15?[...prev,id]:prev);
 if(!cfg)return null;
 if(page==='clients'&&selectedClient&&session)return <ClientProfile session={session} client={selectedClient} onComposerFocus={onComposerFocus} onBack={()=>{setSelectedClient(null);onFocusExit?.();}}/>;
 if(selected)return <RecordDetails key={page+'-'+selected.id} page={page} item={selected}
  session={session||null} onBack={()=>{setSelected(null);onFocusExit?.();}} onChanged={onReload}/>;
 return <View style={{gap:13,paddingBottom:26}}>
  <Header title={cfg.title} subtitle={cfg.subtitle} right={<Icon name={cfg.icon} color={C.red} size={28}/>}/>
  <Search value={q} onChange={setQ} placeholder={'بحث في '+cfg.title+'...'}/>
  <View style={{flexDirection:'row-reverse',flexWrap:'wrap',gap:8}}>
   {(available[page]||[{label:'الكل',value:'all'}]).map(option=>
    <Pressable key={option.value} accessibilityRole="button"
     accessibilityState={{selected:filter===option.value}} onPress={()=>setFilter(option.value)}
     style={({pressed})=>({minHeight:40,paddingVertical:9,paddingHorizontal:17,borderRadius:13,
      justifyContent:'center',opacity:pressed?0.78:1,
      backgroundColor:filter===option.value?C.red+'1A':C.surface,
      borderColor:filter===option.value?C.red+'88':C.stroke,borderWidth:1})}>
     <T size={12} color={filter===option.value?C.red:C.muted}
      weight={filter===option.value?'800':'600'}>{option.label}</T>
    </Pressable>)}
  </View>
  <View style={{flexDirection:'row-reverse',justifyContent:'space-between',alignItems:'center'}}>
   <T size={12} color={C.muted}>{shown.length} ظاهر • {total==null?records.length+' محمّل':records.length+' محمّل من '+total}</T>
   {onReload?<Pressable onPress={onReload} style={{flexDirection:'row-reverse',gap:4,alignItems:'center'}}>
    <Icon name="refresh" color={C.blue} size={16}/><T color={C.blue} size={12}>تحديث</T>
   </Pressable>:null}
  </View>
  {page==='invoices'&&session?<View style={{gap:9}}>
   <View style={{flexDirection:'row-reverse',alignItems:'center',gap:8}}>
    <View style={{flex:1}}><Action compact secondary icon="checkbox-multiple-marked-outline" label="تحديد المعروض (حتى 15)" onPress={()=>setInvoiceSelection(shown.slice(0,15).map((r:any)=>Number(r.id)))}/></View>
    <View style={{flex:1}}><Action compact secondary label="إلغاء التحديد" onPress={()=>setInvoiceSelection([])}/></View>
   </View>
   {selectedInvoices.length?<InvoiceActions session={session} targets={selectedInvoices}
    onChanged={()=>{setInvoiceSelection([]);onReload?.();}}/>:
    <T size={11} color={C.muted}>حدد الفواتير لعرض الإجراءات، أو افتح فاتورة لإدارتها منفردة.</T>}
  </View>:null}
  {loading?<ActivityIndicator color={C.red}/>:null}
  {error?<Notice tone="danger" title="تعذر تحميل السجلات" message={error}/>:null}
  {focusError?<Notice tone="warning" title="السجل غير متاح" message={focusError}/>:null}
  <View style={{gap:9}}>
   {shown.length?shown.map((r:any)=>{
    const d=listRecordSummary(page,r);
    return <Pressable key={String(r.id)} onPress={()=>{
      if(page==='clients'){
       if(session)setSelectedClient(r as Client);
       else onDetails(d.title,[['الاسم',str(r.name)],['البريد',str(r.email)],['الحالة',str(r.status)]]);
      }else setSelected(r);
     }}
     accessibilityRole="button" accessibilityLabel={d.title}
     style={({pressed})=>({backgroundColor:C.surface,borderRadius:19,borderWidth:1,
      borderColor:C.stroke,padding:16,gap:13,opacity:pressed?0.77:1})}>
     <View style={{flexDirection:'row-reverse',gap:12,alignItems:'center'}}>
      {page==='invoices'?<Pressable accessibilityRole="checkbox"
       accessibilityState={{checked:invoiceSelection.includes(Number(r.id))}}
       accessibilityLabel={'تحديد فاتورة '+r.id}
       onPress={event=>{event.stopPropagation();toggleInvoice(Number(r.id));}}
       style={{padding:7}}><Icon name={invoiceSelection.includes(Number(r.id))?'checkbox-marked':'checkbox-blank-outline'} color={C.red} size={23}/></Pressable>:null}
      <View style={{width:43,height:43,borderRadius:14,backgroundColor:C.red+'12',
       borderWidth:1,borderColor:C.red+'23',justifyContent:'center',alignItems:'center'}}>
       <Icon name={cfg.icon} color={C.red} size={21}/>
      </View>
      <View style={{flex:1,gap:4}}>
       <T size={14} weight="800" lines={2}>{d.title}</T>
       {d.primary?<T size={12} color={C.muted} lines={2}>{d.primary}</T>:null}
      </View>
     </View>
     <View style={{flexDirection:'row-reverse',justifyContent:'space-between',alignItems:'center',
      gap:8,borderTopWidth:1,borderTopColor:C.stroke,paddingTop:12}}>
      <View style={{flex:1,gap:6}}>
       <Pill label={str(r.status)||'—'} color={statusColor(str(r.status))}/>
       {d.secondary?<T size={11} color={C.muted} lines={1}>{d.secondary}</T>:null}
      </View>
      <View style={{flexDirection:'row-reverse',gap:3,alignItems:'center'}}>
       <T size={12} weight="700" color={C.red}>{page==='clients'?'عرض الملف':'التفاصيل'}</T>
       <Icon name="chevron-left" size={17} color={C.red}/>
      </View>
     </View>
    </Pressable>;
   }):<Card><Empty icon={cfg.icon} text={q?'لا توجد نتائج للبحث':'لا توجد سجلات لهذا الفلتر، جرّب «الكل»'}/></Card>}
  </View>
  {total!=null&&records.length<total&&!error?<Action secondary
   label={loading?'جاري تحميل السجلات...':'تحميل المزيد'} disabled={loading} onPress={onLoadMore}/>:null}
  {page==='clients'?<T size={11} color={C.muted}>اضغط على العميل لعرض ملفه الكامل.</T>:null}
 </View>;
}
