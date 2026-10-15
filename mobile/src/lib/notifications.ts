import * as Notifications from 'expo-notifications';
import {Platform} from 'react-native';
import * as SecureStore from 'expo-secure-store';
import {md5} from 'js-md5';
import type {Session} from '../types';

export type NoticeCategory='whatsapp'|'tickets'|'clients'|'invoices'|'orders'|'services'|'domains';
export interface NoticeInput {category:NoticeCategory;id:string|number;revision:string;title:string;body:string}
interface Seen {revision:string;lastSeen:number}
type SeenMap=Record<string,Seen>;
const channel:Record<NoticeCategory,string>={
 whatsapp:'whmcs-whatsapp',tickets:'whmcs-tickets',clients:'whmcs-clients',invoices:'whmcs-invoices',
 orders:'whmcs-orders',services:'whmcs-services',domains:'whmcs-domains'
};
const labels:Record<NoticeCategory,string>={
 whatsapp:'واتساب',tickets:'التذاكر',clients:'العملاء',invoices:'الفواتير',
 orders:'الطلبات',services:'الخدمات',domains:'الدومينات'
};
let ready=false;
let remotePushRegistered=false;
/** A verified remote registration suppresses duplicate local polling alerts. */
export function setRemotePushRegistered(value:boolean):void{remotePushRegistered=value;}
const latest=new Map<string,SeenMap>();
const pending=new Map<string,Promise<void>>();
function storageKey(session:Session):string{
 // Never use external API credentials or tokens as a storage key.
 const owner=session.mode==='admin'?session.username:session.identifier;
 return 'whmcs-notifications-seen-'+md5(session.baseUrl+'|'+session.mode+'|'+owner);
}
function safe(input:string,max:number):string{
 return input.replace(/[\r\n\t]+/g,' ').trim().slice(0,max);
}
// Register presentation behavior as soon as the module loads; setting it only
// after a user permission prompt can swallow the first foreground banner.
Notifications.setNotificationHandler({
 handleNotification:async()=>({
  shouldShowBanner:true,shouldShowList:true,shouldPlaySound:true,shouldSetBadge:false
 })
});
/** Foreground local notifications require Android permission + HIGH channels.
 * Genuine background push separately requires an authenticated FCM sender.
 */
export async function enableDeviceNotifications():Promise<boolean>{
 if(Platform.OS==='android'){
  for(const category of Object.keys(channel) as NoticeCategory[]){
   await Notifications.setNotificationChannelAsync(channel[category],{
    name:'WHMCS - '+labels[category],
    importance:Notifications.AndroidImportance.HIGH,
    sound:'default',
    vibrationPattern:[0,250,140,250]
   });
  }
 }
 const prior=await Notifications.getPermissionsAsync();
 let approved=prior.granted;
 if(!approved){const response=await Notifications.requestPermissionsAsync();approved=response.granted;}
 ready=approved;
 return approved;
}
/** Visible confirmation that this particular device has the OS permission
 * and can display a local banner. Does not claim background FCM availability.
 */
export async function testDeviceNotification():Promise<'sent'|'permission_denied'>{
 const permitted=await enableDeviceNotifications();
 if(!permitted)return 'permission_denied';
 await Notifications.scheduleNotificationAsync({
  content:{
   title:'WHMCS • اختبار الإشعارات',
   body:'إشعارات التطبيق المحليّة شغالة. إشعارات الخلفية تحتاج ربط FCM بالسيرفر.',
   ...(Platform.OS==='android'?{channelId:channel.whatsapp}:{})
  },trigger:null
 });
 return 'sent';
}
async function readSeen(session:Session):Promise<SeenMap>{
 const key=storageKey(session);
 if(latest.has(key))return latest.get(key)!;
 let obj:SeenMap={};
 try{
  const raw=await SecureStore.getItemAsync(key);
  if(raw){const parsed=JSON.parse(raw);
   if(parsed&&typeof parsed==='object'&&!Array.isArray(parsed))obj=parsed as SeenMap;
  }
 }catch{}
 latest.set(key,obj);
 return obj;
}
/** Only notify on *new* events after an initial baseline, never notify for an
 * entire backlog when the phone connects for the first time. */
export async function ingestNotificationSnapshot(session:Session,category:NoticeCategory,events:NoticeInput[]):Promise<void>{
 const key=storageKey(session);
 const prev=pending.get(key)||Promise.resolve();
 const update=prev.catch(()=>{}).then(async()=>{
  const state=await readSeen(session);
  const now=Date.now();
  const priorCategory=!!state['__baseline:'+category];
  state['__baseline:'+category]={revision:'1',lastSeen:now};
  const outgoing:NoticeInput[]=[];
  for(const e of events.slice(0,100)){
   if(e.category!==category||!e.id||!e.revision)continue;
   const id=category+':'+String(e.id).slice(0,80);
   const old=state[id];
   if(old&&old.revision!==e.revision)outgoing.push(e);
   else if(!old&&priorCategory)outgoing.push(e);
   state[id]={revision:e.revision.slice(0,180),lastSeen:now};
  }
  // Bound encrypted storage: Android SecureStore is intended for small blobs.
  const kept=Object.entries(state).sort(([,a],[,b])=>b.lastSeen-a.lastSeen).slice(0,110);
  const fresh=Object.fromEntries(kept) as SeenMap;
  latest.set(key,fresh);
  try{await SecureStore.setItemAsync(key,JSON.stringify(fresh),{
   keychainAccessible:SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY
  });}catch{}
  if(!ready)return;
  // Never manufacture a summary ("40 new alerts") from a refreshed record list.
  // Suppress local echoes once FCM registration is confirmed for this session.
  if(remotePushRegistered)return;
  for(const e of outgoing.slice(0,3)){
   await Notifications.scheduleNotificationAsync({
    content:{title:safe(e.title,100)||labels[category],body:safe(e.body,160)||'تحديث جديد',
     data:{section:category,id:String(e.id)},...(Platform.OS==='android'?{channelId:channel[category]}:{})},
    trigger:null
   });
  }
 });
 pending.set(key,update);
 try{await update}finally{if(pending.get(key)===update)pending.delete(key)}
}
export function whmcsSectionNotifications(category:Exclude<NoticeCategory,'whatsapp'>,records:any[]):NoticeInput[]{
 return records.slice(0,90).filter(r=>r&&Number(r.id)>0).map(r=>{
  const id=Number(r.id);
  const status=String(r.status||'');
  const updated=String(r.updated||r.date||r.created||r.due||r.expiry||'');
  return {category,id,revision:status+'|'+updated,
   title:category==='tickets'?'تذكرة #'+id+' • '+safe(String(r.subject||''),55):
    category==='clients'?'عميل • '+safe(String(r.name||r.customer||'#'+id),55):
    category==='invoices'?'فاتورة #'+id+' • '+safe(String(r.customer||''),55):
    labels[category]+' • #'+id,
   body:category==='tickets'?'تحديث على التذكرة':category==='clients'?'تحديث على بيانات العميل':category==='invoices'?'حالة الفاتورة: '+status:
    category==='orders'?'حالة الطلب: '+status:category==='services'?'حالة الخدمة: '+status:
     'حالة الدومين: '+status};
 });
}
export function whatsAppNotifications(rows:Array<{id:number;unread_count:number;last_message_at:string;display_name?:string;last_message_preview?:string}>):NoticeInput[]{
 return rows.filter(row=>row.unread_count>0).slice(0,100).map(row=>({
  category:'whatsapp',id:row.id,revision:String(row.last_message_at)+'|'+String(row.unread_count),
  title:'واتساب • '+safe(String(row.display_name||'رسالة جديدة'),70),
  // Don't expose a customer's full message preview on an unattended lock screen.
  body:'رسالة جديدة من '+safe(String(row.display_name||'العميل'),65)
 }));
}

/**
 * Test FCM enrollment for THIS Android app only.
 * A native FCM token is a device routing address: never log it, show it,
 * forward it to a third party, or mistake it for WHMCS authentication.
 * Delivery when the app is closed also requires a separate authenticated,
 * tenant-isolated backend sender + registration API.
 */
export async function verifyNativeFcmSetup():Promise<{ready:boolean;reason:'ready'|'android_only'|'permission_denied'|'token_unavailable'}>{
 if(Platform.OS!=='android')return {ready:false,reason:'android_only'};
 const permitted=await enableDeviceNotifications();
 if(!permitted)return {ready:false,reason:'permission_denied'};
 try{
  const token=await Notifications.getDevicePushTokenAsync();
  if(typeof token.data!=='string'||!token.data.trim())return {ready:false,reason:'token_unavailable'};
  // Deliberately do not persist the token until authenticated registration exists.
  return {ready:true,reason:'ready'};
 }catch{
  return {ready:false,reason:'token_unavailable'};
 }
}
