import React,{useEffect,useRef,useState} from 'react';
import {Alert,AppState,DeviceEventEmitter,Modal,NativeModules,Platform,Pressable,View} from 'react-native';
import {C} from '../theme';
import {Action,Icon,T} from './UI';

const CURRENT_VERSION='0.2.5';
const CURRENT_VERSION_CODE=6;
const UPDATE_API='https://agent.ontrackegy.com/api/app/latest.php';
const HOST='https://agent.ontrackegy.com/downloads/';
const INTERVAL=600000;
interface Latest {
 ok?:boolean;
 app_id?:string;
 version_name?:string;
 version_code?:number;
 sha256?:string;
 download_url?:string;
 size_bytes?:number;
 release_notes?:string;
}
interface Update {version:string;code:number;url:string;size:number;sha256:string;notes:string}
interface Progress {written:number;total:number}

export function validUpdate(value:Latest):Update|null {
 const version=value.version_name||'';
 const target=HOST+'WHMCS-v'+version+'-ARM64-release-signed.apk';
 const sha=value.sha256||'';
 if(value.ok!==true || value.app_id!=='com.ontrackdevelopment.command'
  || !/^\d+\.\d+\.\d+$/.test(version)
  || !Number.isInteger(value.version_code) || (value.version_code||0)<=CURRENT_VERSION_CODE
  || !/^[0-9a-f]{64}$/i.test(sha)
  || value.download_url!==target
  || !Number.isFinite(value.size_bytes) || (value.size_bytes||0)<1000000
  || (value.size_bytes||0)>105*1024*1024) return null;
 return {version,code:value.version_code!,url:target,size:value.size_bytes!,sha256:sha,notes:String(value.release_notes||'').slice(0,500)};
}

export function UpdateGate(){
 const [update,setUpdate]=useState<Update|null>(null),[hidden,setHidden]=useState(''),[busy,setBusy]=useState(false);
 const [percent,setPercent]=useState(0);
 const last=useRef(0),checking=useRef(false);
 useEffect(()=>{
  if(Platform.OS!=='android')return;
  let active=true;
  const check=async()=>{
   if(checking.current||Date.now()-last.current<INTERVAL)return;
   checking.current=true;last.current=Date.now();
   const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),12000);
   try{
    const r=await fetch(UPDATE_API,{headers:{Accept:'application/json','Cache-Control':'no-cache'},signal:controller.signal});
    if(!r.ok)return;
    const info=await r.json() as Latest;
    if(active)setUpdate(validUpdate(info));
   }catch{
    // Internet failures must not block the WHMCS administrator.
   }finally{clearTimeout(timeout);checking.current=false;}
  };
  void check();
  const appSub=AppState.addEventListener('change',s=>{if(s==='active')void check();});
  const timer=setInterval(()=>{if(AppState.currentState==='active')void check();},INTERVAL);
  return()=>{active=false;appSub.remove();clearInterval(timer);};
 },[]);
 useEffect(()=>{
  const listener=DeviceEventEmitter.addListener('commandUpdateProgress',(p:Progress)=>{
   if(p.total>0)setPercent(Math.min(100,Math.floor(p.written*100/p.total)));
  });
  return()=>listener.remove();
 },[]);
 const install=async()=>{
  if(!update||busy)return;
  if(!NativeModules.CommandUpdateInstaller?.downloadAndInstall){
   Alert.alert('التحديث غير متاح','نسخة التطبيق الحالية لا تحتوي على مثبت Android الداخلي.');
   return;
  }
  setBusy(true);setPercent(0);
  try{
   await NativeModules.CommandUpdateInstaller.downloadAndInstall(update.url,update.sha256,update.version);
   setHidden(update.version);
  }catch(error){
   Alert.alert('فشل التحديث',error instanceof Error?error.message:'تعذر تنزيل ملف APK أو التحقق منه');
  }finally{setBusy(false);}
 };
 if(Platform.OS!=='android'||!update||hidden===update.version)return null;
 return <Modal visible transparent animationType="fade" onRequestClose={()=>{if(!busy)setHidden(update.version);}}>
 <View style={{flex:1,justifyContent:'center',padding:24,backgroundColor:'#000B'}}>
 <View style={{backgroundColor:C.surface,padding:22,borderRadius:22,gap:14,borderWidth:1,borderColor:C.stroke}}>
 <Icon name="cellphone-arrow-down" color={C.red} size={31}/>
 <T size={21} weight="900">تحديث جديد متاح</T>
 <T size={13} color={C.muted}>WHMCS v{update.version} • {(update.size/1048576).toFixed(1)} MiB</T>
 {busy?<T size={13} color={C.red}>جاري التحميل والتحقق من الملف: {percent}%</T>:null}
 <T color={C.muted} size={12}>التحميل من سيرفر OnTrack داخل التطبيق؛ عند اكتماله هتظهر شاشة تثبيت أندرويد مباشرة، بدون مدير التحميلات.</T>
 <Action label={busy?`تحميل التحديث ${percent}%`:'تحديث الآن'} disabled={busy} icon="download" onPress={()=>{void install();}}/>
 <Pressable disabled={busy} onPress={()=>setHidden(update.version)} style={{alignItems:'center',padding:8}}><T color={C.muted}>لاحقًا</T></Pressable>
 </View></View></Modal>;
}
