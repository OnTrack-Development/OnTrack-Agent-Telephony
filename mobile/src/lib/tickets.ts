/** Official WHMCS ticket API only. No fabricated assignments, statuses or signature. */
import {callApi,listOf} from './api';
import type {Session,Ticket} from '../types';
const str=(v:any)=>v===undefined||v===null?'':String(v);
const number=(v:any)=>Number(v)||0;
export type QueueKind='assigned'|'awaiting'|'allActive'|'answered'|'closed'|'all';
export interface TicketMessage {id:string;message:string;name:string;date:string;admin:boolean;note?:boolean;attachmentNames?:string[]}
export interface TicketCustomField {id:string;name:string;value:string}
export interface TicketReplyIdentity {clientId:number;contactId:number;name:string;email:string}
export interface TicketDetail extends TicketReplyIdentity {
  id:number;number:string;subject:string;customer:string;department:string;
  priority:string;status:string;flag:number;messages:TicketMessage[];notes:TicketMessage[];
  customFields:TicketCustomField[];customFieldsProvided:boolean;
}
export interface OperatorProfile {adminid:number;name:string;signature:string}
export interface TicketBatch {ok:boolean;tickets:Ticket[];total:number|null;error?:string}
export const isClosed=(status:string)=>/^(closed|مغلقة|مغلق|مقفولة|مقفول)$/i.test(status.trim());
export const isAnswered=(status:string)=>/^(answered|تم الرد|تم الرد عليها)$/i.test(status.trim());
export const isActionable=(status:string)=>!isClosed(status)&&!isAnswered(status);
export const ticketMatchesQueue=(status:string,kind:QueueKind):boolean=>{
 if(kind==='closed')return isClosed(status);
 if(kind==='answered')return isAnswered(status);
 if(kind==='all')return !isClosed(status);
 if(kind==='allActive')return !isClosed(status);
 return isActionable(status);
};
export const priorityColor=(priority:string)=>priority.toLowerCase()==='high'?'urgent':priority.toLowerCase()==='medium'?'normal':'low';
export function mapTicket(x:any):Ticket {
 return {
  id:number(x.id),number:str(x.tid||x.id),subject:str(x.subject||x.title)||'بدون موضوع',
  customer:str(x.requestor_name||x.name||x.owner_name||x.email||x.userid)||'غير معروف',
  department:str(x.deptname||x.department),priority:str(x.priority||x.urgency)||'Medium',
  status:str(x.status),updated:str(x.lastreply||x.date),
  flag:number(x.flag),assignedName:str(x.flagname||x.assignedname),replyCount:x.replies!==undefined?number(x.replies):null
 };
}
const total=(d:any):number|null=>d?.totalresults!==undefined&&Number.isFinite(Number(d.totalresults))?Number(d.totalresults):null;
export async function fetchTicketQueue(session:Session,kind:QueueKind,start=0,limit=50):Promise<TicketBatch> {
 const statuses:Record<QueueKind,string>={assigned:'My Flagged Tickets',awaiting:'Awaiting Reply',allActive:'All Active Tickets',answered:'Answered',closed:'Closed',all:''};
 const res=await callApi(session,'GetTickets',{status:statuses[kind]||undefined,limitstart:start,limitnum:limit});
 if(!res.ok)return {ok:false,tickets:[],total:null,error:res.error};
 const d:any=res.data;
 if(d?.tickets===undefined&&total(d)!==0)return {ok:false,tickets:[],total:null,error:'WHMCS أرجع قائمة تذاكر غير متوقعة'};
 const tickets=listOf(d,'tickets','ticket').map(mapTicket).filter(t=>t.id>0);
 // Never mix an agent's completed replies or closed tickets into the default work queues.
 return {ok:true,tickets:tickets.filter(t=>ticketMatchesQueue(t.status,kind)),total:total(d)};
}
export async function fetchOperatorProfile(session:Session):Promise<OperatorProfile|null>{
 const r=await callApi(session,'GetAdminDetails');
 if(!r.ok||!r.data)return null;
 const d:any=r.data;
 return {adminid:number(d.adminid),name:str(d.name),signature:str(d.signature)};
}
function attachmentNames(value:any):string[] {
 if(!Array.isArray(value))return [];
 return value.filter((v:any)=>v&&typeof v==='object'&&typeof v.filename==='string').map((v:any)=>String(v.filename));
}
/** Some WHMCS installations enhance GetTicket with custom fields.
 * The official WHMCS GetTicket endpoint does not guarantee these values. */
export function parseTicketCustomFields(input:any):TicketCustomField[] {
 const source=Array.isArray(input)?input:input?.customfield??input?.field??input;
 const items=Array.isArray(source)?source:
  source&&typeof source==='object'&&('value' in source||'fieldvalue' in source)?[source]:
  source&&typeof source==='object'?Object.entries(source).map(([key,value])=>
   value&&typeof value==='object'?{id:key,...value}:{id:key,name:key,value}
  ):[];
 return items.map((field:any,index:number)=>({
  id:str(field.id??field.fieldid??index),
  name:str(field.name??field.fieldname??field.label??field.title??('حقل '+(index+1))).trim(),
  value:str(field.value??field.fieldvalue??field.val).trim()
 })).filter(field=>field.name&&field.value&&
  !/password|secret|private.?key|token|كلمة.?المرور|كود.?سري/i.test(field.name));
}
export function normalizeTicketThread(d:any):TicketDetail {
 const base:any=d||{};
 const raw=Array.isArray(base.replies?.reply)?base.replies.reply:base.replies?.reply?[base.replies.reply]:[];
 const messages:TicketMessage[]=raw.map((x:any,i:number)=>({
  id:str(x.replyid??x.id??i),message:str(x.message),
  name:str(x.requestor_name||x.name||x.admin||x.requestor_email)||'غير معروف',
  date:str(x.date),admin:Boolean(str(x.admin)),
  attachmentNames:attachmentNames(x.attachments)
 }));
 // WHMCS GetTicket includes the original message as replyid=0 in many installs.
 // Add top-level message only if it isn't already returned with replies.
 const initial=str(base.message);
 if(initial&&!messages.some(x=>x.message.trim()===initial.trim()))
  messages.unshift({id:'initial',message:initial,name:str(base.requestor_name||base.name),date:str(base.date),admin:false});
 const n=Array.isArray(base.notes?.note)?base.notes.note:base.notes?.note?[base.notes.note]:[];
 const notes=n.map((x:any,i:number)=>({
  id:'note-'+str(x.noteid||i),message:str(x.message),name:str(x.admin)||'ملاحظة داخلية',
  date:str(x.date),admin:true,note:true,attachmentNames:attachmentNames(x.attachments)
 }));
 return {
  id:number(base.ticketid||base.id),number:str(base.tid||base.ticketid),
  subject:str(base.subject),customer:str(base.requestor_name||base.name||base.email),
  department:str(base.deptname),priority:str(base.priority),status:str(base.status),
  flag:number(base.flag),messages,notes,
  clientId:number(base.userid||base.clientid),
  contactId:number(base.contactid),
  name:str(base.requestor_name||base.name).trim(),
  email:str(base.requestor_email||base.email).trim(),
  customFieldsProvided:base.customfields!==undefined||base.ticket_custom_fields!==undefined,
  customFields:parseTicketCustomFields(base.customfields??base.ticket_custom_fields)
 };
}
export async function fetchTicketDetail(session:Session,id:number):Promise<{ok:boolean;detail?:TicketDetail;error?:string}>{
 const r=await callApi(session,'GetTicket',{ticketid:id,repliessort:'ASC'});
 if(!r.ok||!r.data)return {ok:false,error:r.error||'تعذر قراءة التذكرة'};
 return {ok:true,detail:normalizeTicketThread(r.data)};
}
export async function changeTicket(session:Session,id:number,field:'status'|'priority',value:string){
 if(!Number.isSafeInteger(id)||id<=0||!value.trim())return {ok:false,error:'طلب تعديل غير صالح'};
 return callApi(session,'UpdateTicket',{ticketid:id,[field]:value});
}
export async function fetchSupportStatuses(session:Session):Promise<string[]>{
 const r=await callApi(session,'GetSupportStatuses');
 if(!r.ok||!r.data)return ['Open','Customer-Reply','Answered','Closed'];
 const a:any=r.data;
 const statuses=listOf(a,'statuses','status');
 return [...new Set(['Open','Customer-Reply','Answered','Closed',...statuses.map((x:any)=>str(x.title||x.status)).filter(Boolean)])];
}
export function signatureText(input:string):string{
 return input.replace(/<br\s*\/?\s*>/gi,'\n').replace(/<\/p>/gi,'\n')
   .replace(/<[^>]*>/g,'').replace(/&nbsp;/gi,' ').replace(/&amp;/gi,'&')
   .replace(/&lt;/gi,'<').replace(/&gt;/gi,'>').trim();
}
export function replyWithSignature(message:string,signature:string,enabled:boolean):string {
 const body=message.trim(),raw=signature.trim(),tail=signatureText(signature);
 if(!body||!raw||!tail||!enabled||body.endsWith(raw)||body.endsWith(tail))return body;
 // Preserve the HTML signature saved in WHMCS when sending; preview remains plain text.
 return body+'\n\n'+raw;
}
