import React,{useEffect,useRef,useState} from 'react';
import {ActivityIndicator,Pressable,TextInput,View} from 'react-native';
import {Alert} from '../components/Feedback';
import type {Page,Session} from '../types';
import {C} from '../theme';
import {invoiceDue} from '../lib/invoicePresentation';
import {Action,Card,Header,Icon,Pill,T} from '../components/UI';
import {callApi,listOf} from '../lib/api';
import {InvoiceEditor} from '../components/InvoiceEditor';
import {InvoiceActions} from '../components/InvoiceActions';
import {ServiceManagement} from '../components/ServiceManagement';
import {OrderManagement} from '../components/OrderManagement';
import {orderTitle} from '../lib/orderManagement';

type DetailPage='services'|'invoices'|'orders'|'domains';
type RecordItem={id:number;status?:string;[key:string]:any};
const val=(x:unknown)=>x===null||x===undefined||typeof x==='object'?'':String(x).trim();
const number=(x:unknown)=>Number(x)||0;
const itemList=(d:any,root:string,singular:string):RecordItem[]=>listOf(d,root,singular);
const statusColor=(s:string)=>/^(active|paid|accepted)$/i.test(s)?C.green:/pending|unpaid|suspended|overdue/i.test(s)?C.orange:C.muted;
const headline=(page:DetailPage,item:RecordItem)=>
 page==='invoices'?'فاتورة #'+val(item.invoicenum||item.id):
 page==='orders'?orderTitle(item):
 page==='services'?val(item.name||item.productname||item.plan||item.domain||'الخدمة'):
 val(item.domainname||item.name||'الدومين');
const sections:Record<DetailPage,{action:string;params:(id:number)=>Record<string,number>;root?:string;singular?:string}>={
 invoices:{action:'GetInvoice',params:invoiceid=>({invoiceid})},
 orders:{action:'GetOrders',params:id=>({id,limitnum:5}),root:'orders',singular:'order'},
 services:{action:'GetClientsProducts',params:serviceid=>({serviceid,limitnum:5}),root:'products',singular:'product'},
 domains:{action:'GetClientsDomains',params:domainid=>({domainid,limitnum:5}),root:'domains',singular:'domain'}
};
export function detailIdentityMatches(page:DetailPage,detail:RecordItem,id:number):boolean{
 return number(page==='invoices'?(detail.invoiceid??detail.id):detail.id)===id;
}
const facts:Record<DetailPage,[string,string][]> ={
 services:[['name','الباقة'],['domain','الدومين'],['status','الحالة'],['billingcycle','دورة الفوترة'],
  ['recurringamount','التجديد'],['regdate','تاريخ الاشتراك'],['nextduedate','الاستحقاق القادم'],
  ['paymentmethod','طريقة الدفع']],
 invoices:[['status','حالة الفاتورة'],['date','تاريخ الإصدار'],['duedate','تاريخ الاستحقاق'],
  ['datepaid','تاريخ السداد'],['paymentmethod','طريقة الدفع'],['subtotal','الإجمالي قبل الضريبة'],
  ['tax','الضريبة'],['credit','الرصيد المستخدم'],['total','الإجمالي'],['balance','المتبقي']],
 orders:[['status','حالة الطلب'],['date','التاريخ'],['amount','الإجمالي'],['paymentmethod','طريقة الدفع'],
  ['invoiceid','رقم الفاتورة'],['promocode','كوبون الخصم']],
 domains:[['domainname','الدومين'],['status','الحالة'],['registrationdate','تاريخ التسجيل'],
  ['expirydate','تاريخ الانتهاء'],['nextduedate','التجديد القادم'],['registrar','المسجل']]
};
function Row({label,value}:{label:string;value:string}){
 if(!value||/^0000-00-00/.test(value))return null;
 return <View style={{flexDirection:'row-reverse',gap:12,paddingVertical:8,borderBottomColor:C.stroke,borderBottomWidth:1}}>
  <T color={C.muted} size={12} style={{flex:1}}>{label}</T>
  <T size={13} weight="600" style={{flex:1.5}}>{value}</T>
 </View>;
}
export function RecordDetails({page,item,session,onBack,onChanged,expectedClientId}:{
 page:Page;item:RecordItem;session:Session|null;onBack:()=>void;onChanged?:()=>void;expectedClientId?:number;
}){
 const type=page as DetailPage;
 const [data,setData]=useState<RecordItem|null>(null),[busy,setBusy]=useState(false),[working,setWorking]=useState(false);
 const [error,setError]=useState(''),[editing,setEditing]=useState(false),[notes,setNotes]=useState('');
 const [dateEditing,setDateEditing]=useState(false),[dueDate,setDueDate]=useState('');
 const [invoiceToolsOpen,setInvoiceToolsOpen]=useState(false);
 const request=useRef(0);
 const [related,setRelated]=useState<{page:'services'|'invoices';id:number}|null>(null);
 const load=async()=>{
  if(!session){setData(item);return;}
  const tick=++request.current;setBusy(true);setError('');
  const cfg=sections[type];const r=await callApi(session,cfg.action,cfg.params(item.id));
  if(tick!==request.current)return;
  setBusy(false);
  if(!r.ok){setError(r.error||'تعذر فتح التفاصيل');return;}
  const response:any=r.data||{};
  const found=cfg.root?itemList(response,cfg.root,cfg.singular||'').find(x=>detailIdentityMatches(type,x,item.id)):response;
  if(!found||!detailIdentityMatches(type,found,item.id)){setError('WHMCS لم يؤكد بيانات السجل المطلوب؛ تم منع عرض بيانات سجل مختلف.');return;}
  if(expectedClientId){
   const owner=Number(type==='services'?(found.clientid||found.userid):found.userid||found.clientid);
   if(owner!==expectedClientId){setData(null);setError('تم منع عرض سجل لا يطابق ملكية العميل المحدد.');return;}
  }
  setData(found);setNotes(val(found.notes));setDueDate(val(found.duedate||found.nextduedate));
 };
 useEffect(()=>{setData(null);setEditing(false);void load();return()=>{request.current++};},[type,item.id,session]);
 const read=data||item;
 const doAction=async(action:string,params:Record<string,string|number|boolean>,successText:string)=>{
  if(!session||working||!data)return;
  setWorking(true);setError('');
  const r=await callApi(session,action,params);
  setWorking(false);
  if(!r.ok){setError(r.error||'رفض WHMCS العملية');return;}
  Alert.alert('تم',successText);
  setEditing(false);onChanged?.();void load();
 };
 const confirm=(title:string,body:string,action:()=>void)=>Alert.alert(title,body,[
  {text:'رجوع',style:'cancel'},
  {text:'تأكيد التنفيذ',onPress:action}
 ]);
 const saveNote=()=>{
  if(!data||!session)return;
  const changed=notes.trim();
  if(changed===val(data.notes)){setEditing(false);return;}
  if(changed.length>4000){setError('الملاحظات يجب ألا تتجاوز 4000 حرف');return;}
  const isInvoice=type==='invoices';
  confirm('تأكيد حفظ الملاحظات',`هيتم تحديث ملاحظات ${isInvoice?'الفاتورة':'الخدمة'} #${item.id} داخل WHMCS.`,
   ()=>void doAction(isInvoice?'UpdateInvoice':'UpdateClientProduct',isInvoice?
    {invoiceid:item.id,notes:changed}:{serviceid:item.id,notes:changed},'تم حفظ الملاحظات في WHMCS.'));
 };
 const saveDueDate=()=>{
  if(!data||!session)return;
  if(!/^\d{4}-\d{2}-\d{2}$/.test(dueDate.trim())
   ||Number.isNaN(Date.parse(dueDate.trim()+'T12:00:00Z'))){
    setError('تاريخ الاستحقاق لازم يكون بصيغة YYYY-MM-DD');return;
  }
  const isInvoice=type==='invoices';
  const field=isInvoice?'duedate':'nextduedate';
  if(dueDate.trim()===val(data[field])){setDateEditing(false);return;}
  confirm('تأكيد تغيير الاستحقاق',`هيتم تغيير تاريخ الاستحقاق للسجل #${item.id} إلى ${dueDate.trim()} داخل WHMCS. قد يؤثر على جدول الفوترة.`,
   ()=>void doAction(isInvoice?'UpdateInvoice':'UpdateClientProduct',isInvoice?
    {invoiceid:item.id,duedate:dueDate.trim()}:{serviceid:item.id,nextduedate:dueDate.trim()},'تم تعديل الاستحقاق في WHMCS.'));
 };
 const status=val(read.status||item.status)||'غير معروف';
 if(related)return <RecordDetails page={related.page} item={{id:related.id}} session={session}
    expectedClientId={expectedClientId||Number(data?.userid||data?.clientid)||undefined}
    onBack={()=>setRelated(null)} onChanged={()=>{setRelated(null);onChanged?.();void load();}}/>;
 return <View style={{gap:13,paddingBottom:35}}>
  <Pressable onPress={onBack} style={{alignSelf:'flex-end',flexDirection:'row-reverse',alignItems:'center',gap:5,paddingVertical:6}}>
   <Icon name="arrow-right" color={C.blue} size={20}/><T color={C.blue}>رجوع للقائمة</T>
  </Pressable>
  {type!=='invoices'?<Header title={headline(type,read)}
   subtitle={type==='services'?'الخدمة':type==='orders'?'الطلب':'الدومين'}/>:null}
  {type!=='invoices'?<Pill label={status} color={statusColor(status)}/>:null}
  {busy?<ActivityIndicator color={C.red}/>:null}
  {error?<Card style={{gap:9}}><T color={C.orange}>{error}</T>
   <Action compact secondary label="إعادة المحاولة" onPress={()=>void load()}/></Card>:null}

  {type==='invoices'?<Card style={{gap:12,padding:16,borderRadius:19}}>
   <View style={{flexDirection:'row-reverse',alignItems:'center',justifyContent:'space-between',gap:10}}>
    <View style={{flex:1,gap:5}}>
     <T color={C.muted} size={11}>فاتورة #{item.id}</T>
     <T color={C.text} size={18} weight="900" lines={2}>{val(item.customer)||'الفاتورة'}</T>
    </View>
    <Pill label={status==='Unpaid'?'غير مدفوعة':status==='Paid'?'مدفوعة':
     status==='Cancelled'?'ملغاة':status} color={statusColor(status)}/>
   </View>
   <View style={{backgroundColor:C.surface2,borderRadius:14,padding:16,gap:5}}>
    <T color={C.muted} size={12} weight="700">قيمة الفاتورة</T>
    <T color={C.text} size={32} weight="900"
     style={{textAlign:'right',writingDirection:'ltr'}}>
     {val(read.total??item.amount)||'—'} {val(read.currencycode||read.currency||item.currency)}
    </T>
    {val(read.balance)&&Number(read.balance)>0&&Number(read.balance)!==Number(read.total)?
      <T size={12} color={C.red}>المتبقي: {val(read.balance)} {val(read.currencycode||item.currency)}</T>:null}
   </View>
   {status==='Unpaid'||status==='Overdue'?<Pill
     label={invoiceDue({status,due:val(read.duedate||item.due)}).label}
     color={invoiceDue({status,due:val(read.duedate||item.due)}).kind==='overdue'?C.red:C.green}
     icon="calendar-clock-outline"/>:null}
  </Card>:null}
  {data&&type==='invoices'&&invoiceToolsOpen?<Card style={{gap:10}}>
   <T weight="900" size={16}>بنود الفاتورة</T>
   {itemList(data,'items','item').map((line:any,i:number)=><View key={String(line.id||i)}
    style={{flexDirection:'row-reverse',alignItems:'center',gap:12,paddingVertical:9,
     borderBottomColor:C.stroke,borderBottomWidth:1}}>
    <T size={13} style={{flex:1}}>{val(line.description)||'بند الفاتورة'}</T>
    <T size={14} weight="800" color={C.text}
     style={{writingDirection:'ltr',textAlign:'left'}}>{val(line.amount)}</T>
   </View>)}
   {!itemList(data,'items','item').length?<T color={C.muted} size={12}>لا توجد بنود متاحة</T>:null}
  </Card>:null}
  {data&&type==='invoices'?<Card style={{gap:6}}>
   <T weight="900" size={16}>البيانات الأساسية</T>
   {val(read.date)?<Row label="تاريخ الإصدار" value={val(read.date)}/>:null}
   {val(read.duedate)?<Row label="تاريخ الاستحقاق" value={val(read.duedate)}/>:null}
   {val(read.paymentmethod)?<Row label="طريقة الدفع" value={val(read.paymentmethod)}/>:null}
   {val(read.datepaid)&&!/^0000-00-00/.test(val(read.datepaid))?
    <Row label="تاريخ السداد" value={val(read.datepaid)}/>:null}
   {Number(read.tax)>0?<Row label="الضريبة" value={val(read.tax)}/>:null}
   {Number(read.credit)>0?<Row label="الرصيد المستخدم" value={val(read.credit)}/>:null}
   {Number(read.subtotal)>0&&Number(read.subtotal)!==Number(read.total)?
    <Row label="قبل الخصومات والضريبة" value={val(read.subtotal)}/>:null}
  </Card>:null}
  {data&&type==='invoices'?<Pressable accessibilityRole="button"
   accessibilityState={{expanded:invoiceToolsOpen}}
   onPress={()=>setInvoiceToolsOpen(x=>!x)}
   style={({pressed})=>({minHeight:49,padding:13,borderRadius:16,
    borderWidth:1,borderColor:C.stroke,backgroundColor:C.surface,
    flexDirection:'row-reverse',alignItems:'center',gap:8,opacity:pressed?0.8:1})}>
   <Icon name="cog-outline" color={C.red} size={20}/>
   <T size={13} weight="800" style={{flex:1}}>إدارة وتعديل الفاتورة</T>
   <Icon name={invoiceToolsOpen?'chevron-up':'chevron-down'} color={C.muted}/>
  </Pressable>:null}
  {data&&type!=='orders'&&type!=='invoices'?<Card style={{gap:5}}>
   <T size={16} weight="800">البيانات الأساسية</T>
   {facts[type].map(([field,label])=><Row key={field} label={label}
    value={val(read[field]|| (field==='name'?read.productname:''))}/>)}
   {type==='services'?<Row label="العميل" value={val(read.clientid||read.userid)}/>:null}
  </Card>:null}
  {data&&type==='services'&&session?<ServiceManagement session={session} data={data} id={item.id}
    expectedClientId={expectedClientId} onChanged={()=>{onChanged?.();void load();}}/>:null}
   {data&&type==='orders'&&session?<OrderManagement session={session} order={data} id={item.id}
    onOpenService={id=>setRelated({page:'services',id})}
    onOpenInvoice={id=>setRelated({page:'invoices',id})}
    onChanged={()=>{onChanged?.();void load();}}/>:null}
  {data&&type==='invoices'&&invoiceToolsOpen?<><InvoiceEditor session={session} invoice={data} invoiceId={item.id} onChanged={()=>{onChanged?.();void load();}}/>
   <InvoiceActions session={session} targets={[{id:item.id,status:status}]} onChanged={()=>{onChanged?.();void load();}}/></>:null}
  {data&&type==='invoices'&&(invoiceToolsOpen||!!val(data.notes))?<Card style={{gap:11}}>
   <View style={{flexDirection:'row-reverse',alignItems:'center',justifyContent:'space-between'}}>
    <T weight="800">ملاحظات {type==='invoices'?'الفاتورة':'الخدمة'}</T>
    {!editing?<Pressable onPress={()=>setEditing(true)}><Icon name="pencil-outline" color={C.blue}/></Pressable>:null}
   </View>
   {editing?<><TextInput value={notes} onChangeText={setNotes} multiline numberOfLines={4}
    placeholder="ملاحظات الإدارة..." placeholderTextColor={C.muted}
    style={{color:C.text,textAlign:'right',textAlignVertical:'top',minHeight:95,borderColor:C.stroke,borderWidth:1,borderRadius:11,padding:10,backgroundColor:C.surface2}}/>
    <View style={{flexDirection:'row-reverse',gap:8}}>
     <View style={{flex:1}}><Action label="حفظ" disabled={working} onPress={saveNote}/></View>
     <View style={{flex:1}}><Action label="إلغاء" secondary onPress={()=>{setEditing(false);setNotes(val(data.notes))}}/></View>
    </View></>:<T color={C.muted} size={13}>{val(data.notes)||'بدون ملاحظات'}</T>}
  </Card>:null}
  {data&&type==='invoices'?<Card style={{gap:10}}>
   <T weight="800">تاريخ الاستحقاق والتجديد</T>
   {dateEditing?<><TextInput value={dueDate} onChangeText={setDueDate}
    placeholder="YYYY-MM-DD" placeholderTextColor={C.muted} keyboardType="numbers-and-punctuation"
    style={{color:C.text,textAlign:'center',padding:12,borderColor:C.stroke,borderWidth:1,borderRadius:12,backgroundColor:C.surface2}}/>
    <View style={{flexDirection:'row-reverse',gap:9}}>
     <View style={{flex:1}}><Action label="حفظ التاريخ" disabled={working} onPress={saveDueDate}/></View>
     <View style={{flex:1}}><Action label="إلغاء" secondary onPress={()=>setDateEditing(false)}/></View>
    </View></>:<View style={{flexDirection:'row-reverse',justifyContent:'space-between',alignItems:'center'}}>
     <T color={C.muted}>{dueDate||'غير محدد'}</T>
     <Pressable onPress={()=>setDateEditing(true)} style={{flexDirection:'row-reverse',gap:5,alignItems:'center'}}>
      <Icon name="calendar-edit" color={C.blue} size={17}/><T color={C.blue} size={12}>تعديل</T>
     </Pressable>
    </View>}
  </Card>:null}
  {!data&&!busy&&!error?<Card><T color={C.muted}>البيانات التفصيلية غير متاحة.</T></Card>:null}
 </View>;
}
