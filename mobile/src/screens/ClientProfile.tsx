import React,{useEffect,useRef,useState} from 'react';
import {ActivityIndicator,Pressable,ScrollView,View} from 'react-native';
import {ClientCreditForm} from '../components/ClientCreditForm';
import {formatClientBalance, type CreditOperation} from '../lib/clientCredit';
import {Alert} from '../components/Feedback';
import {RecordDetails} from './RecordDetails';
import {Tickets} from './Tickets';
import {mapTicket,fetchTicketDetail} from '../lib/tickets';
import {replyToTicket} from '../lib/api';
import {orderTitle} from '../lib/orderManagement';
import type {Client,Session} from '../types';
import {C} from '../theme';
import {Action,Card,Header,Icon,Pill,T} from '../components/UI';
import {fetchClientSummary,fetchClientTab} from '../lib/clientProfile';
import type {ClientSummary,ClientTab,ClientTabResult,ProfileField} from '../lib/clientProfile';
const tabs:{id:ClientTab;name:string}[]=[
 {id:'overview',name:'الملخص'},{id:'services',name:'الخدمات'},{id:'domains',name:'الدومينات'},
 {id:'invoices',name:'الفواتير'},{id:'tickets',name:'التذاكر'},{id:'orders',name:'الطلبات'},
 {id:'contacts',name:'جهات الاتصال'},{id:'emails',name:'البريد المرسل'},
 {id:'quotes',name:'عروض الأسعار'},{id:'transactions',name:'المعاملات المالية'}
];
const coreTabs=tabs.slice(0,6),extraTabs=tabs.slice(6);
const text=(x:unknown)=>x===null||x===undefined?'':typeof x==='object'?'':String(x).trim();
const forbidden=/password|secret|token|private.?key|auth|كلمة.?المرور|^message$|^body$|^headers$/i;
function DataSection({title,fields}:{title:string,fields:ProfileField[]}){
 return <Card style={{gap:5,marginBottom:9,padding:12,borderRadius:15}}>
  <T weight="800" size={13}>{title}</T>
  {fields.length?fields.map(f=><View key={f.label} style={{paddingVertical:5,borderTopWidth:1,borderTopColor:C.stroke,flexDirection:'row-reverse',alignItems:'flex-start',gap:8}}>
    <T size={11} color={C.muted} style={{flex:1}}>{f.label}</T>
    <T size={12} style={{flex:2}}>{f.value}</T>
   </View>):<T size={12} color={C.muted}>لا توجد بيانات متاحة من WHMCS لهذا القسم</T>}
 </Card>;
}
function recordTitle(tab:ClientTab,row:Record<string,unknown>){
 if(tab==='services')return text(row.name||row.productname||row.domain||'خدمة');
 if(tab==='domains')return text(row.domainname||row.domain||'دومين');
 if(tab==='invoices')return 'فاتورة #'+text(row.invoicenum||row.id);
 if(tab==='tickets')return text(row.title||row.subject||'تذكرة')+' #'+text(row.tid||row.id);
 if(tab==='orders')return orderTitle(row);
 if(tab==='emails')return text(row.subject)||'رسالة بريد #'+text(row.id);
 if(tab==='quotes')return text(row.subject)||'عرض سعر #'+text(row.id);
 if(tab==='transactions')return 'معاملة #'+text(row.id);
 return [text(row.firstname),text(row.lastname)].filter(Boolean).join(' ')||text(row.email)||'جهة اتصال';
}
function recordSubtitle(tab:ClientTab,row:Record<string,unknown>){
 if(tab==='services')return [text(row.domain),text(row.status),text(row.nextduedate)].filter(Boolean).join(' • ');
 if(tab==='domains')return [text(row.status),text(row.expirydate||row.nextduedate)].filter(Boolean).join(' • ');
 if(tab==='invoices')return [text(row.total),text(row.currency),text(row.status),text(row.duedate)].filter(Boolean).join(' • ');
 if(tab==='tickets')return [text(row.status),text(row.deptname),text(row.lastreply)].filter(Boolean).join(' • ');
 if(tab==='orders')return [text(row.status),text(row.date),text(row.amount)].filter(Boolean).join(' • ');
 if(tab==='emails')return [text(row.date),text(row.to),text(row.sender)].filter(Boolean).join(' • ');
 if(tab==='quotes')return [text(row.stage),text(row.total),text(row.datecreated)].filter(Boolean).join(' • ');
 if(tab==='transactions')return [text(row.date),text(row.amountin),text(row.gateway)].filter(Boolean).join(' • ');
 return [text(row.email),text(row.phonenumber)].filter(Boolean).join(' • ');
}
export function ClientProfile({session,client,onBack,onComposerFocus}:{session:Session;client:Client;onBack:()=>void;onComposerFocus?:()=>void}){
 const [tab,setTab]=useState<ClientTab>('overview'),[summary,setSummary]=useState<ClientSummary|null>(null);
 const [records,setRecords]=useState<Partial<Record<ClientTab,ClientTabResult>>>({});
 const [errors,setErrors]=useState<Partial<Record<ClientTab,string>>>({});
 const [busy,setBusy]=useState(false);
 const [creditOperation,setCreditOperation]=useState<CreditOperation|null>(null),[extraOpen,setExtraOpen]=useState(false),[moreTabs,setMoreTabs]=useState(false);
 const [opened,setOpened]=useState<{tab:'services'|'invoices'|'orders'|'domains';row:Record<string,unknown>}|null>(null);
 const [openedTicket,setOpenedTicket]=useState<Record<string,unknown>|null>(null);
 const current=useRef(0);
 useEffect(()=>{
  const id=++current.current;
  setSummary(null);setRecords({});setErrors({});setTab('overview');setBusy(true);
  setCreditOperation(null);setExtraOpen(false);setMoreTabs(false);
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
 const refreshSummary=async()=>{
  const id=current.current;
  const result=await fetchClientSummary(session,client);
  if(id!==current.current)return;
  if(result.ok&&result.data){setSummary(result.data);setErrors(previous=>({...previous,overview:''}));}
  else setErrors(previous=>({...previous,overview:result.error||'تعذر تحديث رصيد العميل'}));
 };
 const selected=records[tab];
 if(openedTicket)return <Tickets key={'client-ticket-'+openedTicket.id} session={session} tickets={[]}
  demo={false} focusTicket={mapTicket(openedTicket)} expectedClientId={client.id} onClose={()=>setOpenedTicket(null)}
  onComposerFocus={onComposerFocus} onReply={async(id,reply,identity)=>{
   const checked=await fetchTicketDetail(session,id);
   if(!checked.ok||!checked.detail||checked.detail.clientId!==client.id){
    Alert.alert('رفض','التذكرة لا تطابق ملكية العميل.');return false;
   }
   const result=await replyToTicket(session,id,reply,identity);
   if(!result.ok){Alert.alert('تعذر الرد',result.error||'رفض WHMCS العملية');return false;}
   Alert.alert('تم','تم تسجيل الرد على التذكرة');void select('tickets',true);return true;
  }}/>;
 if(opened)return <RecordDetails page={opened.tab} item={{...opened.row,id:Number(opened.row.id)}}
  session={session} expectedClientId={client.id} onBack={()=>setOpened(null)} onChanged={()=>void select(opened.tab,true)}/>;
 return <View style={{gap:12,paddingBottom:28}}>
  <Pressable onPress={onBack} style={{alignSelf:'flex-end',flexDirection:'row-reverse',gap:8,alignItems:'center'}}>
    <Icon name="arrow-right" color={C.blue}/><T color={C.blue} weight="700">كل العملاء</T>
  </Pressable>
  <Header title={summary?.title||client.name} subtitle={'العميل #'+client.id} right={<Icon name="account-details" size={26} color={C.blue}/>}/>
  <Card style={{gap:11,padding:12,borderRadius:17}}>
   <View style={{flexDirection:'row-reverse',alignItems:'center',justifyContent:'space-between',gap:9}}>
    <View style={{gap:4,flex:1}}>
     <T size={10} color={C.muted}>حالة العميل</T>
     <Pill label={summary?.status||client.status||'غير معروف'}
      color={/active/i.test(summary?.status||client.status)?C.green:C.orange}/>
    </View>
    <View style={{alignItems:'flex-end',flex:1,gap:3}}>
     <T size={10} color={C.muted}>الرصيد المتاح</T>
     <T size={19} weight="900" color={C.green}>
      {summary?.creditBalance?formatClientBalance(summary.creditBalance):'غير متاح'}
     </T>
    </View>
   </View>
   {!creditOperation?<View style={{flexDirection:'row-reverse',gap:8}}>
    <View style={{flex:1}}><Action compact label="إضافة رصيد" icon="wallet-plus-outline"
     disabled={!summary?.creditBalance||busy} onPress={()=>setCreditOperation('add')}/></View>
    <View style={{flex:1}}><Action compact secondary label="خصم رصيد" icon="wallet-minus-outline"
     disabled={!summary?.creditBalance||busy||summary.creditBalance.amount<0.01}
     onPress={()=>setCreditOperation('remove')}/></View>
   </View>:null}
   <Pressable accessibilityRole="button" disabled={busy}
    style={{alignSelf:'flex-end',paddingVertical:3,flexDirection:'row-reverse',gap:5,alignItems:'center'}}
    onPress={()=>void refreshSummary()}>
    <Icon name="refresh" color={C.muted} size={15}/>
    <T color={C.muted} size={10}>تحديث الرصيد</T>
   </Pressable>
  </Card>
  {creditOperation&&summary?.creditBalance?<ClientCreditForm key={client.id+'-'+creditOperation}
   clientId={client.id} session={session} clientName={summary.title}
   operation={creditOperation} balance={summary.creditBalance} onCancel={()=>setCreditOperation(null)}
   onDone={newBalance=>{
    setSummary(previous=>previous?.creditBalance?{...previous,
     creditBalance:{...previous.creditBalance,amount:newBalance}}:previous);
    setCreditOperation(null);
    void refreshSummary();
   }}/>:null}
  <ScrollView horizontal showsHorizontalScrollIndicator={false}
   contentContainerStyle={{flexDirection:'row-reverse',gap:6,paddingVertical:4}}>
   {(moreTabs?tabs:coreTabs).map(x=><Pressable key={x.id} onPress={()=>void select(x.id)}
    accessibilityRole="button" accessibilityState={{selected:tab===x.id}}
    style={{paddingHorizontal:11,paddingVertical:9,backgroundColor:tab===x.id?C.red+'1C':C.surface,
     borderColor:tab===x.id?C.red:C.stroke,borderWidth:1,borderRadius:11}}>
    <T weight="800" color={tab===x.id?C.red:C.muted} size={11}>{x.name}</T>
   </Pressable>)}
   {extraTabs.length?<Pressable accessibilityRole="button" onPress={()=>setMoreTabs(x=>!x)}
    style={{paddingHorizontal:11,paddingVertical:9,backgroundColor:C.surface2,
     borderColor:C.stroke,borderWidth:1,borderRadius:11}}>
    <T weight="700" size={11} color={C.muted}>{moreTabs?'أقل':'المزيد'}</T>
   </Pressable>:null}
  </ScrollView>
  {busy?<ActivityIndicator color={C.red}/>:null}
  {errors[tab]?<Card><T color={C.orange}>{errors[tab]}</T><Action label="إعادة المحاولة" secondary onPress={()=>tab==='overview'?void fetchClientSummary(session,client).then(r=>{if(r.ok&&r.data){setSummary(r.data);setErrors(e=>({...e,overview:''}))}}):void select(tab,true)}/></Card>:null}
  {tab==='overview'&&summary?<View>
    {summary.fields.length?<DataSection title="بيانات التواصل" fields={summary.fields}/>:null}
    {summary.billing.length?<DataSection title="الفواتير المستحقة" fields={summary.billing}/>:null}
    {summary.services.length?<DataSection title="الخدمات والمتابعة" fields={summary.services}/>:null}
    {summary.other.length||summary.custom.length||summary.notes?
     <Action compact secondary label={extraOpen?'إخفاء التفاصيل الإضافية':'التفاصيل الإضافية'}
      icon={extraOpen?'chevron-up':'chevron-down'} onPress={()=>setExtraOpen(x=>!x)}/>:null}
    {extraOpen?<>
     {summary.other.length?<DataSection title="العنوان والبيانات الإضافية" fields={summary.other}/>:null}
     {summary.custom.length?<DataSection title="الحقول المخصصة" fields={summary.custom}/>:null}
     {summary.notes?<DataSection title="ملاحظات الإدارة" fields={[{label:'ملاحظات',value:summary.notes}]}/>:null}
    </>:null}
   </View>:null}
  {tab!=='overview'&&selected?<View style={{gap:10}}>
   <T size={12} color={C.muted}>{selected.total===null?selected.records.length+' سجل محمّل':selected.records.length+' من '+selected.total}</T>
   {selected.records.map((item,i)=> {
    const canManage=['services','invoices','orders','domains','tickets'].includes(tab)&&Number(item.id)>0;
    return <Pressable key={String(item.id||i)} disabled={!canManage} onPress={()=>{
      if(tab==='tickets'&&canManage)setOpenedTicket(item);
      else if(canManage)setOpened({tab:tab as 'services'|'invoices'|'orders'|'domains',row:item});
     }} accessibilityRole={canManage?'button':'text'} style={({pressed})=>({backgroundColor:C.surface,
      borderWidth:1,borderColor:C.stroke,borderRadius:14,padding:12,gap:6,
      opacity:pressed?0.78:1})}>
     <View style={{flexDirection:'row-reverse',justifyContent:'space-between',alignItems:'center',gap:9}}>
      <View style={{flex:1,gap:3}}>
       <T weight="800" lines={2}>{recordTitle(tab,item)}</T>
       <T color={C.muted} size={12} lines={2}>{recordSubtitle(tab,item)}</T>
      </View>
      {item.status?<Pill label={text(item.status)} color={C.blue}/>:null}
     </View>
     {canManage?<Icon name="chevron-left" color={C.muted} size={16}/>:null}
    </Pressable>;
   })}
   {!selected.records.length?<Card><T color={C.muted}>لا توجد سجلات في القسم ده</T></Card>:null}
   </View>:null}
 </View>;
}
