import React,{useEffect,useRef,useState} from 'react';
import {AppState,Linking,Modal,Platform,Pressable,View} from 'react-native';
import {C} from '../theme';
import {Action,Icon,T} from './UI';
const VERSION='0.2.3';
const API='https://api.github.com/repos/OnTrack-Development/OnTrack-Agent-Telephony/releases?per_page=15';
const PREFIX='https://github.com/OnTrack-Development/OnTrack-Agent-Telephony/releases/download/';
const INTERVAL=600000;
interface Release {tag_name?:string;draft?:boolean;prerelease?:boolean;assets?:{name?:string;size?:number;browser_download_url?:string}[]}
interface Update {version:string;url:string;size:number}
export function newer(a:string,b:string){const parse=(v:string)=>/^\d+\.\d+\.\d+$/.test(v)?v.split('.').map(Number):null;const x=parse(a),y=parse(b);if(!x||!y)return false;for(let i=0;i<3;i++)if(x[i]!==y[i])return (x[i]||0)>(y[i]||0);return false;}
export function choose(releases:Release[],installed=VERSION):Update|null{
 let selected:Update|null=null;
 for(const release of releases){
  if(release.draft||release.prerelease)continue;
  const v=/^command-v(\d+\.\d+\.\d+)-\d+$/.exec(release.tag_name||'')?.[1];
  if(!v||!newer(v,installed))continue;
  const asset=(release.assets||[]).find(a=>/^OnTrack-Command-v\d+\.\d+\.\d+-ARM64-release-signed\.apk$/.test(a.name||'')&&a.browser_download_url?.startsWith(PREFIX+release.tag_name+'/')&&(a.size||0)>0);
  if(!asset?.browser_download_url)continue;
  if(!selected||newer(v,selected.version))selected={version:v,url:asset.browser_download_url,size:asset.size||0};
 }
 return selected;
}
export function UpdateGate(){
 const [update,setUpdate]=useState<Update|null>(null),[hidden,setHidden]=useState('');
 const last=useRef(0),busy=useRef(false);
 useEffect(()=>{
  if(Platform.OS!=='android')return;
  let alive=true;
  const check=async()=>{
   if(busy.current||Date.now()-last.current<INTERVAL)return;
   busy.current=true;last.current=Date.now();
   const ac=new AbortController(),timer=setTimeout(()=>ac.abort(),10000);
   try{const r=await fetch(API,{headers:{Accept:'application/vnd.github+json'},signal:ac.signal});if(!r.ok)return;
    const j:unknown=await r.json();if(Array.isArray(j)&&alive)setUpdate(choose(j as Release[]));
   }catch{}finally{clearTimeout(timer);busy.current=false;}
  };
  void check();
  const sub=AppState.addEventListener('change',s=>{if(s==='active')void check();});
  const timer=setInterval(()=>{if(AppState.currentState==='active')void check();},INTERVAL);
  return()=>{alive=false;sub.remove();clearInterval(timer);};
 },[]);
 if(!update||hidden===update.version)return null;
 return <Modal visible transparent animationType="fade" onRequestClose={()=>setHidden(update.version)}><View style={{flex:1,justifyContent:'center',padding:24,backgroundColor:'#000B'}}><View style={{backgroundColor:C.surface,padding:22,borderRadius:22,gap:14,borderWidth:1,borderColor:C.stroke}}><Icon name="cellphone-arrow-down" color={C.red} size={31}/><T size={21} weight="900">تحديث جديد متاح</T><T size={13} color={C.muted}>OnTrack Command v{update.version} • {(update.size/1048576).toFixed(1)} MB</T><T color={C.muted} size={12}>هيتم تحميل التحديث عبر أندرويد. التطبيق مش هيقفل لوحده، والتثبيت يحتاج موافقتك.</T><Action label="تحديث الآن" icon="download" onPress={()=>{void Linking.openURL(update.url).then(()=>setHidden(update.version)).catch(()=>{});}}/><Pressable onPress={()=>setHidden(update.version)} style={{alignItems:'center',padding:8}}><T color={C.muted}>لاحقًا</T></Pressable></View></View></Modal>;
}
