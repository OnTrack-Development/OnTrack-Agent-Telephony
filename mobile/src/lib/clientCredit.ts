/** Client account credit ledger (not an invoice payment).
 * Only WHMCS AddCredit mutates the balance. No automatic retry on any
 * ambiguous HTTP/timeout response: the money entry may already be posted.
 */
import type {ApiResult,Session} from '../types';
import {callApi,callApiFresh} from './api';

export interface ClientCreditBalance {
 clientId:number;amount:number;currency:string;status:string;
}
function money(value:unknown):number|null{
 if(typeof value!=='string'&&typeof value!=='number')return null;
 const raw=String(value).trim();
 if(!/^-?\d+(?:\.\d{1,4})?$/.test(raw))return null;
 const parsed=Number(raw);
 return Number.isFinite(parsed)&&Math.abs(parsed)<=1e12?parsed:null;
}
export function readClientCredit(document:any,expectedId:number):ClientCreditBalance {
 const client=document?.client;
 if(!client||typeof client!=='object'||!Number.isSafeInteger(expectedId)||expectedId<=0)
  throw Error('تعذر تأكيد حساب العميل.');
 const actualId=Number(client.id??client.userid??client.client_id??0);
 if(actualId!==expectedId)throw Error('تم رفض قراءة رصيد عميل مختلف.');
 const amount=money(client.credit);
 if(amount===null||amount<0)throw Error('رصيد العميل غير متاح بشكل موثوق من WHMCS.');
 const currency=String(client.currency_code||'').trim().toUpperCase();
 if(!/^[A-Z]{3}$/.test(currency))throw Error('عملة العميل غير متاحة؛ لن ننفذ إضافة رصيد بعملة غير مؤكدة.');
 return {clientId:expectedId,amount,currency,status:String(client.status||'')};
}
export function parseCreditAmount(raw:string):number{
 const value=raw.trim();
 if(!/^\d{1,7}(?:\.\d{1,2})?$/.test(value))throw Error('اكتب مبلغًا موجبًا بحد أقصى منزلتين عشريتين.');
 const amount=Number(value);
 if(!Number.isFinite(amount)||amount<0.01||amount>1000000)
  throw Error('المبلغ المسموح من 0.01 إلى 1,000,000 بعملة العميل.');
 return amount;
}
export function validateCreditDescription(raw:string,operation:'add'|'remove'='add'):string{
 const description=raw.trim().replace(/\s+/g,' ');
 if(description.length<3||description.length>240)
  throw Error('اكتب سبب '+(operation==='remove'?'خصم':'إضافة')+' الرصيد (من 3 إلى 240 حرفًا) لتوثيقه في WHMCS.');
 return description;
}
export function formatClientBalance(balance:Pick<ClientCreditBalance,'amount'|'currency'>):string{
 return balance.amount.toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:4})+' '+balance.currency;
}
export async function fetchVerifiedCredit(session:Session,clientId:number):Promise<ApiResult<ClientCreditBalance>>{
 if(!Number.isSafeInteger(clientId)||clientId<1)return {ok:false,error:'رقم العميل غير صالح.'};
 const result=await callApiFresh(session,'GetClientsDetails',{clientid:clientId,stats:false});
 if(!result.ok)return {ok:false,code:result.code,error:result.error};
 try{return {ok:true,data:readClientCredit(result.data,clientId)};}
 catch(e){return {ok:false,error:e instanceof Error?e.message:'تعذر التأكد من رصيد العميل'};}
}

export type CreditOperation='add'|'remove';
/** Record manual account-credit adjustments, never as invoice payments.
 * WHMCS expects positive AddCredit.amount for BOTH add and remove.
 * This preflight is read-fresh and the server applies final authorization.
 */
export async function changeClientCredit(
 session:Session,clientId:number,amountRaw:string,descriptionRaw:string,
 expectedCurrency:string,operation:CreditOperation,expectedBalance?:number
):Promise<ApiResult<{newBalance:number;currency:string}>>{
 if(operation!=='add'&&operation!=='remove')
  return {ok:false,error:'نوع إجراء الرصيد غير مدعوم'};
 let amount:number,description:string;
 try{amount=parseCreditAmount(amountRaw);description=validateCreditDescription(descriptionRaw,operation);}
 catch(e){return {ok:false,error:e instanceof Error?e.message:'قيمة غير صالحة'};}
 // A fresh GetClientsDetails bypasses cached customer data. Other financial
 // operations may have changed this client's credit since it was displayed.
 const verified=await fetchVerifiedCredit(session,clientId);
 if(!verified.ok||!verified.data)return {ok:false,error:verified.error||'تعذر التحقق من العميل',code:verified.code};
 if(verified.data.currency!==expectedCurrency)
  return {ok:false,error:'عملة العميل تغيّرت. حدّث البيانات وأعد التأكيد.'};
 if(operation==='remove'){
  if(typeof expectedBalance!=='number'||!Number.isFinite(expectedBalance)||expectedBalance<0)
   return {ok:false,error:'حدّث رصيد العميل أولًا قبل الخصم.'};
  if(Math.abs(verified.data.amount-expectedBalance)>0.00009)
   return {ok:false,error:'رصيد العميل تغيّر منذ عرضه. حدّث الرصيد وأعد التأكيد قبل الخصم.'};
  // Numeric compare with 4-decimal precision (WHMCS may expose fractions).
  if(Math.round(amount*10000)>Math.round(verified.data.amount*10000))
   return {ok:false,error:'قيمة الخصم أكبر من الرصيد المتاح. لا يمكن أن يصبح الرصيد سالبًا.'};
 }
 const response=await callApi(session,'AddCredit',{
  clientid:clientId,description,amount:amount.toFixed(2),type:operation
 });
 if(!response.ok)return {ok:false,code:response.code,error:
  /NETWORK_ERROR|HTTP_5|INVALID_JSON/i.test(response.code||'')
   ?'نتيجة '+(operation==='remove'?'خصم':'إضافة')+' الرصيد غير مؤكدة بسبب الاتصال. راجع سجل الرصيد في WHMCS قبل أي محاولة أخرى؛ لا تكرر العملية.'
   :response.error||'رفض WHMCS تعديل الرصيد'};
 const newBalance=money((response.data as any)?.newbalance);
 if(newBalance===null||newBalance<0)return {ok:false,error:
  'WHMCS أكد العملية لكن تعذرت قراءة الرصيد الجديد؛ راجع سجل العميل ولا تُكرر الإجراء.'};
 return {ok:true,data:{newBalance,currency:verified.data.currency}};
}
export async function addClientCredit(
 session:Session,clientId:number,amountRaw:string,descriptionRaw:string,expectedCurrency:string
):Promise<ApiResult<{newBalance:number;currency:string}>>{
 return changeClientCredit(session,clientId,amountRaw,descriptionRaw,expectedCurrency,'add');
}
export async function removeClientCredit(
 session:Session,clientId:number,amountRaw:string,descriptionRaw:string,
 expectedCurrency:string,expectedBalance:number
):Promise<ApiResult<{newBalance:number;currency:string}>>{
 return changeClientCredit(session,clientId,amountRaw,descriptionRaw,expectedCurrency,'remove',expectedBalance);
}
