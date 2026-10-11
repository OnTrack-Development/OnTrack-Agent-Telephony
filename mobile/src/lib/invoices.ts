/** WHMCS's documented invoice API, with exact invoice-ID checks and form-encoded arrays. */
import type {Session,ApiResult} from '../types';
import {callApi,listOf} from './api';

export interface InvoiceLine {key:string;id:number|null;description:string;amount:string;taxed:boolean;removed:boolean}
export type InvoiceField='date'|'duedate'|'paymentmethod'|'notes'|'taxrate'|'taxrate2'|'credit';
export type InvoiceDraft=Record<InvoiceField,string>;
const s=(v:any)=>v===undefined||v===null?'':String(v);
const positiveId=(v:any)=>Number.isSafeInteger(Number(v))&&Number(v)>0?Number(v):0;
export function exactInvoice(data:any,id:number):boolean{
 return positiveId(data?.invoiceid??data?.id)===id && positiveId(data?.userid)>0;
}
export function readInvoiceLines(data:any):InvoiceLine[]{
 return listOf(data,'items','item').map((row:any,index:number)=>({
  key:'old-'+index,id:positiveId(row.id)||null,description:s(row.description),
  amount:s(row.amount),taxed:row.taxed===true||row.taxed===1||row.taxed==='1',
  removed:false
 }));
}
export function blankInvoiceDraft(data:any):InvoiceDraft{
 return {date:s(data.date),duedate:s(data.duedate),paymentmethod:s(data.paymentmethod),
  notes:s(data.notes),taxrate:s(data.taxrate),taxrate2:s(data.taxrate2),credit:s(data.credit)};
}
function amount(value:string,field:string,max=100000000):string{
 const v=value.trim();
 if(!/^\d+(?:\.\d{1,4})?$/.test(v)||!Number.isFinite(Number(v))||Number(v)>max)
  throw Error(field+' يجب أن يكون رقمًا موجبًا أو صفرًا صالحًا.');
 return v;
}
function validDate(value:string):boolean{
 if(!/^\d{4}-\d{2}-\d{2}$/.test(value))return false;
 const d=new Date(value+'T12:00:00Z');return Number.isFinite(d.getTime())&&d.toISOString().slice(0,10)===value;
}
function encodeLine(p:Record<string,string|number|boolean>,prefix:string,index:number,desc:string,value:string,taxed:boolean):void{
 if(!desc.trim()||desc.trim().length>2000)throw Error('وصف بند الفاتورة مطلوب وأقصاه 2000 حرف.');
 p[prefix+'description['+index+']']=desc.trim();
 p[prefix+'amount['+index+']']=amount(value,'قيمة البند');
 p[prefix+'taxed['+index+']]=taxed?1:0;
}
export function buildInvoiceUpdate(id:number,previous:any,draft:InvoiceDraft,lines:InvoiceLine[]):Record<string,string|number|boolean>{
 if(!positiveId(id)||!exactInvoice(previous,id))throw Error('لم يتم التحقق من الفاتورة ومالكها.');
 if(lines.length>100)throw Error('الحد الأقصى 100 بند.');
 const params:Record<string,string|number|boolean>={invoiceid:id};
 for(const field of Object.keys(draft) as InvoiceField[]){
  const value=draft[field].trim(),before=s(previous[field]).trim();
  if(value===before)continue;
  if(['date','duedate'].includes(field)&&!validDate(value))throw Error('تاريخ '+field+' غير صالح (YYYY-MM-DD).');
  if(['taxrate','taxrate2'].includes(field))params[field]=amount(value,'نسبة الضريبة',100);
  else if(field==='credit')params[field]=amount(value,'الرصيد المستخدم');
  else if(field==='paymentmethod'&&!/^[a-zA-Z0-9_-]{1,80}$/.test(value))throw Error('كود طريقة الدفع غير صالح.');
  else if(field==='notes'&&value.length>12000)throw Error('الملاحظات طويلة جدًا.');
  else params[field]=value;
 }
 const original=readInvoiceLines(previous),oldIds=new Map(original.filter(x=>x.id).map(x=>[x.id!,x]));
 const ids=new Set<number>();let removeIndex=0,newIndex=0;
 for(const line of lines){
  if(line.id!==null){
   if(!oldIds.has(line.id)||ids.has(line.id))throw Error('معرّف بند الفاتورة غير مطابق.');
   ids.add(line.id);
   if(line.removed){params['deletelineids['+(removeIndex++)+']']=line.id;continue;}
   const old=oldIds.get(line.id)!;
   if(line.description!==old.description||line.amount!==old.amount||line.taxed!==old.taxed)
    encodeLine(params,'item',line.id,line.description,line.amount,line.taxed);
  }else if(!line.removed){
   encodeLine(params,'newitem',newIndex++,line.description,line.amount,line.taxed);
  }
 }
 // Require all original IDs: prevents accidentally dropping a line that was not loaded.
 for(const old of original)if(old.id&&!ids.has(old.id))throw Error('بنود الفاتورة غير مكتملة. أعد تحميل الفاتورة.');
 if(Object.keys(params).length===1)throw Error('لم يتم تغيير أي بيانات.');
 return params;
}
export function buildDuplicateInvoice(source:any,id:number):Record<string,string|number|boolean>{
 if(!exactInvoice(source,id))throw Error('لم يتم التحقق من الفاتورة قبل النسخ.');
 const lines=readInvoiceLines(source);
 if(!lines.length||lines.some(l=>!l.description.trim()))throw Error('لا يمكن نسخ فاتورة بلا بنود صالحة.');
 const params:Record<string,string|number|boolean>={userid:Number(source.userid),sendinvoice:0,status:'Unpaid'};
 if(s(source.paymentmethod))params.paymentmethod=s(source.paymentmethod);
 for(let i=0;i<lines.length;i++)encodeLine(params,'item',i,lines[i]!.description,lines[i]!.amount,lines[i]!.taxed);
 return params;
}
export type InvoiceBulkAction='Paid'|'Unpaid'|'Cancelled'|'duplicate'|'reminder';
export interface InvoiceTarget {id:number;status:string}
export async function invoiceReminderTemplate(session:Session):Promise<string>{
 const r=await callApi(session,'GetEmailTemplates',{type:'invoice'});
 if(!r.ok||!r.data)throw Error(r.error||'تعذر جلب قوالب الفواتير.');
 const data:any=r.data;
 const templates=listOf(data,'emailtemplates','emailtemplate');
 const match=templates.find((t:any)=>/^Invoice Payment Reminder$/i.test(s(t.name).trim()))
  ||templates.find((t:any)=>/invoice.+(?:payment reminder|overdue|reminder)/i.test(s(t.name)));
 if(!match)throw Error('قالب تذكير الفواتير غير متاح ضمن قوالب الإيميل الحالية في WHMCS.');
 return s(match.name);
}
export async function executeInvoiceAction(session:Session,kind:InvoiceBulkAction,target:InvoiceTarget,reminderName?:string):Promise<ApiResult<any>>{
 if(!positiveId(target.id))return {ok:false,error:'رقم فاتورة غير صالح'};
 const checked=await callApi(session,'GetInvoice',{invoiceid:target.id});
 if(!checked.ok||!checked.data)return {ok:false,error:checked.error||'تعذر مراجعة الفاتورة'};
 const invoice:any=checked.data;
 if(!exactInvoice(invoice,target.id))return {ok:false,error:'WHMCS رجّع فاتورة أخرى أو بيانات ملكية غير كاملة'};
 const current=s(invoice.status).toLowerCase();
 if(kind==='reminder'){
  if(!['unpaid','payment pending','overdue'].includes(current))return {ok:false,error:'التذكير متاح فقط للفواتير غير المسددة'};
  if(!reminderName)return {ok:false,error:'قالب الإيميل لم يتم التحقق منه'};
  return callApi(session,'SendEmail',{messagename:reminderName,id:target.id});
 }
 if(kind==='duplicate'){
  try{return await callApi(session,'CreateInvoice',buildDuplicateInvoice(invoice,target.id));}
  catch(e){return {ok:false,error:e instanceof Error?e.message:'تعذر نسخ الفاتورة'};}
 }
 if(kind==='Paid'&&current==='paid'||kind==='Unpaid'&&current==='unpaid'||kind==='Cancelled'&&current==='cancelled')
  return {ok:true,data:{result:'success',unchanged:true}};
 if(kind==='Paid'&&current==='cancelled')return {ok:false,error:'لا يمكن تعليم فاتورة ملغاة كمدفوعة'};
 // A status change is NOT evidence of a settled transaction.
 return callApi(session,'UpdateInvoice',{invoiceid:target.id,status:kind});
}
