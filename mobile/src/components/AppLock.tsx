import React,{useEffect,useRef,useState} from 'react';
import {ActivityIndicator,Pressable,TextInput,View} from 'react-native';
import * as LocalAuthentication from 'expo-local-authentication';
import * as Crypto from 'expo-crypto';
import * as SecureStore from 'expo-secure-store';
import {md5} from 'js-md5';
import {C} from '../theme';
import {Action,Card,Icon,Notice,T} from './UI';
import type {Session} from '../types';

/**
 * Protect the restored WHMCS administration session before rendering ANY data.
 * Device-specific encrypted SecureStore record; no password is sent to a server.
 * A new installation must enroll and confirm a 6–10 digit app PIN.
 * Biometric is an optional shortcut; PIN remains an offline fallback.
 */
const prefix='whmcs-applock-v1-';
export function appLockKey(baseUrl:string){return prefix+md5(baseUrl.toLowerCase().replace(/\/+$/,''));}
interface PINRecord {version:1;salt:string;digest:string;failed:number;blockedUntil:number}
export function validatePin(value:string){return /^\d{6,10}$/.test(value);}
function recordValid(v:any):v is PINRecord{
 return v?.version===1&&typeof v.salt==='string'&&/^[a-f0-9]{32}$/.test(v.salt)
  &&typeof v.digest==='string'&&/^[a-f0-9]{64}$/.test(v.digest)
  &&Number.isSafeInteger(v.failed)&&Number.isFinite(v.blockedUntil);
}
async function hashed(pin:string,salt:string){return Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256,'whmcs-pin-v1:'+salt+':'+pin);}
async function readRecord(key:string):Promise<PINRecord|null>{
 const data=await SecureStore.getItemAsync(key);
 if(!data)return null;
 const v=JSON.parse(data);
 if(!recordValid(v))throw Error('بيانات قفل التطبيق غير صالحة. لا يمكن تجاوز القفل.');
 return v;
}
const deviceOption={keychainAccessible:SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY};

export function AppLock({session,onUnlock}:{session:Session;onUnlock:()=>void}){
 const key=appLockKey(session.baseUrl);
 const [phase,setPhase]=useState<'loading'|'enroll'|'confirm'|'unlock'|'error'>('loading');
 const [pin,setPin]=useState(''),[first,setFirst]=useState(''),[message,setMessage]=useState('');
 const [busy,setBusy]=useState(false),[biometric,setBiometric]=useState(false);
 const [blockedUntil,setBlockedUntil]=useState(0);
 const active=useRef(true),request=useRef(false);
 const onUnlockRef=useRef(onUnlock);onUnlockRef.current=onUnlock;
 useEffect(()=>{
  active.current=true;let valid=true;
  setPhase('loading');setPin('');setFirst('');setMessage('');request.current=false;
  const init=async()=>{
   try{
    const rec=await readRecord(key);
    if(!valid)return;
    setBlockedUntil(rec?.blockedUntil||0);
    setPhase(rec?'unlock':'enroll');
    const available=await LocalAuthentication.hasHardwareAsync()
     &&await LocalAuthentication.isEnrolledAsync();
    if(valid)setBiometric(available);
   }catch{if(valid){setPhase('error');setMessage('تعذر قراءة قفل التطبيق من التخزين المشفر.');}}
  };
  void init();
  return()=>{valid=false;active.current=false;};
 },[key]);
 const authenticate=async()=>{
  if(request.current||!biometric||phase!=='unlock'||Date.now()<blockedUntil)return;
  request.current=true;setBusy(true);setMessage('');
  try{
   const result=await LocalAuthentication.authenticateAsync({
    promptMessage:'فتح إدارة WHMCS',promptSubtitle:'تأكيد هوية مستخدم الجهاز',
    fallbackLabel:'استخدم رمز قفل الجهاز',disableDeviceFallback:false,cancelLabel:'إلغاء'
   });
   if(result.success&&active.current)onUnlockRef.current();
   else if(active.current&&!['user_cancel','system_cancel'].includes(result.success?'':result.error||''))setMessage('لم يتم التحقق. جرّب البصمة أو رمز التطبيق.');
  }catch{if(active.current)setMessage('التحقق الحيوي غير متاح. استخدم رمز التطبيق.');}
  finally{request.current=false;if(active.current)setBusy(false);}
 };
 const submit=async()=>{
  if(request.current||!validatePin(pin)){setMessage('رمز التطبيق لازم يكون من 6 إلى 10 أرقام.');return;}
  if(phase==='confirm'){
   if(pin!==first){setMessage('الرمزان غير متطابقين. حاول مرة أخرى.');setPin('');return;}
   request.current=true;setBusy(true);
   try{
    const salt=Array.from(Crypto.getRandomBytes(16),n=>n.toString(16).padStart(2,'0')).join('');
    const digest=await hashed(pin,salt);
    const data:PINRecord={version:1,salt,digest,failed:0,blockedUntil:0};
    await SecureStore.setItemAsync(key,JSON.stringify(data),deviceOption);
    if(active.current)onUnlockRef.current();
   }catch{if(active.current){setMessage('تعذر حماية الرمز على هذا الجهاز.');setPhase('error');}}
   finally{request.current=false;if(active.current)setBusy(false);}
   return;
  }
  if(phase==='enroll'){setFirst(pin);setPin('');setMessage('اكتب نفس الرمز مرة ثانية للتأكيد.');setPhase('confirm');return;}
  if(phase!=='unlock')return;
  if(Date.now()<blockedUntil){setMessage('محاولات كتير. انتظر انتهاء مهلة الأمان.');return;}
  request.current=true;setBusy(true);setMessage('');
  try{
   const rec=await readRecord(key);
   if(!rec)throw Error('Missing PIN');
   if(Date.now()<rec.blockedUntil){setBlockedUntil(rec.blockedUntil);setMessage('القفل مؤقتًا بسبب محاولات خاطئة.');return;}
   const digest=await hashed(pin,rec.salt);
   // Compare all digest bytes to avoid early-out comparison branches.
   let mismatch=0;for(let i=0;i<rec.digest.length;i++)mismatch|=rec.digest.charCodeAt(i)^digest.charCodeAt(i);
   if(mismatch===0){
    await SecureStore.setItemAsync(key,JSON.stringify({...rec,failed:0,blockedUntil:0}),deviceOption);
    if(active.current)onUnlockRef.current();
   }else{
    const failed=rec.failed+1;
    const blocked=failed>=5?Date.now()+Math.min(900000,60000*Math.pow(2,Math.min(4,failed-5))):0;
    await SecureStore.setItemAsync(key,JSON.stringify({...rec,failed,blockedUntil:blocked}),deviceOption);
    if(active.current){setPin('');setBlockedUntil(blocked);setMessage(blocked?'تم قفل المحاولات لمدة مؤقتة.':'رمز غير صحيح.');}
   }
  }catch{if(active.current){setPhase('error');setMessage('تعذر تأكيد بيانات القفل. لن نعرض لوحة الإدارة.');}}
  finally{request.current=false;if(active.current)setBusy(false);}
 };
 return <View style={{flex:1,backgroundColor:C.bg,justifyContent:'center',
  paddingHorizontal:24,paddingVertical:30}}>
  <Card style={{padding:23,gap:17,borderRadius:24}}>
   <View style={{alignItems:'center',gap:12,paddingTop:8}}>
    <View style={{height:76,width:76,borderRadius:25,backgroundColor:C.red+'1D',
     borderColor:C.red+'4C',borderWidth:1,justifyContent:'center',alignItems:'center'}}>
     <Icon name={phase==='enroll'||phase==='confirm'?'shield-key-outline':'lock-outline'}
      color={C.red} size={37}/>
    </View>
    <T size={24} weight="900" style={{textAlign:'center'}}>
     {phase==='enroll'?'تأمين التطبيق':phase==='confirm'?'تأكيد رمز القفل':'WHMCS محمي'}
    </T>
    <T size={12} color={C.muted} style={{textAlign:'center'}}>
     {phase==='enroll'?'أنشئ رمزًا محليًا لفتح الحساب في المرات القادمة.':
      phase==='confirm'?'أدخل الرمز نفسه مرة ثانية.':'بيانات عملائك مخفية لحد تأكيد الهوية.'}
    </T>
   </View>
   {phase==='loading'?<ActivityIndicator color={C.red}/>:null}
   {phase==='error'?<Notice tone="danger" title="القفل غير متاح" message={message}/>:null}
   {phase!=='loading'&&phase!=='error'?<>
    <TextInput accessibilityLabel="رمز قفل التطبيق" value={pin}
     onChangeText={v=>setPin(v.replace(/\D/g,'').slice(0,10))}
     placeholder="رمز من 6 إلى 10 أرقام" placeholderTextColor={C.muted}
     keyboardType="number-pad" secureTextEntry autoComplete="off" autoCorrect={false}
     style={{height:58,borderWidth:1,borderColor:C.stroke,backgroundColor:C.surface2,
      color:C.text,borderRadius:15,textAlign:'center',fontSize:23,letterSpacing:5}}/>
    {message?<Notice tone="warning" title="تنبيه أمني" message={message}/>:null}
    <Action label={phase==='enroll'?'التالي':phase==='confirm'?'حفظ القفل':'فتح التطبيق'}
     icon="lock-open-check-outline" disabled={busy||!validatePin(pin)||Date.now()<blockedUntil}
     onPress={()=>void submit()}/>
    {phase==='unlock'&&biometric?<Action secondary icon="fingerprint"
     label="فتح بالبصمة أو قفل الجهاز" disabled={busy||Date.now()<blockedUntil}
     onPress={()=>void authenticate()}/>:null}
   </>:null}
  </Card>
 </View>;
}
