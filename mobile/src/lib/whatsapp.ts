import type {Session} from '../types';
import {adminPage,adminRequest,adminSessionStamp} from './adminSession';
export interface WaWindow {open:boolean;expires_at:string|null;remaining_seconds:number}
export interface WaConversation {id:number;display_name:string;phone:string;client_id:number|null;last_message_preview:string;last_message_at:string;unread_count:number;window:WaWindow}
export interface WaMessage {id:number;direction:'incoming'|'outgoing';body:string;message_type:string;status:string;timestamp:string;media_filename:string;has_media:boolean;error_text:string}
const csrf=new WeakMap<Session,{token:string;stamp:string}>();
const rateLimit=new WeakMap<Session,{until:number;strikes:number}>();
export function getWhatsAppRetryAfterMs(session:Session):number {
 return Math.max(0,(rateLimit.get(session)?.until||0)-Date.now());
}
function applyRateLimit(session:Session):void {
 const previous=rateLimit.get(session);
 const strikes=(previous?.strikes||0)+1;
 const waitMs=Math.min(300000,60000*Math.pow(2,Math.min(3,strikes-1)));
 rateLimit.set(session,{until:Date.now()+waitMs,strikes});
}
function assertWhatsAppNotThrottled(session:Session):void {
 const waitMs=getWhatsAppRetryAfterMs(session);
 if(waitMs>0)throw Error('موديول واتساب أعاد HTTP 429؛ جاري التهدئة. إعادة المحاولة بعد '+Math.ceil(waitMs/1000)+' ثانية.');
}
const path='modules/addons/whatsapp_notifications/ajax.php?module=whatsapp_notifications';
export function whatsappCsrf(html:string):string{
 const direct=html.match(/window\.waCSRFToken\s*=\s*["']([a-f0-9]{32,128})["']/i);
 const local=html.match(/var\s+token\s*=\s*["']([a-f0-9]{32,128})["'];\s*window\.waCSRFToken\s*=\s*token/i);
 if(!direct&&!local)throw Error('لم يعرض موديول واتساب رمز الجلسة؛ راجع صلاحية الموظف للموديول.');
 return (direct||local)![1]!;
}
export async function prepareWhatsApp(session:Session):Promise<void>{
 csrf.set(session,{token:whatsappCsrf(await adminPage(session,'addonmodules.php?module=whatsapp_notifications&action=chat')),stamp:adminSessionStamp(session)});
}
async function call(session:Session,action:'chat_list'|'chat_messages'|'chat_mark_read'|'chat_send',params:Record<string,string|number>={},write=false):Promise<any>{
 assertWhatsAppNotThrottled(session);
 if(csrf.get(session)?.stamp!==adminSessionStamp(session))await prepareWhatsApp(session);
 const query=new URLSearchParams({ajax_action:action});
 if(!write)Object.entries(params).forEach(([k,v])=>query.set(k,String(v)));
 const result=await adminRequest(session,path+(write?'':'&'+query.toString()),write?'POST':'GET',write?{ajax_action:action,...params}:{},write?{'X-WA-CSRF':csrf.get(session)!.token}:{});
 if(result.status===429){applyRateLimit(session);assertWhatsAppNotThrottled(session);}
 let json:any;try{json=JSON.parse(result.body);}catch{csrf.delete(session);throw Error('لم يرجع واتساب بيانات صالحة؛ أعد الاتصال.');}
 if(result.status===403){csrf.delete(session);throw Error('انتهت صلاحية رمز واتساب؛ أعد تحميل المحادثات قبل المحاولة.');}
 if(result.status>=400||json.status!=='success')throw Error(String(json.message||(json.window_closed?'نافذة الرد مغلقة؛ يلزم قالب معتمد.':'تعذر تنفيذ طلب واتساب')));
 rateLimit.delete(session);
 return json;
}
export function normalizeConversation(value:any):WaConversation {
 if(!Number.isSafeInteger(Number(value?.id))||Number(value.id)<=0)throw Error('بيانات محادثة غير صالحة');
 return {id:Number(value.id),display_name:String(value.display_name||value.profile_name||value.phone||''),phone:String(value.phone||''),client_id:value.client_id?Number(value.client_id):null,
  last_message_preview:String(value.last_message_preview||''),last_message_at:String(value.last_message_at||''),unread_count:Math.max(0,Number(value.unread_count)||0),
  window:{open:value.window?.open===true,expires_at:value.window?.expires_at||null,remaining_seconds:Number(value.window?.remaining_seconds)||0}};
}
export function normalizeMessages(values:any):WaMessage[]{
 if(!Array.isArray(values))throw Error('قائمة رسائل غير صالحة');
 return values.filter(v=>Number.isSafeInteger(Number(v.id))&&Number(v.id)>0&&['incoming','outgoing'].includes(v.direction)).map(v=>({id:Number(v.id),direction:v.direction,body:String(v.body||''),message_type:String(v.message_type||'text'),status:String(v.status||''),timestamp:String(v.timestamp||''),media_filename:String(v.media_filename||''),has_media:v.has_media===true,error_text:String(v.error_text||'')}));
}
export async function listConversations(session:Session,search='',unread=false):Promise<{conversations:WaConversation[];unread:number}>{
 const data=await call(session,'chat_list',{q:search.slice(0,150),unread_only:unread?1:0});
 if(!Array.isArray(data.conversations))throw Error('موديول واتساب لم يرجع قائمة محادثات');
 return {conversations:data.conversations.map(normalizeConversation),unread:Number(data.unread_total)||0};
}
export async function conversationMessages(session:Session,id:number,before=0):Promise<{conversation:WaConversation;messages:WaMessage[]}>{
 const data=await call(session,'chat_messages',{conversation_id:id,...(before?{before_id:before}:{})});
 if(Number(data.conversation?.id)!==id)throw Error('محادثة غير مطابقة للطلب');
 return {conversation:normalizeConversation(data.conversation),messages:normalizeMessages(data.messages)};
}
export async function markConversationRead(session:Session,id:number):Promise<void>{await call(session,'chat_mark_read',{conversation_id:id},true);}
export async function sendWhatsAppText(session:Session,id:number,text:string):Promise<void>{
 if(!Number.isSafeInteger(id)||id<=0||!text.trim()||text.length>4096)throw Error('رقم المحادثة أو نص الرسالة غير صالح');
 await call(session,'chat_send',{conversation_id:id,message:text.trim()},true);
}
