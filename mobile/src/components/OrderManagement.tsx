import React,{useRef,useState} from 'react';
import {Alert,Linking,Pressable,View} from 'react-native';
import type {Session} from '../types';
import {C} from '../theme';
import {Action,Card,Icon,Pill,T} from './UI';
import {orderLines,orderTitle,runOrderAction,OrderAction} from '../lib/orderManagement';
import {savedAdminDirectory} from '../lib/adminSession';
import {validateBaseUrl} from '../lib/api';
const text=(v:any)=>v===undefined||v===null||typeof v==='object'?'':String(v).trim();
function Field({name,value}:{name:string;value:any}){
 const display=text(value);if(!display)return null;
 return <View style={{flexDirection:'row-reverse',justifyContent:'space-between',gap:9,paddingVertical:8,borderBottomColor:C.stroke,borderBottomWidth:1}}>
  <T size={11} color={C.muted} style={{flex:1}}>{name}</T><T size={12} style={{flex:2}}>{display}</T>
 </View>;
}
export function OrderManagement({session,order,id,onChanged,onOpenService,onOpenInvoice}:{
 session:Session;order:any;id:number;onChanged:()=>void;onOpenService?:(id:number)=>void;onOpenInvoice?:(id:number)=>void;
}){
 const [autosetup,setAutosetup]=useState(false),[sendemail,setSendemail]=useState(false),[sendregistrar,setSendregistrar]=useState(false);
 const [busy,setBusy]=useState(false),[error,setError]=useState('');const inFlight=useRef(false);
 const lines=orderLines(order),status=text(order.status),owner=Number(order.userid)||0;
 const pending=status.toLowerCase()==='pending',cancelled=status.toLowerCase()==='cancelled';
 const run=(action:OrderAction)=>{
  if(inFlight.current)return;
  const labels:Record<OrderAction,string>={
   AcceptOrder:'قبول الطلب',CancelOrder:'إلغاء الطلب',FraudOrder:'تصنيف الطلب احتيال',
   PendingOrder:'إرجاع الطلب للمعلّق',DeleteOrder:'حذف الطلب'
  };
  const risks=action==='AcceptOrder'&&(autosetup||sendregistrar)?
   '\nتحذير: اخترت تنفيذ أوامر على السيرفر أو المسجّل، وقد يترتب عليها إنشاء خدمات وتكاليف.':
   action==='CancelOrder'?'\nالإلغاء هنا لا يُرجع الأموال تلقائيًا.':
   action==='FraudOrder'?'\nقد يؤثر على الخدمة وبيانات الطلب.':'';
  Alert.alert(labels[action],'تنفيذ '+labels[action]+' للطلب '+orderTitle(order)+'؟'+risks,[
   {text:'إلغاء',style:'cancel'},
   {text:'تأكيد التنفيذ',style:action==='CancelOrder'||action==='FraudOrder'?'destructive':'default',onPress:async()=>{
    if(inFlight.current)return;
    inFlight.current=true;setBusy(true);setError('');
    try{
     const r=await runOrderAction(session,action,id,owner,{autosetup,sendemail,sendregistrar});
     if(!r.ok){setError(r.error||'تعذر تنفيذ الأمر');return;}
     Alert.alert('نجاح','WHMCS أكد تنفيذ الأمر.');onChanged();
    }finally{inFlight.current=false;setBusy(false);}
   }}
  ],{cancelable:false});
 };
 const openAdmin=async()=>{
  try{
   const dir=await savedAdminDirectory(session);
   await Linking.openURL(validateBaseUrl(session.baseUrl)+'/'+dir+'/orders.php?action=view&id='+id);
  }catch(e){setError(e instanceof Error?e.message:'تعذر فتح لوحة الإدارة');}
 };
 return <View style={{gap:13}}>
  <Card style={{gap:7}}>
   <T size={17} weight="800">{orderTitle(order)}</T>
   <Field name="العميل" value={order.name||order.userid}/>
   <Field name="Client ID" value={order.userid}/>
   <Field name="التاريخ" value={order.date}/>
   <Field name="قيمة الطلب" value={[text(order.currencyprefix),text(order.amount),text(order.currencysuffix)].filter(Boolean).join(' ')}/>
   <Field name="وسيلة الدفع" value={order.paymentmethodname||order.paymentmethod}/>
   <Field name="حالة الدفع" value={order.paymentstatus}/>
   <Field name="رقم الفاتورة" value={order.invoiceid}/>
   <Field name="الحالة" value={order.status}/>
   <Field name="كوبون الخصم" value={order.promocode}/>
   <Field name="عنوان IP للطلب" value={order.ipaddress}/>
   <Field name="ملاحظات الطلب" value={order.notes}/>
   {Number(order.invoiceid)>0?<Action compact secondary label={'فتح الفاتورة #'+order.invoiceid}
    onPress={()=>onOpenInvoice?.(Number(order.invoiceid))}/>:null}
  </Card>
  <Card style={{gap:12}}>
   <T weight="800" size={16}>المنتجات والخدمات في الطلب</T>
   {lines.map((line,index)=><View key={line.type+'-'+line.relid+'-'+index}
    style={{borderWidth:1,borderColor:C.stroke,borderRadius:12,padding:11,gap:5}}>
    <View style={{flexDirection:'row-reverse',justifyContent:'space-between',gap:8}}>
     <T weight="700" size={13}>{line.product||line.type||'بند الطلب'}</T>
     <Pill label={line.status||'—'} color={C.blue}/>
    </View>
    <Field name="نوع البند" value={line.type}/>
    <Field name="الدومين" value={line.domain}/>
    <Field name="دورة الفوترة" value={line.billingcycle}/>
    <Field name="قيمة البند" value={line.amount}/>
    <Field name="حالة السداد" value={line.paymentstatus}/>
    {line.type==='product'&&line.relid>0?<Action secondary compact label="فتح إدارة الخدمة"
     onPress={()=>onOpenService?.(line.relid)}/>:null}
   </View>)}
   {!lines.length?<T color={C.muted} size={12}>لم يرجع WHMCS بنودًا لهذا الطلب.</T>:null}
  </Card>
  <Card style={{gap:10}}>
   <T size={16} weight="800">إجراءات الطلب</T>
   {pending?<View style={{gap:9}}>
    {([{id:'autosetup',value:autosetup,change:setAutosetup,label:'Run Module Create (تفعيل فعلي)'},{id:'sendemail',value:sendemail,change:setSendemail,label:'Send Welcome Email'},{id:'sendregistrar',value:sendregistrar,change:setSendregistrar,label:'تنفيذ أوامر المسجّل'}] as const).map(x=>
     <Pressable key={x.id} style={{flexDirection:'row-reverse',alignItems:'center',gap:9}}
      onPress={()=>x.change(!x.value)}><Icon name={x.value?'checkbox-marked':'checkbox-blank-outline'} color={C.red}/>
      <T size={12}>{x.label}</T></Press>)}
    <Action disabled={busy} label="Accept Order" onPress={()=>run('AcceptOrder')}/>
    <Action disabled={busy} secondary label="Cancel Order" onPress={()=>run('CancelOrder')}/>
    <Action disabled={busy} secondary label="Set as Fraud" onPress={()=>run('FraudOrder')}/>
    <T size={11} color={C.muted}>خيار Cancel & Refund يحتاج معالجة فعلية للمدفوعات ولا يتم الادعاء أنه إلغاء عادي.</T>
   </View>:null}
   {!pending&&!cancelled?<Action disabled={busy} secondary label="Set Back to Pending" onPress={()=>run('PendingOrder')}/>:null}
   <Action secondary label="Delete / Refund • فتح لوحة WHMCS" disabled={busy} onPress={()=>void openAdmin()}/>
   {error?<T size={12} color={C.orange}>{error}</T>:null}
  </Card>
 </View>;
}
