import React,{useEffect,useState} from 'react';
import {Alert,Linking,TextInput,View} from 'react-native';
import {C} from '../theme';
import {Action,Card,T} from './UI';
import type {Session} from '../types';
import {adminSessionReady,loginAdmin,savedAdminDirectory,validateAdminDirectory} from '../lib/adminSession';
import {validateBaseUrl} from '../lib/api';

export function AdminAccess({session,onReady}:{session:Session;onReady:()=>void}){
 const [directory,setDirectory]=useState('admin'),[username,setUsername]=useState(session.mode==='admin'?session.username:'');
 const [password,setPassword]=useState(session.mode==='admin'?session.password:''),[otp,setOtp]=useState('');
 const [needsOtp,setNeedsOtp]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const [ready,setReady]=useState(adminSessionReady(session));
 useEffect(()=>{let active=true;void savedAdminDirectory(session).then(dir=>{if(active)setDirectory(dir);});return()=>{active=false};},[session]);
 const login=async()=>{
  setBusy(true);setError('');
  try{
   const result=await loginAdmin(session,directory,username,password,otp);
   setNeedsOtp(result.needsOtp);setReady(result.ready);
   if(result.ready){setPassword('');setOtp('');onReady();}
  }catch(e){setError(e instanceof Error?e.message:'تعذر تسجيل الدخول');}
  finally{setBusy(false);}
 };
 const checkBrowser=async()=>{
  try{
   const dir=validateAdminDirectory(directory,session.baseUrl);
   const url=validateBaseUrl(session.baseUrl)+'/'+dir+'/';
   await Linking.openURL(url);
  }catch(e){
   Alert.alert('رابط إدارة WHMCS',e instanceof Error?e.message:'تعذر فتح الرابط');
  }
 };
 const field={color:C.text,backgroundColor:C.surface2,borderWidth:1,borderColor:C.stroke,borderRadius:12,padding:12,textAlign:'right' as const};
 if(ready&&adminSessionReady(session))return <Card style={{gap:8}}><T size={12} color={C.green}>جلسة الإدارة متصلة</T></Card>;
 return <Card style={{gap:12}}>
  <T size={16} weight="800">تسجيل دخول الإدارة</T>
  <T size={12} color={C.muted}>سجّل دخول الموظف لعرض المحادثات داخل التطبيق. جلسة المتصفح منفصلة عن جلسة التطبيق، حتى لو الرابط بيفتح عندك عادي.</T>
  {!needsOtp?<>
   <TextInput accessibilityLabel="مجلد إدارة WHMCS" placeholder="اسم المجلد أو رابط لوحة الإدارة" placeholderTextColor={C.muted} value={directory} onChangeText={setDirectory} autoCapitalize="none" autoCorrect={false} style={field}/>
   <T size={12} color={C.muted}>تقدر تكتب اسم المجلد فقط، أو تلصق رابط إدارة WHMCS الكامل من المتصفح. ده غير رابط ويبهوك واتساب.</T>
   <Action label="اختبار فتح رابط الإدارة بالمتصفح" compact secondary icon="open-in-new" onPress={()=>void checkBrowser()}/>
   <TextInput accessibilityLabel="اسم الموظف" placeholder="اسم الموظف" placeholderTextColor={C.muted} value={username} onChangeText={setUsername} autoCapitalize="none" autoCorrect={false} style={field}/>
   <TextInput accessibilityLabel="كلمة المرور" placeholder="كلمة المرور" placeholderTextColor={C.muted} value={password} onChangeText={setPassword} secureTextEntry autoCapitalize="none" style={field}/>
  </>:<TextInput accessibilityLabel="رمز التحقق" placeholder="رمز التحقق بخطوتين" placeholderTextColor={C.muted} value={otp} onChangeText={setOtp} keyboardType="number-pad" style={field}/>}
  {error?<T size={12} color={C.orange}>{error}</T>:null}
  <Action disabled={busy} label={busy?'جارٍ الدخول...':needsOtp?'تأكيد رمز التحقق':'دخول الإدارة'} icon="shield-account" onPress={()=>void login()}/>
 </Card>;
}
