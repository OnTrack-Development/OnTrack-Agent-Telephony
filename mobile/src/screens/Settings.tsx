import React,{useEffect,useState} from 'react';
import * as SecureStore from 'expo-secure-store';
import * as LocalAuthentication from 'expo-local-authentication';
import {DeviceEventEmitter,View} from 'react-native';
import {Alert} from '../components/Feedback';
import {C} from '../theme';
import type {Session} from '../types';
import {Action,Card,Header,Icon,ItemRow,Notice,Pill,Section,T} from '../components/UI';
import {enableDeviceNotifications,verifyNativeFcmSetup,testDeviceNotification} from '../lib/notifications';
import {LockPolicy,readLockPolicy,saveLockPolicy} from '../lib/lockPreferences';
import {biometricChoiceKey} from '../components/AppLock';

export function Settings({session,demo,onLogout,onLock,onLockPolicyChange,capabilities,errors}:{
 session:Session|null;demo:boolean;onLogout:()=>void;onLock?:()=>void;onLockPolicyChange?:(policy:LockPolicy)=>void;
 capabilities:Record<string,boolean>;errors:Record<string,string>;
}){
 const [policy,setPolicy]=useState<LockPolicy>('after_5m'),[lockSaving,setLockSaving]=useState(false);
 const [biometric,setBiometric]=useState(false),[bioBusy,setBioBusy]=useState(false);
 useEffect(()=>{
  if(!session)return;
  let active=true;
  void readLockPolicy(session.baseUrl).then(p=>{if(active)setPolicy(p);}).catch(()=>{});
  void SecureStore.getItemAsync(biometricChoiceKey(session.baseUrl)).then(v=>{if(active)setBiometric(v==='enabled');}).catch(()=>{});
  return()=>{active=false;};
 },[session?.baseUrl]);
 const applyPolicy=async(value:LockPolicy)=>{
  if(!session||lockSaving)return;
  const execute=async()=>{
   setLockSaving(true);
   try{
    await saveLockPolicy(session.baseUrl,value);
    setPolicy(value);onLockPolicyChange?.(value);
   }catch{Alert.alert('تعذر حفظ اختيار القفل','لم تتغير إعدادات القفل.');}
   finally{setLockSaving(false);}
  };
  if(value==='off'){
   Alert.alert('إيقاف قفل التطبيق',
    'بيانات WHMCS هتبقى متاحة لأي شخص يفتح موبايلك وهو مفتوح. تسجيل الدخول إلى WHMCS نفسه هيفضل مؤمّن. تأكد إنك عايز تعطّل قفل التطبيق.',
    [{text:'إلغاء',style:'cancel'},{text:'إيقاف قفل التطبيق',style:'destructive',onPress:()=>void execute()}]);
  }else await execute();
 };
 const setBiometricChoice=async(next:boolean)=>{
  if(!session||bioBusy)return;
  setBioBusy(true);
  try{
   if(next){
    const supported=await LocalAuthentication.hasHardwareAsync()&&await LocalAuthentication.isEnrolledAsync();
    if(!supported)throw Error('البصمة غير متوفرة أو مش متسجلة على الجهاز.');
    const auth=await LocalAuthentication.authenticateAsync({promptMessage:'تفعيل الدخول بالبصمة لتطبيق WHMCS'});
    if(!auth.success)return;
   }
   await SecureStore.setItemAsync(biometricChoiceKey(session.baseUrl),next?'enabled':'disabled',{
    keychainAccessible:SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY});
   setBiometric(next);
  }catch(e){Alert.alert('البصمة',e instanceof Error?e.message:'تعذر تغيير إعداد البصمة.');}
  finally{setBioBusy(false);}
 };
 const firebaseTest=()=>{
  void verifyNativeFcmSetup().then(result=>{
   const text=result.ready?
    'اتصال الجهاز بـFirebase جاهز. الإشعارات البعيدة لسه محتاجة ربط الموظف بخدمة Push المركزية.':
    result.reason==='permission_denied'?'اسمح بالإشعارات من إعدادات Android.':
    result.reason==='android_only'?'الفحص متاح على Android فقط.':
    'مش قادر أستخرج رمز FCM؛ تحقق من الإنترنت وخدمات Google وتحديث التطبيق.';
   Alert.alert(result.ready?'فحص Firebase ناجح':'فحص Firebase',text);
  }).catch(()=>Alert.alert('فحص Firebase','تعذر إتمام فحص الجهاز'));
 };
 return <View style={{paddingBottom:30,gap:3}}>
  <Header title="الإعدادات" subtitle="الخصوصية والأمان وتجربة التطبيق"
   right={<Icon name="tune-variant" color={C.red} size={25}/>}/>
  <Section title="الربط والحساب"/>
  <Card style={{paddingHorizontal:16,paddingVertical:4}}>
   <ItemRow icon="server-security" color={C.blue} heading="سيرفر WHMCS"
    subtitle={session?.baseUrl||'غير متصل'}/>
   <ItemRow icon="account-key-outline" color={C.purple} heading="طريقة الدخول"
    subtitle={session?.mode==='admin'?'Admin Legacy':session?.mode==='api'?'Restricted API Credentials':'عرض تجريبي'}/>
   <ItemRow icon="fingerprint" color={C.green} heading="تخزين الجلسة"
    subtitle="بيانات الحساب مشفّرة محليًا على الجهاز"/>
  </Card>
  <Section title="الإشعارات"/>
  <Card style={{gap:14}}>
   <View style={{flexDirection:'row-reverse',gap:11,alignItems:'center'}}>
    <View style={{width:44,height:44,borderRadius:15,backgroundColor:C.red+'16',
     alignItems:'center',justifyContent:'center'}}>
     <Icon name="bell-ring-outline" color={C.red} size={23}/>
    </View>
    <View style={{flex:1,gap:4}}>
     <T size={15} weight="800">تنبيهات WHMCS</T>
     <T size={11} color={C.muted}>التذاكر والطلبات والعملاء وواتساب</T>
    </View>
   </View>
   <Action icon="bell-check-outline" label="تفعيل إشعارات الجهاز" onPress={()=>
    void enableDeviceNotifications().then(ok=>
     Alert.alert(ok?'تم السماح بالإشعارات':'إشعارات Android',
      ok?'إذن الجهاز جاهز.':'اسمح بالإشعارات من إعدادات Android.')
    ).catch(()=>Alert.alert('تنبيهات الجهاز','تعذّر الحصول على الإذن.'))}/>
   <Action icon="bell-ring" secondary label="إرسال إشعار تجريبي على الجهاز" onPress={()=>
    void testDeviceNotification().then(result=>{
     if(result==='permission_denied')
      Alert.alert('إشعارات Android مقفولة','افتح إعدادات التطبيق من Android ← الإشعارات، واسمح بإشعارات WHMCS وقناة واتساب.');
    }).catch(()=>Alert.alert('اختبار الإشعارات','تعذر إرسال إشعار محلي. راجع إعدادات إشعارات Android.'))}/>
   <Action label="اختبار اتصال Firebase للجهاز" secondary
    icon="shield-check-outline" onPress={firebaseTest}/>
   <Notice tone="info" title="حالة الإشعارات اللحظية"
    message="مكوّن Firebase موجود في التطبيق. وصول Push والجهاز مغلق يحتاج إكمال تسجيل الأجهزة والموظفين على السيرفر."/>
  </Card>
  <Section title="التحديثات"/>
  <Card style={{gap:13}}>
   <View style={{flexDirection:'row-reverse',alignItems:'center',gap:11}}>
    <Icon name="cellphone-arrow-down" color={C.blue} size={26}/>
    <View style={{flex:1,gap:3}}>
     <T size={14} weight="800">نسخة التطبيق</T>
     <T size={11} color={C.muted}>فحص الإصدار الموقّع الموجود على موقع OnTrack</T>
    </View>
   </View>
   <Action label="البحث عن تحديث جديد" secondary icon="refresh"
    onPress={()=>DeviceEventEmitter.emit('whmcs-check-update')}/>
  </Card>
  <Section title="صلاحيات الحساب"/>
  <Card style={{paddingHorizontal:16,paddingVertical:3}}>
   {Object.entries(capabilities).filter(([key])=>key.endsWith('.read')).map(([key,allowed])=>
    <ItemRow key={key} icon={allowed?'check-circle-outline':'lock-outline'}
     color={allowed?C.green:C.orange} heading={key}
     right={<Pill label={allowed?'مسموح':'غير متاح'} color={allowed?C.green:C.orange}/>}/>)}
   {!Object.keys(capabilities).length?<T color={C.muted} size={12}>تظهر صلاحيات WHMCS بعد الاتصال.</T>:null}
  </Card>
  {Object.keys(errors).length?<View style={{marginTop:14,gap:9}}>
   {Object.entries(errors).map(([key,value])=>
    <Notice key={key} tone="warning" title={key} message={value}/>)}
  </View>:null}
  <Section title="قفل التطبيق"/>
  <Card style={{gap:12}}>
   <T weight="800" size={14}>متى يطلب التطبيق البصمة أو رمز القفل؟</T>
   {([
    ['off','إيقاف قفل التطبيق','بدون بصمة أو رمز سري محلي'],
    ['on_launch','عند فتح التطبيق من جديد','من غير طلب بصمة عند التنقل بين التطبيقات'],
    ['after_5m','بعد 5 دقائق بالخلفية','الافتراضي؛ التنقل السريع من غير قفل'],
    ['immediate','فور مغادرة التطبيق','أقصى حماية']
   ] as [LockPolicy,string,string][]).map(([value,title,subtitle])=>
    <Action key={value} secondary={policy!==value}
     icon={policy===value?'check-circle-outline':'circle-outline'}
     label={title} disabled={lockSaving||!session}
     onPress={()=>void applyPolicy(value)}/>)}
   <T color={C.muted} size={11}>{policy==='off'?'القفل المحلي معطّل باختيارك.':
    policy==='on_launch'?'يُطلب رمز القفل بعد إغلاق التطبيق وفتحه من جديد.':
    policy==='after_5m'?'تبديل التطبيقات لمدة أقل من 5 دقائق لا يطلب بصمة.':
    'سيطلب التطبيق قفله بمجرد العودة إليه بعد تركه.'}</T>
   {policy!=='off'?<Action secondary icon="fingerprint" disabled={bioBusy}
    label={biometric?'إيقاف استخدام البصمة (الرمز يفضل شغال)':'تفعيل استخدام البصمة'}
    onPress={()=>void setBiometricChoice(!biometric)}/>:null}
   <View style={{flexDirection:'row-reverse',gap:10,alignItems:'center'}}>
    <Icon name="fingerprint" size={25} color={C.green}/>
    <View style={{flex:1,gap:4}}>
     <T size={14} weight="800">تأمين الدخول</T>
     <T color={C.muted} size={11}>رمز سري محلي + بصمة عند توفرها</T>
    </View>
   </View>
   <Notice tone="info" title="الخصوصية"
    message="القفل ده لحماية التطبيق محليًا فقط، ومش بيغير صلاحيات WHMCS. اختار المدة المناسبة ليك؛ الحساب نفسه يفضل محمي بنظام WHMCS."/>
   {session&&!demo&&policy!=='off'?<Action secondary icon="lock-outline" label="قفل التطبيق الآن" onPress={()=>onLock?.()}/>:null}
  </Card>
  <Section title="إدارة الجلسة"/>
  <Card style={{gap:13}}>
   <Notice tone="warning" title="بيانات الجهاز"
    message="مسح الربط هيحذف بيانات الدخول المحفوظة على الجهاز، من غير تغيير حساب WHMCS على السيرفر."/>
   <Action secondary icon="logout" label={demo?'إنهاء الوضع التجريبي':'مسح بيانات الربط'}
    onPress={()=>Alert.alert('تأكيد الخروج','هل تريد حذف جلسة WHMCS من الجهاز؟',[
     {text:'رجوع',style:'cancel'},
     {text:'مسح الجلسة',style:'destructive',onPress:onLogout}
    ])}/>
  </Card>
 </View>;
}
