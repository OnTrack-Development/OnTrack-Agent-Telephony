import type {Session} from '../types';
import {callApi} from './api';

export const serviceFields=[
 ['pid','رقم الباقة'],['serverid','رقم السيرفر'],['domain','الدومين'],
 ['dedicatedip','عنوان IP المخصص'],['serviceusername','اسم المستخدم'],
 ['regdate','تاريخ التسجيل'],['nextduedate','الاستحقاق القادم'],['terminationdate','تاريخ الإنهاء'],
 ['firstpaymentamount','الدفعة الأولى'],['recurringamount','مبلغ التجديد'],
 ['billingcycle','دورة الفوترة'],['paymentmethod','كود وسيلة الدفع'],
 ['promoid','رقم العرض'],['status','حالة الخدمة'],['notes','ملاحظات الإدارة']
] as const;
export type ServiceField=typeof serviceFields[number][0];
export type ServiceDraft=Record<ServiceField,string>;
const str=(v:any)=>v===null||v===undefined?'':typeof v==='object'?'':String(v).trim();
const integer=(v:any)=>Number.isSafeInteger(Number(v))&&Number(v)>0?Number(v):0;
export function serviceOwner(d:any,id:number,clientId?:number):boolean{
 return integer(d?.id)===id&&integer(d?.clientid||d?.userid)>0&&
  (!clientId||integer(d.clientid||d.userid)===clientId);
}
export function serviceDraft(d:any):ServiceDraft{
 const value={} as ServiceDraft;
 for(const [field] of serviceFields)value[field]=str(field==='serviceusername'?d.username:d[field]);
 return value;
}
function dateOk(v:string):boolean{
 if(!/^\d{4}-\d{2}-\d{2}$/.test(v))return false;
 const d=new Date(v+'T12:00:00Z');return !Number.isNaN(d.valueOf())&&d.toISOString().slice(0,10)===v;
}
export function serviceUpdate(id:number,source:any,draft:ServiceDraft,clientId?:number):Record<string,string|number>{
 if(!serviceOwner(source,id,clientId))throw Error('بيانات الخدمة أو مالكها غير متطابقة.');
 const changed:Record<string,string|number>={serviceid:id};
 for(const [field] of serviceFields){
  const next=str(draft[field]),old=str(field==='serviceusername'?source.username:source[field]);
  if(next===old)continue;
  if(['pid','serverid','promoid'].includes(field)){
   if(!/^\d+$/.test(next)||Number(next)>100000000)throw Error('رقم '+field+' غير صالح');
   changed[field]=Number(next);continue;
  }
  if(['regdate','nextduedate','terminationdate'].includes(field)){
   if(next&&!dateOk(next))throw Error('التاريخ غير صالح: '+field);
   changed[field]=next;continue;
  }
  if(['firstpaymentamount','recurringamount'].includes(field)){
   if(!/^\d+(?:\.\d{1,4})?$/.test(next)||Number(next)>100000000)throw Error('المبلغ غير صالح');
  }
  if(field==='domain'&&next&&!/^(?=.{3,253}$)[a-z0-9][a-z0-9.-]*[a-z0-9]$/i.test(next))
   throw Error('الدومين غير صالح');
  if(field==='status'&&!['Pending','Active','Suspended','Terminated','Cancelled','Fraud','Completed'].includes(next))
   throw Error('حالة الخدمة غير مدعومة');
  if(field==='billingcycle'&&!['Free Account','One Time','One-Time','Monthly','Quarterly','Semi-Annually','Annually','Biennially','Triennially'].includes(next))
   throw Error('دورة الفوترة غير صالحة');
  if(field==='paymentmethod'&&!/^[a-z0-9_-]{1,80}$/i.test(next))throw Error('كود وسيلة الدفع غير صالح');
  if(field==='notes'&&next.length>4000)throw Error('الملاحظات أطول من المسموح');
  changed[field]=next;
 }
 if(Object.keys(changed).length===1)throw Error('لا توجد تغييرات للحفظ');
 return changed;
}
export type ModuleAction='ModuleCreate'|'ModuleSuspend'|'ModuleUnsuspend'|'ModuleTerminate'|'ModuleChangePackage';
export const moduleActions:ModuleAction[]=['ModuleCreate','ModuleSuspend','ModuleUnsuspend','ModuleTerminate','ModuleChangePackage'];
export async function executeModuleAction(session:Session,action:ModuleAction,id:number,expectedOwner:number){
 if(!moduleActions.includes(action)||!Number.isSafeInteger(id)||id<1)
  return {ok:false,error:'إجراء غير صالح'};
 // Guard against an action on a stale or cross-client service.
 const detail=await callApi(session,'GetClientsProducts',{serviceid:id,limitnum:2});
 if(!detail.ok)return detail;
 const products=(detail.data as any)?.products?.product;
 const rows=Array.isArray(products)?products:products?[products]:[];
 const service=rows.find((row:any)=>integer(row.id)===id);
 if(!service||!serviceOwner(service,id,expectedOwner))
  return {ok:false,error:'تعذر تأكيد ملكية الخدمة قبل تنفيذ الأمر'};
 return callApi(session,action,{serviceid:id});
}
