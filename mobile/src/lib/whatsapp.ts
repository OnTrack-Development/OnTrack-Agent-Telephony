import type {Session} from '../types';
import * as SecureStore from 'expo-secure-store';
import * as Crypto from 'expo-crypto';
import * as FileSystem from 'expo-file-system/legacy';
import * as Notifications from 'expo-notifications';
import {Platform} from 'react-native';
import {md5} from 'js-md5';
import {validateBaseUrl} from './api';
import {adminPage,adminRequest,adminSessionStamp} from './adminSession';
export interface WaWindow {open:boolean;expires_at:string|null;remaining_seconds:number}
export interface WaConversation {id:number;display_name:string;phone:string;client_id:number|null;last_message_preview:string;last_message_at:string;unread_count:number;window:WaWindow}
export interface WaMessage {id:number;direction:'incoming'|'outgoing';body:string;message_type:string;status:string;timestamp:string;media_id:string;media_mime_type:string;media_filename:string;has_media:boolean;error_text:string}
const telegramGatewayKeys=new WeakMap<Session,string>();
const mediaCapabilities=new WeakMap<Session,{imagePreview:boolean;mediaSend:boolean;version:string}>();
function storeMediaCapabilities(session:Session,status:any):void{
 const caps=status?.capabilities;
 mediaCapabilities.set(session,{
  imagePreview:caps?.image_preview===true,
  mediaSend:caps?.media_send===true,
  version:String(status?.gateway_version||'legacy')
 });
}
/** Media requires the *installed* TelegramNotify gateway, not merely an upgraded APK. */
export function whatsAppMediaStatus(session:Session):{imagePreview:boolean;mediaSend:boolean;version:string}{
 return mediaCapabilities.get(session)||{imagePreview:false,mediaSend:false,version:'unknown'};
}
const gatewayKey=(session:Session)=>
 'whmcs-tg-wa-v1-'+md5(validateBaseUrl(session.baseUrl)+'|'+(session.mode==='admin'?session.username:session.identifier));
export const telegramWhatsAppReady=(session:Session)=>telegramGatewayKeys.has(session);
/**
 * TelegramNotify ALREADY exists in WHMCS. The updated existing addon exposes
 * a narrowly scoped, admin-bound WhatsApp Inbox gateway; no new addon/bot or
 * Meta token is provisioned on the phone.
 */
async function telegramGatewayRequest(session:Session,key:string,action:string,
  params:Record<string,string|number>={}):Promise<any>{
 // TelegramNotify v3.4.2 (installed addon) handles this WHMCS client-area route.
 // Use WHMCS's officially supported installed-addon route. Direct PHP under
 // /modules/addons/telegramnotify/ is denied with HTTP 403 by this host.
 const endpoint=validateBaseUrl(session.baseUrl)+'/index.php?m=telegramnotify&route=mobile_whatsapp';
 const controller=new AbortController();
 const timeout=setTimeout(()=>controller.abort(),20000);
 let response:Response;
 try{
  response=await fetch(endpoint,{
   method:'POST',signal:controller.signal,
   headers:{'Accept':'application/json','Content-Type':'application/json',
    'Authorization':'Bearer '+key},
   body:JSON.stringify({action,...params})
  });
 }catch(_e){
  if(action==='chat_send')throw Error('نتيجة إرسال واتساب غير مؤكدة. راجع المحادثة قبل إعادة إرسال الرسالة.');
  throw Error('تعذر الاتصال بمنفذ واتساب في موديول TelegramNotify. تأكد إنه اتحدّث على السيرفر.');
 }finally{clearTimeout(timeout);}
 let result:any;
 try{result=await response.json();}catch{
  if(action==='chat_send')throw Error('نتيجة إرسال واتساب غير مؤكدة. راجع المحادثة قبل المحاولة مرة أخرى.');
  if(response.status===403)throw Error('السيرفر منع مسار WHMCS الرسمي (403). راجع قاعدة الحماية للمسار index.php?m=telegramnotify.');
  if(response.status===404)throw Error('WHMCS لم يجد رابط TelegramNotify. تأكد إنه مفعل ومحدث للنسخة 3.4.2.');
  throw Error('WHMCS رجّع HTML بدل JSON (HTTP '+response.status+'). تأكد إن TelegramNotify v3.4.2 مرفوع، وجرّب رابط index.php?m=telegramnotify&route=mobile_whatsapp.');
 }
 if(response.status===429){applyRateLimit(session);assertWhatsAppNotThrottled(session);}
 if(response.status===401)throw Error('رمز ربط واتساب غير صالح أو اتلغى. جدده من إعدادات TelegramNotify.');
 if(response.status===404)throw Error('ملف الربط مش موجود على السيرفر. حدّث TelegramNotify إلى v3.4.2 على WHMCS أولًا.');
 if(response.status>=500&&action==='chat_send')
  throw Error('نتيجة إرسال واتساب غير مؤكدة بسبب خطأ بالخادم. راجع المحادثة قبل إعادة الإرسال.');
 if(!response.ok||result?.status!=='success')
  throw Error(String(result?.message||'تعذر تنفيذ طلب واتساب من TelegramNotify.'));
 rateLimit.delete(session);
 return result;
}
export async function restoreTelegramWhatsApp(session:Session):Promise<boolean>{
 const key=await SecureStore.getItemAsync(gatewayKey(session)).catch(()=>null);
 if(!key||!/^[a-f0-9]{64}$/.test(key))return false;
 try{
  const gatewayStatus=await telegramGatewayRequest(session,key,'status');
  storeMediaCapabilities(session,gatewayStatus);
  telegramGatewayKeys.set(session,key);
  return true;
 }catch{return false;}
}
export async function pairTelegramWhatsApp(session:Session,keyInput:string):Promise<void>{
 const key=keyInput.trim().toLowerCase();
 if(!/^[a-f0-9]{64}$/.test(key))
  throw Error('رمز الربط 64 حرفًا، بتاخده من إعدادات موديول TelegramNotify الحالي.');
 const gatewayStatus=await telegramGatewayRequest(session,key,'status');
 storeMediaCapabilities(session,gatewayStatus);
 await SecureStore.setItemAsync(gatewayKey(session),key,
  {keychainAccessible:SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY});
 telegramGatewayKeys.set(session,key);
}
export async function forgetTelegramWhatsApp(session:Session):Promise<void>{
 telegramGatewayKeys.delete(session);mediaCapabilities.delete(session);
 await SecureStore.deleteItemAsync(gatewayKey(session));
}

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
 const gateway=telegramGatewayKeys.get(session);
 if(gateway)return telegramGatewayRequest(session,gateway,action,params);
 if(csrf.get(session)?.stamp!==adminSessionStamp(session))await prepareWhatsApp(session);
 const query=new URLSearchParams({ajax_action:action});
 if(!write)Object.entries(params).forEach(([k,v])=>query.set(k,String(v)));
 let result;
 try{
  result=await adminRequest(session,path+(write?'':'&'+query.toString()),write?'POST':'GET',write?{ajax_action:action,...params}:{},write?{'X-WA-CSRF':csrf.get(session)!.token}:{});
 }catch(error){
  if(action==='chat_send')throw Error('نتيجة إرسال واتساب غير مؤكدة بسبب انقطاع الاتصال. راجع المحادثة قبل أي محاولة إرسال جديدة؛ ممكن تكون الرسالة اتبعت بالفعل.');
  throw error;
 }
 if(action==='chat_send'&&result.status>=500)
  throw Error('موديول واتساب رجّع خطأ غير متوقع بعد الإرسال. راجع سجل المحادثة قبل إعادة الرسالة لمنع التكرار.');
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
 return values.filter(v=>Number.isSafeInteger(Number(v.id))&&Number(v.id)>0&&['incoming','outgoing'].includes(v.direction)).map(v=>({id:Number(v.id),direction:v.direction,body:String(v.body||''),message_type:String(v.message_type||'text'),status:String(v.status||''),timestamp:String(v.timestamp||''),media_id:String(v.media_id||''),media_mime_type:String(v.media_mime_type||''),media_filename:String(v.media_filename||''),has_media:v.has_media===true,error_text:String(v.error_text||'')}));
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

/** Use the paired operator's bearer token in an HTTPS HEADER, never a query string.
 * Image access is reauthorized server-side against the conversation and message.
 */
export function whatsappImageSource(session:Session,conversationId:number,message:WaMessage):
 {uri:string;headers:{Authorization:string}}|null{
 const key=telegramGatewayKeys.get(session);
 if(!key||!whatsAppMediaStatus(session).imagePreview||!Number.isSafeInteger(conversationId)||!Number.isSafeInteger(message.id)
    ||!message.has_media||!['image','sticker'].includes(message.message_type))return null;
 const endpoint=validateBaseUrl(session.baseUrl)
  +'/index.php?m=telegramnotify&route=mobile_whatsapp';
 return {uri:endpoint+'&conversation_id='+conversationId+'&media_message_id='+message.id,
  headers:{Authorization:'Bearer '+key}};
}
/**
 * Android native Image can swallow authentication/HTTP errors. Download to
 * private, short-lived app cache with the pairing key in a request HEADER,
 * check HTTP + Content-Type, then render from file://. Never place bearer
 * tokens in URLs, logs, JS image data URIs or public storage.
 */
export async function downloadWhatsAppImage(session:Session,conversationId:number,message:WaMessage):Promise<string>{
 const source=whatsappImageSource(session,conversationId,message);
 if(!source)throw Error('لا يوجد رابط صورة مصرح به. تأكد من تحديث TelegramNotify.');
 const cacheRoot=FileSystem.cacheDirectory;
 if(!cacheRoot)throw Error('تعذر الوصول لمساحة التخزين المؤقتة الآمنة.');
 const uri=cacheRoot+'wa-private-'+conversationId+'-'+message.id+'-'+Date.now()+'.img';
 try{
  const response=await FileSystem.downloadAsync(source.uri,uri,{
   headers:{...source.headers,Accept:'image/jpeg,image/png,image/webp,application/json'}
  });
  if(response.status<200||response.status>=300){
   let code='',upstream=0;
   try{
    const info=await FileSystem.getInfoAsync(uri);
    if(info.exists&&info.size<12000){
     const data=JSON.parse(await FileSystem.readAsStringAsync(uri));
     code=String(data.code||'');
     upstream=Number(data.upstream_status)||0;
    }
   }catch{}
   if(response.status===401)throw Error('انتهى أو اتلغى رمز ربط TelegramNotify. أعد الربط من واتساب.');
   if(response.status===403)throw Error('ليس لديك صلاحية الوصول لهذه الصورة من WHMCS.');
   if(code==='media_not_found_or_expired')
    throw Error('Meta رجّعت '+upstream+' للصورة. المرفق غير متاح الآن أو انتهت صلاحيته.');
   if(code==='meta_permission_denied')
    throw Error('Meta رفضت قراءة الصورة ('+upstream+'). راجع صلاحيات رقم واتساب وتوكن Cloud API.');
   if(code==='meta_media_download_failed')
    throw Error('Meta سمحت بقراءة بيانات الصورة لكن تحميل الملف فشل ('+upstream+'). افحص اتصال السيرفر بـMeta CDN.');
   throw Error('تحميل صورة واتساب فشل برمز HTTP '+response.status+'؛ جرّب تحديث TelegramNotify v3.4.6.');
  }
  const contentType=String(response.headers?.['content-type']||
   response.headers?.['Content-Type']||'').toLowerCase();
  if(!/^image\/(jpeg|png|webp)(?:\s*;|$)/.test(contentType))
   throw Error('السيرفر لم يرجع صورة صالحة (Content-Type: '+contentType.slice(0,35)+').');
  const info=await FileSystem.getInfoAsync(uri);
  if(!info.exists||info.size===0||info.size>5*1024*1024)
   throw Error('الصورة غير متاحة أو حجمها غير مدعوم.');
  return uri;
 }catch(error){
  await FileSystem.deleteAsync(uri,{idempotent:true}).catch(()=>{});
  throw error;
 }
}
export async function clearWhatsAppImage(uri:string):Promise<void>{
 if(FileSystem.cacheDirectory&&uri.startsWith(FileSystem.cacheDirectory+'wa-private-'))
  await FileSystem.deleteAsync(uri,{idempotent:true});
}

export type UploadAsset={uri:string;name:string;mimeType:string;size:number};
export async function sendWhatsAppMedia(session:Session,conversationId:number,asset:UploadAsset,caption=''):Promise<void>{
 const key=telegramGatewayKeys.get(session);
 if(!key)throw Error('اربط واتساب عبر TelegramNotify أولًا.');
 const status=await telegramGatewayRequest(session,key,'status');
 storeMediaCapabilities(session,status);
 if(!whatsAppMediaStatus(session).mediaSend)
  throw Error('TelegramNotify على سيرفر WHMCS قديم. حدّث نفس الموديول إلى v3.4.6 لإرسال الصور والملفات. تحديث التطبيق وحده مش كفاية.');
 if(!Number.isSafeInteger(conversationId)||conversationId<1
    ||!asset.uri||!asset.name||!asset.mimeType||!Number.isFinite(asset.size)||asset.size<=0)
  throw Error('الملف غير صالح.');
 if(asset.size>16*1024*1024)
  throw Error('حجم الملف أكبر من الحد المسموح في التطبيق (16 ميجابايت).');
 const endpoint=validateBaseUrl(session.baseUrl)+'/index.php?m=telegramnotify&route=mobile_whatsapp';
 // Native multipart upload is more reliable than JS FormData for Android
 // file:// URIs. Important: let native code set the boundary itself.
 let result:{status:number;body:string};
 try{
  const upload=FileSystem.createUploadTask(endpoint,asset.uri,{
   httpMethod:'POST',
   uploadType:FileSystem.FileSystemUploadType.MULTIPART,
   fieldName:'file',
   mimeType:asset.mimeType,
   headers:{'Accept':'application/json','Authorization':'Bearer '+key},
   parameters:{
    action:'chat_send_media',
    conversation_id:String(conversationId),
    caption:caption.slice(0,1024)
   }
  });
  const timer=setTimeout(()=>{void upload.cancelAsync().catch(()=>{});},95000);
  try{
   const response=await upload.uploadAsync();
   if(!response)throw Error('cancelled');
   result={status:response.status,body:response.body};
  }finally{clearTimeout(timer);}
 }catch{
  throw Error('نتيجة إرسال الصورة أو الملف غير مؤكدة. راجع المحادثة قبل إعادة الإرسال؛ ممكن Meta تكون استلمته.');
 }
 let json:any;
 try{json=JSON.parse(result.body);}catch{
  throw Error('نتيجة إرسال المرفق غير مؤكدة؛ السيرفر لم يرجع تأكيدًا صالحًا. راجع المحادثة قبل الإعادة.');
 }
 if(result.status===413)throw Error('السيرفر رفض حجم الملف. راجع إعدادات PHP upload_max_filesize وpost_max_size على WHMCS.');
 if(result.status===404)throw Error('مسار المرفقات غير موجود. حدّث TelegramNotify على WHMCS إلى v3.4.6.');
 if(result.status<200||result.status>=300||json?.status!=='success')throw Error(
  result.status>=500?'نتيجة إرسال المرفق غير مؤكدة. راجع سجل المحادثة قبل إعادة الإرسال.':
  String(json?.message||'تعذر إرسال المرفق إلى واتساب.'));
}

const deviceKey=(session:Session)=>'whmcs-push-device-'+md5(validateBaseUrl(session.baseUrl)
 +'|'+(session.mode==='admin'?session.username:session.identifier));
async function persistedDeviceId(session:Session):Promise<string>{
 const key=deviceKey(session);
 let id=await SecureStore.getItemAsync(key);
 if(id&&/^[a-f0-9-]{36}$/.test(id))return id;
 id=Crypto.randomUUID().toLowerCase();
 await SecureStore.setItemAsync(key,id,{keychainAccessible:SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY});
 return id;
}
/** Push registration requires the existing TelegramNotify key and server-side
 * Google service account configured outside WHMCS public files. FCM tokens
 * aren't authentication credentials, but are never logged or shown to users.
 */
export async function registerWhatsAppPush(session:Session):Promise<'registered'|'unpaired'|'permission_denied'|'fcm_unavailable'>{
 const key=telegramGatewayKeys.get(session);
 if(!key)return 'unpaired';
 if(Platform.OS!=='android')return 'fcm_unavailable';
 const permission=await Notifications.getPermissionsAsync();
 if(!permission.granted)return 'permission_denied';
 const token=await Notifications.getDevicePushTokenAsync();
 if(typeof token.data!=='string'||!token.data)return 'fcm_unavailable';
 const device=await persistedDeviceId(session);
 await telegramGatewayRequest(session,key,'register_push',{device_id:device,fcm_token:token.data});
 return 'registered';
}
export async function whatsAppPushStatus(session:Session):Promise<{configured:boolean;registered_devices:number}>{
 const key=telegramGatewayKeys.get(session);
 if(!key)throw Error('اتصل بموديول TelegramNotify من صفحة واتساب أولًا.');
 const data=await telegramGatewayRequest(session,key,'push_status');
 return {configured:data.configured===true,registered_devices:Number(data.registered_devices)||0};
}
export async function unregisterWhatsAppPush(session:Session):Promise<void>{
 const key=telegramGatewayKeys.get(session);
 if(!key)return;
 const device=await SecureStore.getItemAsync(deviceKey(session)).catch(()=>null);
 if(!device)return;
 await telegramGatewayRequest(session,key,'unregister_push',{device_id:device});
}
