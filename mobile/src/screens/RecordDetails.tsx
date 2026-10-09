import React,{useEffect,useRef,useState} from 'react';
import {ActivityIndicator,Alert,Pressable,TextInput,View} from 'react-native';
import type {Page,Session} from '../types';
import {C} from '../theme';
import {Action,Card,Header,Icon,Pill,T} from '../components/UI';
import {callApi,listOf} from '../lib/api';

type DetailPage='services'|'invoices'|'orders'|'domains';
type RecordItem={id:number;status?:string;[key:string]:any};
const val=(x:unknown)=>x===null||x===undefined||typeof x==='object'?'':String(x).trim();
const number=(x:unknown)=>Number(x)||0;
const itemList=(d:any,root:string,singular:string):RecordItem[]=>listOf(d,root,singular);
const statusColor=(s:string)=>/^(active|paid|accepted)$/i.test(s)?C.green:/pending|unpaid|suspended|overdue/i.test(s)?C.orange:C.muted;
const headline=(page:DetailPage,item:RecordItem)=>
 page==='invoices'?'فاتورة #'+val(item.invoicenum||item.id):
 page==='orders'?'طلب #'+val(item.ordernum||item.id):
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
export function RecordDetails({page,item,session,onBack,onChanged}:{
 page:Page;item:RecordItem;session:Session|null;onBack:()=>void;onChanged?:()=>void;
}){
 const type=page as DetailPage;
 const [data,setData]=useState<RecordItem|null>(null),[busy,setBusy]=useState(false),[working,setWorking]=useState(false);
 const [error,setError]=useState(''),[editing,setEditing]=useState(false),[notes,setNotes]=useState('');
 const [dateEditing,setDateEditing]=useState(false),[dueDate,setDueDate]=useState('');
 const request=useRef(0);
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
  if(!/^\\d{4}-\\d{2}-\\d{2}$/.test(dueDate.trim())
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
 return <View style={{gap:13,paddingBottom:35}}>
  <Pressable onPress={onBack} style={{alignSelf:'flex-end',flexDirection:'row-reverse',alignItems:'center',gap:5,paddingVertical:6}}>
   <Icon name="arrow-right" color={C.blue} size={20}/><T color={C.blue}>رجوع للقائمة</T>
  </Pressable>
  <Header title={headline(type,read)} subtitle={`#${item.id} • تفاصيل ${type==='services'?'الخدمة':type==='orders'?'الطلب':type==='invoices'?'الفاتورة':'الدومين'}`}/>
  <Pill label={status} color={statusColor(status)}/>
  {busy?<ActivityIndicator color={C.red}/>:null}
  {error?<Card style={{gap:9}}><T color={C.orange}>{error}</T>
   <Action compact secondary label="إعادة المحاولة" onPress={()=>void load()}/></Card>:null}
  {data?<Card style={{gap:5}}>
   <T size={16} weight="800">البيانات الأساسية</T>
   {facts[type].map(([field,label])=><Row key={field} label={label} value={val(read[field]|| (field==='name'?read.productname:''))}/>)}
   {type==='services'?<Row label="العميل" value={val(read.clientid||read.userid)}/>:null}
   {type==='invoices'?<Row label="العميل" value={val(read.userid)}/>:null}
  </Card>:null}
  {data&&type==='invoices'?<Card style={{gap:10}}>
   <T weight="800" size={15}>بنود الفاتورة</T>
   {itemList(data,'items','item').map((line:any,i:number)=><View key={String(line.id||i)} style={{gap:3,paddingVertical:8,borderBottomColor:C.stroke,borderBottomWidth:1}}>
    <T size={13}>{val(line.description)||'بند الفاتورة'}</T>
    <T size={12} color={C.blue}>{val(line.amount)}</T>
   </View>)}
   {!itemList(data,'items','item').length?<T color={C.muted} size={12}>لا توجد بنود متاحة</T>:null}
  </Card>:null}
  {data&&(type==='invoices'||type==='services')?<Card style={{gap:11}}>
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
  {data&&(type==='invoices'||type==='services')?<Card style={{gap:10}}>
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
  {data&&type==='orders'&&/^pending$/i.test(status)?<Card style={{gap:12}}>
   <T weight="800">إدارة الطلب</T>
   <T size={12} color={C.muted}>تنفيذ الإجراءات يتطلب تأكيدًا، وصلاحية API فعلية. قبول الطلب هنا لا يشغّل التفعيل الآلي أو إرسال رسائل ترحيب.</T>
   <Action disabled={working} icon="check-circle-outline" label="قبول الطلب"
    onPress={()=>confirm('قبول الطلب',`هل تريد قبول الطلب #${item.id}؟ لن يتم تفعيل الخدمة آليًا.`,
     ()=>void doAction('AcceptOrder',{orderid:item.id,autosetup:false,sendemail:false,sendregistrar:false},'تم قبول الطلب.'))}/>
   <Action disabled={working} secondary icon="close-circle-outline" label="إلغاء الطلب"
    onPress={()=>confirm('إلغاء طلب معلّق',`تأكيد إلغاء الطلب #${item.id} داخل WHMCS؟`,
     ()=>void doAction('CancelOrder',{orderid:item.id,cancelsub:false},'تم إلغاء الطلب.'))}/>
  </Card>:null}
  {!data&&!busy&&!error?<Card><T color={C.muted}>البيانات التفصيلية غير متاحة.</T></Card>:null}
 </View>;
}
