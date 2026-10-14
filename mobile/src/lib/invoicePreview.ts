/** Read-only invoice line preview; never fabricate product names from invoice totals. */
import type {Session,Invoice} from '../types';
import {callApi} from './api';
import {exactInvoice,readInvoiceLines} from './invoices';

export interface InvoiceCardPreview {kind:'ready'|'empty'|'error';label:string;otherCount?:number}
function clean(description:string):string{
 return description.replace(/<[^>]*>/g,' ')
  .replace(/&(amp|lt|gt|quot|apos|nbsp|#39);/gi,(value,entity:string)=>{
   const names:Record<string,string>={amp:'&',lt:'<',gt:'>',quot:'"',apos:"'",nbsp:' ', '#39':"'"};
   return names[entity.toLowerCase()]||value;
  }).replace(/[\r\n\t ]+/g,' ').trim().slice(0,220);
}
export function parseInvoiceCardPreview(detail:any,invoice:Pick<Invoice,'id'|'clientId'>):InvoiceCardPreview{
 if(!Number.isSafeInteger(invoice.id)||invoice.id<=0||!exactInvoice(detail,invoice.id))
  return {kind:'error',label:''};
 const owner=Number(detail.userid);
 if(invoice.clientId&&Number.isSafeInteger(invoice.clientId)&&invoice.clientId>0&&owner!==invoice.clientId)
  return {kind:'error',label:''}; // Customer mismatch: do not expose any item descriptions.
 const lines=readInvoiceLines(detail).filter(x=>!x.removed).map(x=>clean(x.description)).filter(Boolean);
 if(!lines.length)return {kind:'empty',label:''};
 return {kind:'ready',label:lines[0]!,otherCount:Math.max(0,lines.length-1)};
}
export async function loadInvoiceCardPreview(session:Session,invoice:Invoice):
 Promise<{preview:InvoiceCardPreview;rateLimited:boolean}>{
 if(!Number.isSafeInteger(invoice.id)||invoice.id<=0)return {preview:{kind:'error',label:''},rateLimited:false};
 const result=await callApi(session,'GetInvoice',{invoiceid:invoice.id});
 if(!result.ok)return {preview:{kind:'error',label:''},rateLimited:result.code==='HTTP_429'};
 return {preview:parseInvoiceCardPreview(result.data,invoice),rateLimited:false};
}
