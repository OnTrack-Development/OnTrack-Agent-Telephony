/** Direct integration with WHMCS's documented External API; NO addon/gateway/WebView. */
import * as SecureStore from 'expo-secure-store';
import {md5} from 'js-md5';
import type {ApiResult,DemoState,Session,Ticket,Client,Invoice,Service,Order,Domain} from '../types';

const STORAGE_KEY='ontrack-command-direct-v2';
const TIMEOUT_MS=18000;
export function validateBaseUrl(value:string):string {
 const u=new URL(value.trim());
 if(u.protocol!=='https:'||!u.hostname||u.username||u.password||u.search||u.hash||u.port&&u.port!=='443')throw Error('اكتب رابط HTTPS الصحيح بدون كلمة مرور أو معاملات إضافية');
 if(/\/includes\/api\.php\/?$/.test(u.pathname))u.pathname=u.pathname.replace(/\/includes\/api\.php\/?$/,'');
 if(/\/modules\//.test(u.pathname))throw Error('اكتب رابط WHMCS الرئيسي فقط');
 return `${u.origin}${u.pathname.replace(/\/+$/,'')}`;
}
export const apiEndpoint=(base:string)=>`${validateBaseUrl(base)}/includes/api.php`;
const toArray=(v:any):any[]=>Array.isArray(v)?v:v&&typeof v==='object'?[v]:[];
export const listOf=(res:any,container:string,singular:string):any[]=>toArray(res?.[container]?.[singular]);
const s=(v:any)=>v===null||v===undefined?'':String(v);
const n=(v:any)=>Number(v)||0;
const redact=(msg:string)=>msg.replace(/(password|secret|accesskey|identifier|token)\s*[=:]\s*[^\s,;&]+/gi,'$1=[REDACTED]');

export async function callApi<T=any>(session:Session,action:string,params:Record<string,string|number|boolean|undefined>={}):Promise<ApiResult<T>>{
 const body=new URLSearchParams();
 const pass=session.mode==='admin'?md5(session.password):session.secret;
 const username=session.mode==='admin'?session.username:session.identifier;
 body.set('username',username);body.set('password',pass);body.set('responsetype','json');
 if(session.mode==='admin'&&session.accessKey)body.set('accesskey',session.accessKey);
 body.set('action',action);
 Object.entries(params).forEach(([k,v])=>{if(v!==undefined)body.set(k,String(v));});
 const controller=new AbortController();const timeout=setTimeout(()=>controller.abort(),TIMEOUT_MS);
 try{
  const response=await fetch(apiEndpoint(session.baseUrl),{method:'POST',headers:{'Accept':'application/json','Content-Type':'application/x-www-form-urlencoded'},body:body.toString(),signal:controller.signal});
  const raw=await response.text();
  if(!response.ok)return {ok:false,code:`HTTP_${response.status}`,error:`WHMCS HTTP ${response.status}`};
  let json:any;try{json=JSON.parse(raw);}catch{return {ok:false,code:'INVALID_JSON',error:'WHMCS لم يرجع JSON صالح. راجع رابط التثبيت و WAF.'};}
  if(json?.result!=='success')return {ok:false,code:'WHMCS_ERROR',error:redact(s(json?.message||json?.error||'WHMCS رفض العملية')).slice(0,240)};
  return {ok:true,data:json as T};
 }catch(e){return {ok:false,code:'NETWORK_ERROR',error:e instanceof Error?redact(e.message):'خطأ اتصال'};}
 finally{clearTimeout(timeout);}
}
export async function connect(data:Session):Promise<ApiResult<Session>>{
 const session={...data,baseUrl:validateBaseUrl(data.baseUrl)};
 if(!session.baseUrl||!(session.mode==='admin'?session.username&&session.password:session.identifier&&session.secret))return {ok:false,error:'بيانات الدخول غير مكتملة'};
 // API Roles must grant GetClients for this baseline. Never bypass permissions.
 const check=await callApi(session,session.mode==='admin'?'GetAdminDetails':'GetClients',session.mode==='admin'?{}:{limitnum:1});
 if(!check.ok)return {ok:false,error:check.error,code:check.code};
 await SecureStore.setItemAsync(STORAGE_KEY,JSON.stringify(session),{keychainAccessible:SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY});
 return {ok:true,data:session};
}
export async function loadSession():Promise<Session|null>{
 const value=await SecureStore.getItemAsync(STORAGE_KEY);if(!value)return null;
 try{const parsed=JSON.parse(value) as Session;return parsed?.mode&&parsed?.baseUrl?parsed:null;}catch{return null;}
}
export async function signOut():Promise<void>{await SecureStore.deleteItemAsync(STORAGE_KEY);}
export type SectionKey = 'tickets'|'clients'|'invoices'|'services'|'orders'|'domains';
const sections:Record<SectionKey,string>={tickets:'GetTickets',clients:'GetClients',invoices:'GetInvoices',services:'GetClientsProducts',orders:'GetOrders',domains:'GetClientsDomains'};
const strStatus=(v:any)=>s(v||'Unknown');
const validTotal=(v:any):number|null=>v!==undefined&&v!==null&&v!==''&&Number.isFinite(Number(v))&&Number(v)>=0?Number(v):null;
export async function loadPage(session:Session,key:SectionKey,start=0,limit=50):Promise<{ok:boolean,records:any[],total:number|null,error?:string}>{
 const r=await callApi(session,sections[key],{limitstart:start,limitnum:limit});
 if(!r.ok)return {ok:false,records:[],total:null,error:r.error||'تعذر قراءة بيانات WHMCS'};
 const d=r.data as any;
 const wrappers:Record<SectionKey,[string,string]>={tickets:['tickets','ticket'],clients:['clients','client'],invoices:['invoices','invoice'],services:['products','product'],orders:['orders','order'],domains:['domains','domain']};
 const [root,item]=wrappers[key];
 const total=validTotal(d?.totalresults);
 if(d?.[root]===undefined && total!==0)return {ok:false,records:[],total:null,error:`WHMCS رجّع بيانات غير متوقعة لقسم ${key}، ولم يتم تعويضها ببيانات وهمية`};
 const raw=listOf(d,root,item);
 const records=raw.map((x:any)=>{
  if(key==='tickets')return {id:n(x.id),number:s(x.tid||x.id),subject:s(x.title||x.subject)||'بدون موضوع',customer:s(x.name||x.email||x.userid)||'غير متاح',department:s(x.deptname||x.department),priority:s(x.urgency||x.priority),status:strStatus(x.status),updated:s(x.lastreply||x.date),message:s(x.message)} as Ticket;
  if(key==='clients')return {id:n(x.id),name:s(x.companyname||`${s(x.firstname)} ${s(x.lastname)}`.trim()),email:s(x.email),status:strStatus(x.status),services:n(x.productsnum),initials:s(x.firstname||x.companyname).slice(0,2)} as Client;
  if(key==='invoices')return {id:n(x.id),customer:s(x.firstname||x.userid),amount:n(x.total),currency:s(x.currencycode||x.currency||''),status:strStatus(x.status),due:s(x.duedate)} as Invoice;
  if(key==='services')return {id:n(x.id),domain:s(x.domain),customer:s(x.clientid),plan:s(x.name||x.productname),status:strStatus(x.status),renewal:s(x.nextduedate)} as Service;
  if(key==='orders')return {id:n(x.id),customer:s(x.userid||x.clientname),product:s(x.names||x.lineitems||'طلب'),amount:n(x.amount),status:strStatus(x.status),created:s(x.date)} as Order;
  return {id:n(x.id),name:s(x.domainname||x.domain),customer:s(x.userid),expiry:s(x.expirydate||x.nextduedate),status:strStatus(x.status)} as Domain;
 });
 return {ok:true,records,total};
}
export async function loadOverview(session:Session):Promise<{state:DemoState,errors:Record<string,string>,capabilities:Record<string,boolean>,totals:Record<string,number|null>}>{
 const keys=Object.keys(sections) as SectionKey[];
 const results=await Promise.all(keys.map(async key=>[key,await loadPage(session,key)] as const));
 const state:DemoState={tickets:[],clients:[],invoices:[],services:[],orders:[],domains:[],chats:[],agents:[],queue:[]};
 const errors:Record<string,string>={},capabilities:Record<string,boolean>={},totals:Record<string,number|null>={};
 for(const [key,result] of results){capabilities[`${key}.read`]=result.ok;totals[key]=result.total;if(!result.ok){errors[key]=result.error||'غير متاح';continue;}(state as any)[key]=result.records;}
 // Do not infer action rights from read rights. WHMCS enforces AddTicketReply server-side after explicit confirmation.
 capabilities['tickets.reply']=false;
 return {state,errors,capabilities,totals};
}
export async function getTicketThread(session:Session,id:number):Promise<ApiResult<any>>{return callApi(session,'GetTicket',{ticketid:id});}
export async function replyToTicket(session:Session,id:number,message:string):Promise<ApiResult<any>>{
 if(!Number.isSafeInteger(id)||id<1||!message.trim()||message.length>30000)return {ok:false,error:'رقم التذكرة أو نص الرد غير صالح'};
 return callApi(session,'AddTicketReply',{ticketid:id,message:message.trim()});
}
