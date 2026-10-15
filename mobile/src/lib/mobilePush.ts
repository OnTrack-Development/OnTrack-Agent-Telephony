/**
 * Independent WHMCS administrator push enrollment.
 * FCM registration is not an authorization token; a short-lived WHMCS
 * administrator-generated pairing code creates the restricted bearer session.
 */
import * as Notifications from 'expo-notifications';
import * as SecureStore from 'expo-secure-store';
import * as Crypto from 'expo-crypto';
import {Platform} from 'react-native';
import {md5} from 'js-md5';
import type {Session} from '../types';
import {validateBaseUrl} from './api';
import {enableDeviceNotifications,setRemotePushRegistered} from './notifications';
import {telegramWhatsAppReady,unregisterWhatsAppPush} from './whatsapp';

const namespace=(s:Session)=>md5(validateBaseUrl(s.baseUrl)+'|'+s.mode+'|'+(s.mode==='admin'?s.username:s.identifier));
const tokenKey=(s:Session)=>'whmcs-mobile-push-auth-'+namespace(s);
const deviceKey=(s:Session)=>'whmcs-mobile-push-device-'+namespace(s);
const endpoint=(s:Session)=>validateBaseUrl(s.baseUrl)+'/modules/addons/ontrack_mobile_admin/bridge.php';

async function request(s:Session,operation:string,payload:Record<string,string>,auth?:string):Promise<any>{
 const controller=new AbortController();
 const timer=setTimeout(()=>controller.abort(),12000);
 try{
  const result=await fetch(endpoint(s),{
   method:'POST',signal:controller.signal,
   headers:{'Content-Type':'application/json','Accept':'application/json',...(auth?{Authorization:'Bearer '+auth}:{})},
   body:JSON.stringify({operation,payload})
  });
  let json:any;
  try{json=await result.json();}catch{throw Error('مكون WHMCS Mobile Companion غير متاح أو رجع استجابة غير صحيحة.');}
  if(!result.ok||json?.ok!==true)throw Error(String(json?.error||'تعذر الوصول لخدمة الإشعارات ('+result.status+').'));
  return json.data||{};
 }finally{clearTimeout(timer);}
}
async function authToken(session:Session):Promise<string|null>{
 return SecureStore.getItemAsync(tokenKey(session));
}
async function stableDeviceId(session:Session):Promise<string>{
 let value=await SecureStore.getItemAsync(deviceKey(session));
 if(value&&/^[a-f0-9-]{36}$/i.test(value))return value;
 value=Crypto.randomUUID().toLowerCase();
 await SecureStore.setItemAsync(deviceKey(session),value,{
  keychainAccessible:SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY
 });
 return value;
}
export async function pairMobilePush(session:Session,code:string):Promise<void>{
 if(!/^[a-f0-9]{12}$/i.test(code.trim()))throw Error('رمز الربط لازم يكون 12 حرفًا سداسيًا من لوحة إدارة WHMCS.');
 const data=await request(session,'pair',{code:code.trim().toUpperCase(),deviceLabel:'WHMCS Android Push'});
 if(!/^[a-f0-9]{64}$/i.test(String(data.token||'')))throw Error('السيرفر لم يُرجع جلسة ربط صحيحة.');
 if(!Array.isArray(data.scopes)||!data.scopes.includes('push.devices'))
  throw Error('تحديث WHMCS Mobile Companion مطلوب لتفعيل إشعارات Push.');
 await SecureStore.setItemAsync(tokenKey(session),data.token,{
  keychainAccessible:SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY
 });
}
export async function registerMobilePush(session:Session):Promise<{registered:boolean;configured:boolean;reason:string}>{
 setRemotePushRegistered(false);
 if(Platform.OS!=='android')return {registered:false,configured:false,reason:'Android only'};
 const token=await authToken(session);
 if(!token)return {registered:false,configured:false,reason:'الربط الإداري لم يكتمل'};
 if(!await enableDeviceNotifications())return {registered:false,configured:false,reason:'إذن الإشعارات مرفوض'};
 let fcm='';
 try{
  const result=await Notifications.getDevicePushTokenAsync();
  fcm=typeof result.data==='string'?result.data:'';
 }catch{}
 if(!fcm)return {registered:false,configured:false,reason:'تعذر الحصول على FCM token من الجهاز'};
 const data=await request(session,'push.register',{device_id:await stableDeviceId(session),fcm_token:fcm},token);
 const configured=data.configured===true;
 // Even with a registered device, never suppress local fallback unless sending is configured.
 setRemotePushRegistered(configured);
 if(configured&&telegramWhatsAppReady(session))await unregisterWhatsAppPush(session).catch(()=>{});
 return {registered:true,configured,reason:configured?'جاهز لإرسال FCM':'الموبايل اتسجل، لكن مفتاح Firebase غير مجهز بالسيرفر'};
}
export async function mobilePushStatus(session:Session):Promise<{registered:boolean;configured:boolean;reason:string}>{
 const token=await authToken(session);
 if(!token)return {registered:false,configured:false,reason:'أنشئ رمز ربط من موديول WHMCS Mobile Companion'};
 const data=await request(session,'push.status',{},token);
 return {registered:data.registered===true,configured:data.configured===true,
  reason:data.configured?'الخادم مجهز لإرسال FCM':'حساب خدمة Firebase غير مجهز على الخادم'};
}
export async function logoutMobilePush(session:Session):Promise<void>{
 setRemotePushRegistered(false);
 const token=await authToken(session);
 if(token){
  try{await request(session,'push.unregister',{device_id:await stableDeviceId(session)},token);}catch{}
 }
 await SecureStore.deleteItemAsync(tokenKey(session)).catch(()=>{});
}
