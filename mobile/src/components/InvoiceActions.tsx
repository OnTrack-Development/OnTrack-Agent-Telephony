import React,{useRef,useState} from 'react';
import {Alert,Linking,View} from 'react-native';
import type {Session} from '../types';
import {C} from '../theme';
import {Action,Card,T} from './UI';
import {InvoiceBulkAction,InvoiceTarget,executeInvoiceAction,invoiceReminderTemplate} from '../lib/invoices';
import {savedAdminDirectory} from '../lib/adminSession';
import {validateBaseUrl} from '../lib/api';

export function InvoiceActions({session,targets,onChanged}:{session:Session|null;targets:InvoiceTarget[];onChanged:()=>void}){
 const [busy,setBusy]=useState(false),[error,setError]=useState('');const running=useRef(false);
 const doBatch=(kind:InvoiceBulkAction)=>{
  if(!session||running.current||!targets.length)return;
  if(targets.length>15){setError('حد أقصى 15 فاتورة في العملية الواحدة.');return;}
  const labels:Record<InvoiceBulkAction,string>={Paid:'مدفوعة',Unpaid:'غير مدفوعة',Cancelled:'ملغاة',duplicate:'نسخ',reminder:'إرسال تذكير'};
  const desc=kind==='Paid'?'تغيير الحالة فقط، ولن يتم تسجيل عملية سداد أو رقم معاملة.':
   kind==='duplicate'?'إنشاء فواتير جديدة غير مدفوعة دون إرسال بريد ودون نسخ المدفوعات.':
   kind==='reminder'?'إرسال رسالة تذكير إلى العميل بالفعل؛ لا يمكن التراجع عن البريد.':
   kind==='Cancelled'?'إلغاء الفواتير المحددة قد يؤثر على عمليات التحصيل.':'تعديل حالة الفواتير المحددة.';
  Alert.alert('تأكيد '+labels[kind],desc+'\nعدد الفواتير: '+targets.length+' — متابعة؟',[
   {text:'رجوع',style:'cancel'},
   {text:'تنفيذ',onPress:async()=>{
    if(running.current)return;
    running.current=true;setBusy(true);setError('');
    let completed=0;const failed:string[]=[];
    try{
     let template='';
     if(kind==='reminder')template=await invoiceReminderTemplate(session);
     for(const target of targets){
      const r=await executeInvoiceAction(session,kind,target,template);
      if(r.ok)completed++;
      else {
       failed.push('#'+target.id+': '+(r.error||'رفض WHMCS'));
       // Ambiguous network failure: never auto-repeat a potentially successful action.
       if(/NETWORK_ERROR|HTTP_5|timeout|network|اتصال/i.test((r.code||'')+' '+(r.error||'')))break;
      }
     }
     if(completed)onChanged();
     Alert.alert('نتيجة العملية',completed+' نجحت من '+targets.length+(failed.length?'\n'+failed.slice(0,3).join('\n'):''));
     if(failed.length)setError(failed.slice(0,3).join('\n'));
    }catch(e){setError(e instanceof Error?e.message:'تعذر تنفيذ العملية');}
    finally{running.current=false;setBusy(false);}
   }}
  ],{cancelable:false});
 };
 const openAdmin=async()=>{
  if(!session)return;
  try{
   const directory=await savedAdminDirectory(session);
   await Linking.openURL(validateBaseUrl(session.baseUrl)+'/'+directory+'/invoices.php');
  }catch(e){setError(e instanceof Error?e.message:'تعذر فتح لوحة الفواتير');}
 };
 return <Card style={{gap:10}}>
  <T weight="800">إجراءات الفواتير • {targets.length} محددة</T>
  <View style={{flexDirection:'row-reverse',gap:8,flexWrap:'wrap'}}>
   <Action compact label={busy?'جارٍ التنفيذ...':'Mark Paid'} disabled={busy||!targets.length||!session} onPress={()=>doBatch('Paid')}/>
   <Action compact secondary label="Mark Unpaid" disabled={busy||!targets.length||!session} onPress={()=>doBatch('Unpaid')}/>
   <Action compact secondary label="Mark Cancelled" disabled={busy||!targets.length||!session} onPress={()=>doBatch('Cancelled')}/>
   <Action compact secondary label="Duplicate Invoice" disabled={busy||!targets.length||!session} onPress={()=>doBatch('duplicate')}/>
   <Action compact secondary label="Send Reminder" disabled={busy||!targets.length||!session} onPress={()=>doBatch('reminder')}/>
   <Action compact secondary label="Delete • لوحة WHMCS" disabled={busy||!session} onPress={()=>void openAdmin()}/>
  </View>
  <T size={11} color={C.muted}>الحذف النهائي غير متاح عبر WHMCS External API؛ افتحه من لوحة الإدارة الموجودة بجلسة المتصفح. جميع إجراءات API تخضع لصلاحيات حسابك.</T>
  {busy?<T color={C.orange} size={12}>جارٍ التنفيذ تباعًا — لا تغلق الصفحة ولا تكرر العملية.</T>:null}
  {error?<T color={C.orange} size={12}>{error}</T>:null}
 </Card>;
}
