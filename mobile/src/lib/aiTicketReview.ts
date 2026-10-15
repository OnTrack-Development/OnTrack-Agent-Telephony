/** Verified, read-only review of the last public WHMCS ticket reply.
 * Never infer author from ticket status, a bot-like message, or the customer's name.
 */
import type {Session,Ticket} from '../types';
import {callApi} from './api';
import {isClosed} from './tickets';

export interface AiReviewedTicket {
 ticket:Ticket;
 author:string;
 message:string;
 date:string;
 transferMentioned:boolean;
}
export type AiTicketCheck={kind:'match';review:AiReviewedTicket}|{kind:'skip'}|{kind:'error';message:string;rateLimited:boolean};

export interface AiAdminUser {
 id:number;username:string;fullName:string;disabled:boolean;ambiguousFullName:boolean;source?:'directory'|'reply';
}
const normalized=(value:string)=>value.trim().replace(/\s+/g,' ').toLocaleLowerCase('en-US');
export function parseAiAdminUsers(data:any):AiAdminUser[]{
 const source=data?.admin_users;
 if(!Array.isArray(source))return [];
 const users=source.map((row:any)=>{
  const id=Number(row?.id);
  const username=String(row?.username||'').trim();
  const fullName=String(row?.fullName||[row?.firstname,row?.lastname].filter(Boolean).join(' ')||username).trim();
  return {id,username,fullName,disabled:row?.isDisabled===1||row?.isDisabled==='1',ambiguousFullName:false,source:'directory' as const};
 }).filter((user:AiAdminUser)=>Number.isSafeInteger(user.id)&&user.id>0&&user.username.length>0);
 const names=new Map<string,number>();
 for(const user of users)names.set(normalized(user.fullName),(names.get(normalized(user.fullName))||0)+1);
 return users.map((user:AiAdminUser)=>({...user,ambiguousFullName:(names.get(normalized(user.fullName))||0)>1}))
  .sort((a:AiAdminUser,b:AiAdminUser)=>a.fullName.localeCompare(b.fullName,'ar'));
}
export async function fetchAiAdminUsers(session:Session):Promise<{ok:boolean;users:AiAdminUser[];error?:string}>{
 const r=await callApi(session,'GetAdminUsers',{include_disabled:true});
 if(!r.ok||!r.data)return {ok:false,users:[],error:r.error||'لا تملك صلاحية GetAdminUsers'};
 if(!Array.isArray((r.data as any).admin_users))return {ok:false,users:[],error:'WHMCS لم يرجع قائمة موظفين صالحة'};
 return {ok:true,users:parseAiAdminUsers(r.data)};
}
/**
 * Fallback for WHMCS API users who can read tickets but not GetAdminUsers.
 * Only replies with a non-empty WHMCS 'admin' field are candidates.
 * No customer name or inferred AI username is ever introduced.
 */
export function observedAdminResponders(data:any,expectedTicketId:number):AiAdminUser[]{
 const id=Number(data?.ticketid??data?.id??0);
 if(!Number.isSafeInteger(id)||id!==expectedTicketId)return [];
 const raw=data?.replies?.reply;
 const replies=Array.isArray(raw)?raw:raw&&typeof raw==='object'?[raw]:[];
 const unique=new Map<string,AiAdminUser>();
 for(const reply of replies){
  if(!reply||typeof reply!=='object'||typeof reply.message!=='string')continue;
  const name=String(reply.admin||reply.adminname||'').trim().replace(/\s+/g,' ');
  // No fallback to requestor_name/name: those fields may identify a customer.
  if(!name||name.length>100)continue;
  const staffId=Number(reply.adminid??reply.admin_id??0);
  const validId=Number.isSafeInteger(staffId)&&staffId>0?staffId:0;
  const key=validId?'id:'+validId:'name:'+normalized(name);
  if(!unique.has(key))unique.set(key,{id:validId,username:name,fullName:name,
   disabled:false,ambiguousFullName:false,source:'reply'});
 }
 return [...unique.values()];
}
export async function fetchObservedResponders(session:Session,ticket:Ticket):
 Promise<{users:AiAdminUser[];error?:string;rateLimited:boolean}>{
 if(!Number.isSafeInteger(ticket.id)||ticket.id<=0)return {users:[],rateLimited:false};
 const result=await callApi(session,'GetTicket',{ticketid:ticket.id,repliessort:'ASC'});
 if(!result.ok||!result.data)return {users:[],error:result.error||'تعذر قراءة الردود',rateLimited:result.code==='HTTP_429'};
 return {users:observedAdminResponders(result.data,ticket.id),rateLimited:false};
}
export function aiAuthorMatches(last:any,user:AiAdminUser):boolean{
 const replyAdminId=Number(last?.adminid??last?.admin_id??0);
 if(Number.isSafeInteger(replyAdminId)&&replyAdminId>0&&user.id>0)return replyAdminId===user.id;
 // WHMCS installations differ: GetTicket may supply username or display name.
 // Do NOT use 'name' or 'requestor_name': they can refer to the customer.
 const author=normalized(String(last?.admin||last?.adminname||''));
 if(user.source==='reply')return author.length>0&&author===normalized(user.fullName);
 return author.length>0&&(author===normalized(user.username)||
  (!user.ambiguousFullName&&author===normalized(user.fullName)));
}
export function mentionsHumanTransfer(body:string):boolean {
 const text=body.replace(/<[^>]+>/g,' ').replace(/\s+/g,' ').toLocaleLowerCase('en-US');
 return /(?:هحو[ّ]?ل|س[أا]حول|سوف\s+(?:أحول|نحول|يتم\s+تحويل)|تحويل\s+(?:التذكرة|طلبك|المحادثة)|تصعيد\s+(?:التذكرة|طلبك)|خدمة\s+العملاء|(?:transfer|escalat\w*|handoff)\b)/iu.test(text);
}
export function classifyAiLastReply(data:any,ticket:Ticket,identity:AiAdminUser):AiTicketCheck {
 // A status can be changed at any time; never report a closed ticket as current.
 const id=Number(data?.ticketid??data?.id??0);
 if(!Number.isSafeInteger(id)||id!==ticket.id||isClosed(String(data?.status||ticket.status)))
  return {kind:'skip'};
 const raw=data?.replies?.reply;
 const replies=Array.isArray(raw)?raw:raw&&typeof raw==='object'?[raw]:[];
 const replyTotal=Number(data?.replies?.totalresults??data?.replies?.total??0);
 if(replyTotal>replies.length)return {kind:'error',message:'WHMCS رجّع جزءًا من الردود فقط',rateLimited:false};
 const last=replies.filter((r:any)=>typeof r?.message==='string'&&r.message.trim()).at(-1);
 if(!last)return {kind:'skip'};
 // admin is the WHMCS responder identity; requestor_name/name can be the customer.
 const author=String(last.admin||last.adminname||identity.fullName||identity.username).trim();
 if(!aiAuthorMatches(last,identity))return {kind:'skip'};
 const message=String(last.message||'');
 return {kind:'match',review:{
  ticket:{...ticket,status:String(data.status||ticket.status),updated:String(last.date||ticket.updated)},
  author,message,date:String(last.date||''),transferMentioned:mentionsHumanTransfer(message)
 }};
}
export async function checkAiLastReply(session:Session,ticket:Ticket,identity:AiAdminUser):Promise<AiTicketCheck>{
 if(!Number.isSafeInteger(ticket.id)||ticket.id<=0)return {kind:'skip'};
 const response=await callApi(session,'GetTicket',{ticketid:ticket.id,repliessort:'ASC'});
 if(!response.ok||!response.data)return {kind:'error',message:response.error||'تعذر قراءة آخر رد',rateLimited:response.code==='HTTP_429'};
 return classifyAiLastReply(response.data,ticket,identity);
}
