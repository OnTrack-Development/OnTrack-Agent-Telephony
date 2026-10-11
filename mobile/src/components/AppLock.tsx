import React,{useEffect,useRef,useState} from 'react';
import {ActivityIndicator,Pressable,TextInput,View} from 'react-native';
import * as LocalAuthentication from 'expo-local-authentication';
import * as Crypto from 'expo-crypto';
import * as SecureStore from 'expo-secure-store';
import {md5} from 'js-md5';
import {C} from '../theme';
import {Action,Card,Icon,Notice,T} from './UI';
import type {Session} from '../types';

/** A PIN must exist before an optional biometric preference can be used.
 * Neither PIN nor the biometric preference is sent to WHMCS. */
const prefix='whmcs-applock-v1-';
export const appLockKey=(baseUrl:string)=>prefix+md5(baseUrl.toLowerCase().replace(/\/+$/,''));
export const biometricChoiceKey=(baseUrl:string)=>'whmcs-bio-choice-v1-'+md5(baseUrl.toLowerCase().replace(/\/+$/,''));
type Preference='enabled'|'disabled'|'unset';
interface PINRecord {version:1;salt:string;digest:string;failed:number;blockedUntil:number}
type Phase='loading'|'enroll'|'confirm'|'offer'|'unlock'|'error';
export function validatePin(v:string){return /^\d{6,10}$/.test(v);}
function recordValid(v:any):v is PINRecord {
 return v?.version===1&&typeof v.salt==='string'&&/^[a-f0-9]{32}$/.test(v.salt)
  &&typeof v.digest==='string'&&/^[a-f0-9]{64}$/.test(v.digest)
  &&Number.isSafeInteger(v.failed)&&Number.isFinite(v.blockedUntil);
}
const secureOptions={keychainAccessible:SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY};
async function hashed(pin:string,salt:string){
 return Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256,'whmcs-pin-v1:'+salt+':'+pin);
}
async function readRecord(key:string):Promise<PINRecord|null>{
 const raw=await SecureStore.getItemAsync(key);
 if(!raw)return null;
 const value=JSON.parse(raw);
 if(!recordValid(value))throw Error('تعذر التحقق من قفل هذا الجهاز');
 return value;
}
async function getPreference(key:string):Promise<Preference>{
 const value=await SecureStore.getItemAsync(key);
 return value==='enabled'||value==='disabled'?value:'unset';
}
async function canBiometric():Promise<boolean>{
 return await LocalAuthentication.hasHardwareAsync() && await LocalAuthentication.isEnrolledAsync();
}

/** Rendered instead of protected app content until successful PIN or opted-in biometric auth.
 * Enrollment asks once, explicitly. A pre-existing PIN is asked for before migration prompt.
 * No silent enabling; no repeated prompts after a user declines.
 */
export function AppLock({session,onUnlock}:{session:Session;onUnlock:()=>void}){
 const key=appLockKey(session.baseUrl),choiceKey=biometricChoiceKey(session.baseUrl);
 const [phase,setPhase]=useState<Phase>('loading');
 const [pin,setPin]=useState(''),[first,setFirst]=useState(''),[message,setMessage]=useState('');
 const [busy,setBusy]=useState(false),[bioAvailable,setBioAvailable]=useState(false);
 const [choice,setChoice]=useState<Preference>('unset'),[showPin,setShowPin]=useState(false);
 const [blockedUntil,setBlockedUntil]=useState(0);
 const active=useRef(false),request=useRef(false),autoAttempt=useRef(false);
 const unlock=useRef(onUnlock);unlock.current=onUnlock;
 useEffect(()=>{
  let live=true;active.current=true;request.current=false;autoAttempt.current=false;
  setPhase('loading');setPin('');setFirst('');setMessage('');setShowPin(false);
  const begin=async()=>{
   try{
    const rec=await readRecord(key);
    const pref=await getPreference(choiceKey);
    const available=await canBiometric();
    if(!live)return;
    setChoice(pref);setBioAvailable(available);setBlockedUntil(rec?.blockedUntil||0);
    setPhase(rec?'unlock':'enroll');
    // If OS enrollment disappeared, PIN remains the usable default.
    setShowPin(!available||pref!=='enabled');
   }catch{if(live){setPhase('error');setMessage('تعذر قراءة إعدادات القفل المشفّرة.');}}
  };
  void begin();
  return()=>{live=false;active.current=false;};
 },[key,choiceKey]);

 const completePinVerification=()=>{
  if(choice==='unset'&&bioAvailable){setPhase('offer');setPin('');setMessage('');return;}
  unlock.current();
 };
 const tryBiometric=async(forSetup=false)=>{
  if(request.current||!bioAvailable||Date.now()<blockedUntil)return;
  if(forSetup&&phase!=='offer')return;
  if(!forSetup&&(phase!=='unlock'||choice!=='enabled'))return;
  request.current=true;setBusy(true);setMessage('');
  try{
   const result=await LocalAuthentication.authenticateAsync({
    promptMessage:forSetup?'تفعيل البصمة لتطبيق WHMCS':'افتح WHMCS بالبصمة',
    promptSubtitle:forSetup?'تأكيد اختيارك للبصمة':'أكد هويتك للمتابعة',
    fallbackLabel:'رمز قفل الجهاز',disableDeviceFallback:false,cancelLabel:'إلغاء'
   });
   if(result.success){
    if(forSetup){
     await SecureStore.setItemAsync(choiceKey,'enabled',secureOptions);
     if(active.current){setChoice('enabled');unlock.current();}
    }else if(active.current){unlock.current();}
   }else if(active.current&&!['user_cancel','system_cancel','app_cancel'].includes(result.success?'':result.error||'')){
    setMessage('تعذر التحقق بالبصمة. جرّب مرة ثانية أو استخدم رمز التطبيق.');
    if(!forSetup)setShowPin(true);
   }
  }catch{
   if(active.current){setMessage('البصمة مش متاحة حاليًا. استخدم رمز التطبيق.');if(!forSetup)setShowPin(true);}
  }finally{request.current=false;if(active.current)setBusy(false);}
 };
 useEffect(()=>{
  if(phase!=='unlock'||choice!=='enabled'||!bioAvailable||showPin||autoAttempt.current||busy)return;
  autoAttempt.current=true;
  // Wait until the lock has painted. Never open repeated OS prompts after cancel.
  const timer=setTimeout(()=>{if(active.current)void tryBiometric(false);},350);
  return()=>clearTimeout(timer);
 },[phase,choice,bioAvailable,showPin]);

 const decide=async(enabled:boolean)=>{
  if(phase!=='offer'||request.current)return;
  if(enabled){await tryBiometric(true);return;}
  request.current=true;setBusy(true);
  try{
   await SecureStore.setItemAsync(choiceKey,'disabled',secureOptions);
   if(active.current){setChoice('disabled');unlock.current();}
  }catch{if(active.current)setMessage('تعذر حفظ اختيار البصمة؛ حاول مجددًا.');}
  finally{request.current=false;if(active.current)setBusy(false);}
 };
 const submit=async()=>{
  if(request.current||!validatePin(pin)){setMessage('الرمز يجب أن يحتوي من 6 إلى 10 أرقام.');return;}
  if(phase==='enroll'){setFirst(pin);setPin('');setPhase('confirm');setMessage('أدخل نفس الرمز للتأكيد.');return;}
  if(phase==='confirm'){
   if(pin!==first){setPin('');setMessage('الرمزان غير متطابقين.');return;}
   request.current=true;setBusy(true);
   try{
    const salt=Array.from(Crypto.getRandomBytes(16),n=>n.toString(16).padStart(2,'0')).join('');
    const digest=await hashed(pin,salt);
    await SecureStore.setItemAsync(key,JSON.stringify({version:1,salt,digest,failed:0,blockedUntil:0}),secureOptions);
    if(active.current){setPin('');completePinVerification();}
   }catch{if(active.current){setPhase('error');setMessage('تعذر حماية رمز الدخول على الجهاز.');}}
   finally{request.current=false;if(active.current)setBusy(false);}
   return;
  }
  if(phase!=='unlock')return;
  if(Date.now()<blockedUntil){setMessage('مؤقتًا لا يمكن المحاولة بسبب رموز خاطئة متكررة.');return;}
  request.current=true;setBusy(true);setMessage('');
  try{
   const record=await readRecord(key);
   if(!record)throw Error('Missing PIN');
   if(Date.now()<record.blockedUntil){setBlockedUntil(record.blockedUntil);setMessage('انتظر انتهاء مهلة الأمان.');return;}
   const digest=await hashed(pin,record.salt);
   let mismatch=0;
   for(let i=0;i<record.digest.length;i++)mismatch|=record.digest.charCodeAt(i)^digest.charCodeAt(i);
   if(mismatch===0){
    await SecureStore.setItemAsync(key,JSON.stringify({...record,failed:0,blockedUntil:0}),secureOptions);
    if(active.current)completePinVerification();
   }else{
    const failed=record.failed+1;
    const timeout=failed>=5?Date.now()+Math.min(900000,60000*2**Math.min(4,failed-5)):0;
    await SecureStore.setItemAsync(key,JSON.stringify({...record,failed,blockedUntil:timeout}),secureOptions);
    if(active.current){setBlockedUntil(timeout);setPin('');setMessage(timeout?'محاولات كثيرة؛ القفل مؤقتًا.':'رمز غير صحيح.');}
   }
  }catch{if(active.current){setPhase('error');setMessage('تعذر تأكيد القفل. لن تُعرض بيانات الإدارة.');}}
  finally{request.current=false;if(active.current)setBusy(false);}
 };
 const biometricFirst=phase==='unlock'&&bioAvailable&&choice==='enabled'&&!showPin;
 return <View style={{flex:1,backgroundColor:C.bg,justifyContent:'center',paddingHorizontal:24,paddingVertical:24}}>
  <Card style={{padding:23,gap:17,borderRadius:26}}>
   <View style={{alignItems:'center',gap:12,paddingTop:7}}>
    <View style={{height:88,width:88,borderRadius:30,backgroundColor:C.red+'15',
     borderColor:C.red+'45',borderWidth:1,justifyContent:'center',alignItems:'center'}}>
     <Icon name={phase==='offer'||biometricFirst?'fingerprint':
       phase==='enroll'||phase==='confirm'?'shield-key-outline':'lock-outline'}
       color={C.red} size={47}/>
    </View>
    <T size={24} weight="900" style={{textAlign:'center'}}>
     {phase==='enroll'?'أنشئ رمز الدخول':phase==='confirm'?'تأكيد الرمز':
      phase==='offer'?'تفعيل الدخول بالبصمة':biometricFirst?'مرحبًا برجوعك':'WHMCS محمي'}
    </T>
    <T color={C.muted} size={12} style={{textAlign:'center'}}>
     {phase==='offer'?'عايز تفتح WHMCS بالبصمة من المرة الجاية؟ تقدر ترفض وتستخدم رمز التطبيق.':
      biometricFirst?'استخدم بصمة جهازك أو افتح برمز التطبيق.':
      phase==='enroll'?'رمز من 6 إلى 10 أرقام لحماية بيانات العملاء.':
      phase==='confirm'?'أدخل نفس الرمز مرة ثانية.':'بيانات العملاء مخفية حتى تأكيد الهوية.'}
    </T>
   </View>
   {phase==='loading'?<ActivityIndicator color={C.red}/>:null}
   {phase==='error'?<Notice tone="danger" title="تعذر قراءة القفل" message={message}/>:null}
   {phase==='offer'?<>
    {message?<Notice tone="warning" title="التحقق بالبصمة" message={message}/>:null}
    <Action label="تفعيل البصمة" icon="fingerprint" disabled={busy} onPress={()=>void decide(true)}/>
    <Action secondary label="ليس الآن — استخدم الرمز" icon="key-outline"
     disabled={busy} onPress={()=>void decide(false)}/>
   </>:null}
   {biometricFirst?<View style={{gap:12,alignItems:'stretch'}}>
    {message?<Notice tone="warning" title="محاولة التحقق" message={message}/>:null}
    <Pressable accessibilityRole="button" accessibilityLabel="فتح التطبيق بالبصمة" disabled={busy}
     onPress={()=>void tryBiometric(false)}
     style={({pressed})=>({minHeight:90,alignItems:'center',justifyContent:'center',
      gap:7,backgroundColor:C.surface2,borderRadius:19,borderWidth:1,
      borderColor:C.red+'50',opacity:pressed?0.75:1})}>
     <Icon name="fingerprint" color={C.red} size={37}/>
     <T weight="800" size={14}>فتح بالبصمة</T>
    </Pressable>
    <Action secondary label="استخدام رمز التطبيق بدلًا من البصمة" icon="key-outline"
     onPress={()=>{setShowPin(true);setMessage('');}}/>
   </View>:null}
   {(phase==='enroll'||phase==='confirm'||(phase==='unlock'&&!biometricFirst))?<View style={{gap:12}}>
    <TextInput accessibilityLabel="رمز قفل التطبيق" value={pin}
     onChangeText={v=>setPin(v.replace(/\D/g,'').slice(0,10))}
     keyboardType="number-pad" secureTextEntry autoComplete="off" autoCorrect={false}
     placeholder="••••••" placeholderTextColor={C.muted}
     style={{height:61,borderWidth:1,borderColor:C.stroke,backgroundColor:C.surface2,
      color:C.text,borderRadius:16,textAlign:'center',fontSize:24,letterSpacing:5}}/>
    {message?<Notice tone="warning" title="ملاحظة" message={message}/>:null}
    <Action label={phase==='enroll'?'التالي':phase==='confirm'?'حفظ الرمز':'فتح التطبيق'}
     icon="lock-open-check-outline" disabled={busy||!validatePin(pin)||Date.now()<blockedUntil}
     onPress={()=>void submit()}/>
    {phase==='unlock'&&bioAvailable&&choice==='enabled'?
     <Action secondary label="الدخول بالبصمة" icon="fingerprint"
      disabled={busy||Date.now()<blockedUntil} onPress={()=>{setShowPin(false);autoAttempt.current=true;void tryBiometric(false);}}/>:null}
   </View>:null}
  </Card>
 </View>;
}
