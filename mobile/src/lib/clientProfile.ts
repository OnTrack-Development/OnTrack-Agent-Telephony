import {callApi,listOf} from './api';
import type {ApiResult,Client,Session} from '../types';
import {readClientCredit, type ClientCreditBalance} from './clientCredit';

export type ClientTab='overview'|'services'|'domains'|'invoices'|'tickets'|'orders'|'contacts'|'emails'|'quotes'|'transactions';
export interface ProfileField {label:string;value:string}
export interface ClientSummary {
 id:number;title:string;status:string;fields:ProfileField[];billing:ProfileField[];
 services:ProfileField[];other:ProfileField[];notes:string;custom:ProfileField[];
 creditBalance:ClientCreditBalance|null;
}
export interface ClientTabResult {records:Record<string,unknown>[];total:number|null;error?:string;}
const str=(value:unknown):string=>value===undefined||value===null||typeof value==='object'?'':String(value).trim();
const number=(value:unknown):number=>Number(value)||0;
const safe=(value:unknown):boolean=>str(value)!==''&&!/^(undefined|null)$/i.test(str(value));
const mapFields=(source:Record<string,unknown>,map:[string,string][]):ProfileField[]=>map
 .map(([key,label])=>({label,value:str(source[key])})).filter(({value})=>safe(value));
const allowedCustom=(name:string)=>!/password|secret|auth|token|private.?key|كلمة السر|كلمة المرور/i.test(name);
export function normalizeClientDetails(response:any,fallback:Client):ClientSummary {
 const d=(response?.client||response||{}) as Record<string,any>;
 const stats=(response?.stats||d.stats||{}) as Record<string,unknown>;
 const userId=number(d.id||d.userid||d.client_id);
 if(userId!==fallback.id)throw new Error('WHMCS أرجع بيانات عميل مختلف عن المطلوب');
 const title=[str(d.firstname),str(d.lastname)].filter(Boolean).join(' ')||fallback.name;
 const standard=mapFields(d,[
  ['companyname','الشركة'],['email','البريد الإلكتروني'],
  ['phonenumber','الهاتف'],['datecreated','تاريخ الانضمام']
 ]);
 // Compact summary: do not repeat invoice totals in three different groups,
 // nor display currency IDs, marketing flags and irrelevant internal fields.
 const billing=mapFields(stats,[
  ['numunpaidinvoices','فواتير غير مدفوعة'],
  ['unpaidinvoicesamount','إجمالي المستحق'],
  ['numoverdueinvoices','فواتير متأخرة']
 ]);
 const services=mapFields(stats,[
  ['productsnumactive','الخدمات النشطة'],
  ['numactivedomains','الدومينات النشطة'],
  ['numactivetickets','التذاكر المفتوحة']
 ]);
 const other=mapFields(d,[
  ['address1','العنوان'],['city','المدينة'],['state','المحافظة'],
  ['countryname','الدولة'],['tax_id','الرقم الضريبي']
 ]);
 let creditBalance:ClientCreditBalance|null=null;
 try{creditBalance=readClientCredit(response,userId);}catch{}
 const source=d.customfields?.customfield||d.customfields||[];
 const customs=Array.isArray(source)?source:typeof source==='object'?Object.values(source):[];
 const custom=customs.map((item:any)=>({label:str(item?.name||item?.fieldname),value:str(item?.value||item?.fieldvalue)}))
  .filter(f=>safe(f.value)&&safe(f.label)&&allowedCustom(f.label));
 return {id:userId,title,status:str(d.status)||fallback.status,fields:standard,billing,services,other,
  notes:str(d.notes),custom,creditBalance};
}
const tabs:Record<Exclude<ClientTab,'overview'>,{action:string;args:(id:number)=>Record<string,number>;root:string;singular:string}>={
 services:{action:'GetClientsProducts',args:clientid=>({clientid,limitnum:35}),root:'products',singular:'product'},
 domains:{action:'GetClientsDomains',args:clientid=>({clientid,limitnum:35}),root:'domains',singular:'domain'},
 invoices:{action:'GetInvoices',args:userid=>({userid,limitnum:35}),root:'invoices',singular:'invoice'},
 tickets:{action:'GetTickets',args:clientid=>({clientid,limitnum:35}),root:'tickets',singular:'ticket'},
 orders:{action:'GetOrders',args:userid=>({userid,limitnum:35}),root:'orders',singular:'order'},
 contacts:{action:'GetContacts',args:userid=>({userid,limitnum:35}),root:'contacts',singular:'contact'},
 emails:{action:'GetEmails',args:clientid=>({clientid,limitnum:35}),root:'emails',singular:'email'},
 quotes:{action:'GetQuotes',args:userid=>({userid,limitnum:35}),root:'quotes',singular:'quote'},
 transactions:{action:'GetTransactions',args:clientid=>({clientid}),root:'transactions',singular:'transaction'}
};
export async function fetchClientSummary(session:Session,client:Client):Promise<ApiResult<ClientSummary>>{
 const r=await callApi(session,'GetClientsDetails',{clientid:client.id,stats:true});
 if(!r.ok)return {ok:false,error:r.error,code:r.code};
 try{return {ok:true,data:normalizeClientDetails(r.data,client)};}
 catch(e){return {ok:false,error:e instanceof Error?e.message:'فشل التحقق من بيانات العميل'};}
}
export async function fetchClientTab(session:Session,clientId:number,tab:Exclude<ClientTab,'overview'>):Promise<ApiResult<ClientTabResult>>{
 if(!Number.isSafeInteger(clientId)||clientId<1)return {ok:false,error:'رقم العميل غير صالح'};
 const t=tabs[tab];
 const r=await callApi(session,t.action,t.args(clientId));
 if(!r.ok)return {ok:false,error:r.error,code:r.code};
 const d:any=r.data||{};
 const records=listOf(d,t.root,t.singular) as Record<string,unknown>[];
 const checked=records.filter(row=>{
  const owner=number(row.userid||row.clientid);
  return owner===clientId; // Do not display records without verified ownership.
 });
 if(checked.length!==records.length)return {ok:false,error:'تعذر التحقق من ملكية بعض سجلات WHMCS لهذا العميل؛ تم منع عرضها حفاظًا على خصوصية العملاء'};
 return {ok:true,data:{records:checked,total:Number.isFinite(Number(d.totalresults))?Number(d.totalresults):null}};
}
