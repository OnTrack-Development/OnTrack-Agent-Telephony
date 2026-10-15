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

export function aiIdentityNames(config:string):string[]{
 return [...new Set(config.split(/[,،;\n]/).map(x=>x.trim().replace(/\s+/g,' ').toLocaleLowerCase('en-US'))
  .filter(x=>x.length>=2&&x.length<=100))].slice(0,8);
}
export function aiAuthorMatches(author:string,config:string):boolean{
 const normalized=author.trim().replace(/\s+/g,' ').toLocaleLowerCase('en-US');
 return normalized.length>=2&&aiIdentityNames(config).includes(normalized);
}
export function mentionsHumanTransfer(body:string):boolean {
 const text=body.replace(/<[^>]+>/g,' ').replace(/\s+/g,' ').toLocaleLowerCase('en-US');
 return /(?:هحو[ّ]?ل|س[أا]حول|سوف\s+(?:أحول|نحول|يتم\s+تحويل)|تحويل\s+(?:التذكرة|طلبك|المحادثة)|تصعيد\s+(?:التذكرة|طلبك)|خدمة\s+العملاء|(?:transfer|escalat|handoff)\b)/iu.test(text);
}
export function classifyAiLastReply(data:any,ticket:Ticket,identity:string):AiTicketCheck {
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
 const author=String(last.admin||last.adminname||'').trim();
 if(!aiAuthorMatches(author,identity))return {kind:'skip'};
 const message=String(last.message||'');
 return {kind:'match',review:{
  ticket:{...ticket,status:String(data.status||ticket.status),updated:String(last.date||ticket.updated)},
  author,message,date:String(last.date||''),transferMentioned:mentionsHumanTransfer(message)
 }};
}
export async function checkAiLastReply(session:Session,ticket:Ticket,identity:string):Promise<AiTicketCheck>{
 if(!Number.isSafeInteger(ticket.id)||ticket.id<=0)return {kind:'skip'};
 const response=await callApi(session,'GetTicket',{ticketid:ticket.id,repliessort:'ASC'});
 if(!response.ok||!response.data)return {kind:'error',message:response.error||'تعذر قراءة آخر رد',rateLimited:response.code==='HTTP_429'};
 return classifyAiLastReply(response.data,ticket,identity);
}
