import * as SecureStore from 'expo-secure-store';
import type {Session,Chat,ChatMessage} from '../types';
import {validateBaseUrl} from './api';

const STORE='whmcs-operator-whatsapp-pair-v1';
type PairInfo={baseUrl:string;token:string;adminName:string;expiresAt:string};
export type WaResult<T>={ok:boolean;data?:T;error?:string;code?:string};
const timeoutMs=20000;
function endpoint(base:string){
 return validateBaseUrl(base)+'/modules/addons/ontrack_mobile_admin/bridge.php';
}
async function request<T>(base:string,operation:string,payload:Record<string,unknown>,token=''):Promise<WaResult<T>>{
 const controller=new AbortController();
 const timer=setTimeout(()=>controller.abort(),timeoutMs);
 try{
  const headers:Record<string,string>={'Accept':'application/json','Content-Type':'application/json'};
  if(token)headers.Authorization='Bearer '+token;
  const r=await fetch(endpoint(base),{
   method:'POST',headers,body:JSON.stringify({operation,payload}),signal:controller.signal
  });
  const body=await r.text();
  let json:any;
  try{json=JSON.parse(body)}catch{return {ok:false,error:'ملحق ربط واتساب غير موجود أو لم يرجع JSON صالحًا على سيرفر WHMCS',code:'NO_BRIDGE'}};
  if(!r.ok||json?.ok!==true)return {ok:false,error:String(json?.error||'فشل اتصال واتساب').slice(0,240),code:String(json?.code||r.status)};
  return {ok:true,data:json.data as T};
 }catch(e){return {ok:false,error:e instanceof Error?e.message:'تعذر الوصول لسيرفر واتساب',code:'NETWORK'};}
 finally{clearTimeout(timer)}
}
export async function loadWaPair(baseUrl:string):Promise<PairInfo|null>{
 const stored=await SecureStore.getItemAsync(STORE);
 if(!stored)return null;
 try{
  const p=JSON.parse(stored) as PairInfo;
  if(p.baseUrl!==validateBaseUrl(baseUrl)||!/^([a-f0-9]{64})$/i.test(p.token))return null;
  if(Date.parse(p.expiresAt)<=Date.now())return null;
  return p;
 }catch{return null}
}
export async function pairWhatsApp(session:Session,code:string):Promise<WaResult<PairInfo>>{
 if(!/^[A-F0-9]{12}$/i.test(code.trim()))return {ok:false,error:'اكتب رمز الربط المكوّن من 12 حرفًا أو رقمًا من لوحة WHMCS'};
 const result=await request<{token:string;adminName:string;expiresAt:string;scopes:string[]}>(
  session.baseUrl,'pair',{code:code.trim().toUpperCase(),deviceLabel:'WHMCS Android'});
 if(!result.ok||!result.data)return {ok:false,error:result.error,code:result.code};
 if(!/^([a-f0-9]{64})$/i.test(result.data.token))return {ok:false,error:'توكن الجلسة غير صالح'};
 if(!result.data.scopes?.includes('whatsapp.read'))return {ok:false,error:'لم يتم منح صلاحية قراءة محادثات واتساب للجهاز'};
 const pair:PairInfo={baseUrl:validateBaseUrl(session.baseUrl),token:result.data.token,adminName:result.data.adminName,expiresAt:result.data.expiresAt};
 await SecureStore.setItemAsync(STORE,JSON.stringify(pair),{keychainAccessible:SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY});
 return {ok:true,data:pair};
}
async function authorized<T>(session:Session,operation:string,payload:Record<string,unknown>):Promise<WaResult<T>>{
 const paired=await loadWaPair(session.baseUrl);
 if(!paired)return {ok:false,error:'اربط الجهاز أولاً بموديول WHMCS Mobile Adapter',code:'NOT_PAIRED'};
 const r=await request<T>(session.baseUrl,operation,payload,paired.token);
 if(r.code==='AUTH_EXPIRED')await SecureStore.deleteItemAsync(STORE);
 return r;
}
export async function unpairWhatsApp(session?:Session|null):Promise<void>{
 if(session){
  const pair=await loadWaPair(session.baseUrl);
  if(pair)await request(session.baseUrl,'logout',{},pair.token);
 }
 await SecureStore.deleteItemAsync(STORE);
}
const s=(value:unknown)=>value===null||value===undefined?'':String(value);
const n=(value:unknown)=>Number(value)||0;
const normalizeMessage=(m:any):ChatMessage=>({
 id:s(m.id),from:m.from==='agent'?'agent':'customer',body:s(m.body),at:s(m.at)
});
export async function getWhatsAppInbox(session:Session):Promise<WaResult<Chat[]>>{
 const r=await authorized<{chats:any[]}>(session,'whatsapp.read',{});
 if(!r.ok)return {ok:false,error:r.error,code:r.code};
 const chats=(r.data?.chats||[]).map(c=>({
  id:s(c.id),name:s(c.name)||s(c.phone),phone:s(c.phone),last:s(c.last),
  time:s(c.time),unread:n(c.unread),messages:Array.isArray(c.messages)?c.messages.map(normalizeMessage):[]
 })) as Chat[];
 return {ok:true,data:chats.filter(c=>/^[0-9]+$/.test(c.id)&&c.phone)};
}
export async function getWhatsAppThread(session:Session,id:string):Promise<WaResult<ChatMessage[]>>{
 if(!/^[0-9]{1,12}$/.test(id))return {ok:false,error:'رقم المحادثة غير صالح'};
 const r=await authorized<{messages:any[]}>(session,'whatsapp.get',{conversation_id:Number(id)});
 if(!r.ok)return {ok:false,error:r.error,code:r.code};
 return {ok:true,data:(r.data?.messages||[]).map(normalizeMessage)};
}
export async function sendWhatsAppText(session:Session,id:string,text:string):Promise<WaResult<{sent:boolean;messageId:string}>>{
 if(!/^[0-9]{1,12}$/.test(id)||!text.trim()||text.length>4096)return {ok:false,error:'نص الرسالة أو المحادثة غير صالح'};
 const r=await authorized<{sent:boolean;message_id:string}>(session,'whatsapp.send',{conversation_id:Number(id),text:text.trim()});
 if(!r.ok)return {ok:false,error:r.error,code:r.code};
 return {ok:!!r.data?.sent,data:{sent:!!r.data?.sent,messageId:s(r.data?.message_id)},error:!r.data?.sent?'الرسالة لم يتم تأكيد إرسالها':undefined};
}
