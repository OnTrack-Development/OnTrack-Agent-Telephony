import React,{useEffect,useMemo,useState} from 'react';
import {ActivityIndicator,BackHandler,Pressable,View} from 'react-native';
import {C} from '../theme';
import type {DemoState,Page,Client,Session} from '../types';
import {ClientProfile} from './ClientProfile';
import {RecordDetails} from './RecordDetails';
import {Action,Card,Empty,Header,Icon,Pill,Search,T} from '../components/UI';

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
  title:'طلب #'+r.id,primary:[r.product,r.created].filter(Boolean).join(' • '),
  secondary:r.customer?'العميل: '+r.customer:''
 };
 if(page==='domains')return {
  title:str(r.name)||'دومين #'+r.id,
  primary:r.expiry?'الانتهاء '+r.expiry:'',
  secondary:'دومين #'+r.id
 };
 return {title:str(r.name)||'عميل #'+r.id,primary:str(r.email),secondary:'عميل #'+r.id};
}
export function Directory({page,data,onDetails,total,error,loading,onLoadMore,session,onReload}:{
 page:Page;data:DemoState;onDetails:(title:string,lines:[string,string][])=>void;total?:number|null;error?:string;
 loading?:boolean;onLoadMore:()=>void;session?:Session|null;onReload?:()=>void;
}){
 const cfg=config[page], [q,setQ]=useState(''),[filter,setFilter]=useState<Filter>('focus');
 const [selectedClient,setSelectedClient]=useState<Client|null>(null);
 const [selected,setSelected]=useState<{id:number;[key:string]:any}|null>(null);
 useEffect(()=>{setSelected(null);setSelectedClient(null);setQ('');setFilter(page==='clients'?'all':'focus');},[page]);
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
 if(!cfg)return null;
 if(page==='clients'&&selectedClient&&session)return <ClientProfile session={session} client={selectedClient} onBack={()=>setSelectedClient(null)}/>;
 if(selected)return <RecordDetails key={page+'-'+selected.id} page={page} item={selected}
  session={session||null} onBack={()=>setSelected(null)} onChanged={onReload}/>;
 return <View style={{gap:13,paddingBottom:26}}>
  <Header title={cfg.title} subtitle={cfg.subtitle} right={<Icon name={cfg.icon} color={C.red} size={28}/>}/>
  <Search value={q} onChange={setQ} placeholder={'بحث في '+cfg.title+'...'}/>
  <View style={{flexDirection:'row-reverse',flexWrap:'wrap',gap:8}}>
   {(available[page]||[{label:'الكل',value:'all'}]).map(option=>
    <Pressable key={option.value} onPress={()=>setFilter(option.value)}
     style={{paddingVertical:9,paddingHorizontal:15,borderRadius:22,
      backgroundColor:filter===option.value?C.red:C.surface,borderColor:filter===option.value?C.red:C.stroke,borderWidth:1}}>
     <T size={12} color={filter===option.value?C.white:C.text} weight="700">{option.label}</T>
    </Pressable>)}
  </View>
  <View style={{flexDirection:'row-reverse',justifyContent:'space-between',alignItems:'center'}}>
   <T size={12} color={C.muted}>{shown.length} ظاهر • {total==null?records.length+' محمّل':records.length+' محمّل من '+total}</T>
   {onReload?<Pressable onPress={onReload} style={{flexDirection:'row-reverse',gap:4,alignItems:'center'}}>
    <Icon name="refresh" color={C.blue} size={16}/><T color={C.blue} size={12}>تحديث</T>
   </Pressable>:null}
  </View>
  {loading?<ActivityIndicator color={C.red}/>:null}
  {error?<Card><T color={C.orange} size={12}>{error}</T></Card>:null}
  <View style={{gap:9}}>
   {shown.length?shown.map((r:any)=>{
    const d=listRecordSummary(page,r);
    return <Pressable key={String(r.id)} onPress={()=>{
      if(page==='clients'){
       if(session)setSelectedClient(r as Client);
       else onDetails(d.title,[['الاسم',str(r.name)],['البريد',str(r.email)],['الحالة',str(r.status)]]);
      }else setSelected(r);
     }}
     style={{backgroundColor:C.surface,borderRadius:15,borderWidth:1,borderColor:C.stroke,padding:14,gap:7}}>
     <View style={{flexDirection:'row-reverse',gap:10,alignItems:'center',justifyContent:'space-between'}}>
      <View style={{flex:1,gap:3}}>
       <T size={15} weight="800" lines={2}>{d.title}</T>
       {d.primary?<T size={12} color={C.muted} lines={2}>{d.primary}</T>:null}
      </View>
      <Pill label={str(r.status)||'—'} color={statusColor(str(r.status))}/>
     </View>
     <View style={{flexDirection:'row-reverse',justifyContent:'space-between',alignItems:'center'}}>
      <T size={11} color={C.muted}>{d.secondary}</T>
      <View style={{flexDirection:'row-reverse',gap:3,alignItems:'center'}}>
       <T size={12} weight="700" color={C.blue}>{page==='clients'?'الملف':'عرض وإدارة'}</T>
       <Icon name="chevron-left" size={16} color={C.blue}/>
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
