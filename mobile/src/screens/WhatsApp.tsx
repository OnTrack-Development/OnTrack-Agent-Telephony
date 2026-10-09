import React,{useEffect,useState} from 'react';
import {Alert,Linking,TextInput,View} from 'react-native';
import * as SecureStore from 'expo-secure-store';
import {C} from '../theme';
import type {Chat,Session} from '../types';
import {Action,Card,Header,Icon,T} from '../components/UI';
import {validateBaseUrl} from '../lib/api';

const SETTINGS='whmcs-existing-whatsapp-admin-directory-v1';
export function existingInboxUrl(baseUrl:string,adminDirectory:string):string{
 const base=new URL(validateBaseUrl(baseUrl));
 const dirname=adminDirectory.trim().replace(/^\/+|\/+$/g,'');
 // Prevent remote domain injection; only the admin-directory segment is customizable.
 if(!/^[A-Za-z0-9_-]{2,64}$/.test(dirname))throw Error('اكتب اسم مجلد إدارة WHMCS فقط بدون رابط أو رموز خاصة');
 return base.origin+base.pathname.replace(/\/+$/,'')+'/'+dirname+'/addonmodules.php?module=whatsapp_notifications';
}
export function WhatsApp({session,demo=false}:{
 session:Session|null;chats:Chat[];enabled:boolean;canSend:boolean;onSend:(id:string,text:string)=>Promise<boolean>;demo:boolean;
}){
 const [adminDir,setAdminDir]=useState('admin'),[opening,setOpening]=useState(false);
 const [error,setError]=useState('');
 useEffect(()=>{
  let active=true;
  if(session)void SecureStore.getItemAsync(SETTINGS+'|'+validateBaseUrl(session.baseUrl)).then(saved=>{
   if(active&&saved)setAdminDir(saved);
  }).catch(()=>{});
  return()=>{active=false};
 },[session?.baseUrl]);
 const open=async()=>{
  if(!session)return;
  setOpening(true);setError('');
  try{
   const uri=existingInboxUrl(session.baseUrl,adminDir);
   // Native app does not receive or store browser admin cookies or Meta access tokens.
   await Linking.openURL(uri);
   await SecureStore.setItemAsync(SETTINGS+'|'+validateBaseUrl(session.baseUrl),adminDir.trim(),{
    keychainAccessible:SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY
   });
  }catch(e){
   const message=e instanceof Error?e.message:'تعذر فتح صفحة واتساب';
   setError(message);
   Alert.alert('تعذر فتح صندوق الواتساب',message);
  }finally{setOpening(false);}
 };
 return <View style={{gap:15,paddingBottom:22}}>
  <Header title="واتساب" subtitle="صندوق محادثات WHMCS الحالي" right={<Icon name="whatsapp" color={C.green} size={30}/>}/>
  <Card style={{gap:13}}>
   <View style={{flexDirection:'row-reverse',alignItems:'center',gap:10}}>
    <Icon name="shield-check-outline" color={C.green} size={25}/>
    <View style={{flex:1,gap:4}}>
     <T weight="800" size={16}>استخدام الموديول الموجود</T>
     <T color={C.muted} size={12}>بدون تثبيت موديول جديد أو تعديل webhook.php أو حفظ مفتاح Meta داخل التطبيق.</T>
    </View>
   </View>
   <Action label={opening?'جارٍ فتح المحادثات...':'فتح واتساب الحالي في WHMCS'}
    icon="open-in-new" disabled={!session||opening||demo} onPress={()=>void open()}/>
   <T color={C.muted} size={12}>تُفتح لوحة الإدارة الأصلية بالمتصفح حتى تبقى صلاحيات الموظفين والمحادثات والصور والصوت تحت حماية WHMCS الموجودة بالفعل.</T>
  </Card>
  <Card style={{gap:10}}>
   <T weight="800" size={14}>مسار لوحة الإدارة</T>
   <T color={C.muted} size={12}>لو اسم مجلد إدارة WHMCS متغير، اكتب اسم المجلد الصحيح هنا. غالبًا لا تحتاج تعديل القيمة الافتراضية.</T>
   <TextInput value={adminDir} onChangeText={setAdminDir} autoCapitalize="none" autoCorrect={false}
    placeholder="admin" placeholderTextColor={C.muted}
    style={{color:C.text,textAlign:'center',backgroundColor:C.surface2,borderWidth:1,borderColor:C.stroke,borderRadius:12,paddingVertical:10,paddingHorizontal:14}}/>
   {error?<T color={C.orange} size={12}>{error}</T>:null}
  </Card>
  <T color={C.muted} size={12}>قراءة وإرسال الرسائل داخل التطبيق نفسه تتطلب واجهة مصادقة إدارية موثقة من الموديول الحالي. Verify Token وحده لا يوفر سجل المحادثات أو صلاحيات الإرسال، لذلك لن أستخدمه كرمز دخول.</T>
 </View>;
}
