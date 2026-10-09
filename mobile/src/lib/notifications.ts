import * as Notifications from 'expo-notifications';
import {Platform} from 'react-native';
import * as SecureStore from 'expo-secure-store';
import {md5} from 'js-md5';
import type {Session} from '../types';

export type NoticeCategory='whatsapp'|'tickets'|'invoices'|'orders'|'services'|'domains';
export interface NoticeInput {category:NoticeCategory;id:string|number;revision:string;title:string;body:string}
interface Seen {revision:string;lastSeen:number}
type SeenMap=Record<string,Seen>;
const channel:Record<NoticeCategory,string>={
 whatsapp:'whmcs-whatsapp',tickets:'whmcs-tickets',invoices:'whmcs-invoices',
 orders:'whmcs-orders',services:'whmcs-services',domains:'whmcs-domains'
};
const labels:Record<NoticeCategory,string>={
 whatsapp:'واتساب',tickets:'التذاكر',invoices:'الفواتير',
 orders:'الطلبات',services:'الخدمات',domains:'الدومينات'
};
let ready=false;
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
/** Current app process needs an actual notification permission. This does not register
 * remote FCM delivery or assert background push support. */
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
 Notifications.setNotificationHandler({
  handleNotification:async()=>({
   shouldShowBanner:true,shouldShowList:true,shouldPlaySound:true,shouldSetBadge:false
  })
 });
 const prior=await Notifications.getPermissionsAsync();
 let approved=prior.granted;
 if(!approved){const response=await Notifications.requestPermissionsAsync();approved=response.granted;}
 ready=approved;
 return approved;
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
  const priorCategory=Object.keys(state).some(x=>x.startsWith(category+':'));
  const now=Date.now();
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
  // Rate-limit tray notifications; collapse bursts to avoid 429-like alert floods.
  if(outgoing.length>4){
   await Notifications.scheduleNotificationAsync({
    content:{title:'WHMCS • '+labels[category],body:outgoing.length+' تحديثات جديدة',
     data:{section:category},...(Platform.OS==='android'?{channelId:channel[category]}:{})},
    trigger:null
   });
  }else{
   for(const e of outgoing){
    await Notifications.scheduleNotificationAsync({
     content:{title:safe(e.title,100)||labels[category],body:safe(e.body,160)||'تحديث جديد',
      data:{section:category,id:String(e.id)},...(Platform.OS==='android'?{channelId:channel[category]}:{})},
     trigger:null
    });
   }
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
   title:labels[category]+' • #'+id,
   body:category==='tickets'?'تحديث على التذكرة':category==='invoices'?'حالة الفاتورة: '+status:
    category==='orders'?'حالة الطلب: '+status:category==='services'?'حالة الخدمة: '+status:
     'حالة الدومين: '+status};
 });
}
export function whatsAppNotifications(rows:Array<{id:number;unread_count:number;last_message_at:string}>):NoticeInput[]{
 return rows.filter(row=>row.unread_count>0).slice(0,100).map(row=>({
  category:'whatsapp',id:row.id,revision:String(row.last_message_at)+'|'+String(row.unread_count),
  title:'رسالة واتساب جديدة',body:'يوجد تحديث في محادثة #'+row.id
 }));
}
