import React,{useEffect,useState} from 'react';
import * as SecureStore from 'expo-secure-store';
import * as LocalAuthentication from 'expo-local-authentication';
import {DeviceEventEmitter,View} from 'react-native';
import {Alert} from '../components/Feedback';
import {C,ThemePreference} from '../theme';
import type {Session} from '../types';
import {Action,Card,Header,Icon,ItemRow,Notice,Pill,Section,T} from '../components/UI';
import {enableDeviceNotifications,verifyNativeFcmSetup,testDeviceNotification} from '../lib/notifications';
import {LockPolicy,readLockPolicy,saveLockPolicy} from '../lib/lockPreferences';
import {biometricChoiceKey} from '../components/AppLock';
import {restoreTelegramWhatsApp,registerWhatsAppPush,whatsAppPushStatus} from '../lib/whatsapp';

export function Settings({session,demo,onLogout,onLock,onLockPolicyChange,capabilities,errors,
 themePreference,effectiveTheme,onThemeChange}:{
 session:Session|null;demo:boolean;onLogout:()=>void;onLock?:()=>void;onLockPolicyChange?:(policy:LockPolicy)=>void;
 capabilities:Record<string,boolean>;errors:Record<string,string>;
 themePreference:ThemePreference;effectiveTheme:'light'|'dark';onThemeChange:(value:ThemePreference)=>void;
}){
 const [policy,setPolicy]=useState<LockPolicy>('after_5m'),[lockSaving,setLockSaving]=useState(false);
 const [biometric,setBiometric]=useState(false),[bioBusy,setBioBusy]=useState(false);
 const [showAdvancedPush,setShowAdvancedPush]=useState(false);
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
 const enableBackgroundPush=async()=>{
  if(!session)return;
  try{
   const ok=await enableDeviceNotifications();
   if(!ok){Alert.alert('الإشعارات متوقفة','اسمح بإشعارات WHMCS من إعدادات Android أولًا.');return;}
   const paired=await restoreTelegramWhatsApp(session);
   if(!paired)throw Error('ربط واتساب عبر TelegramNotify مطلوب أولًا.');
   const status=await whatsAppPushStatus(session);
   if(!status.configured){
    Alert.alert('إشعارات الخلفية غير متاحة','مفتاح Firebase FCM Service Account غير مجهز على سيرفر WHMCS. جهزه بصورة آمنة داخل إعدادات TelegramNotify أولًا، ثم أعد الربط.');
    return;
   }
   const result=await registerWhatsAppPush(session);
   if(result!=='registered')throw Error(result==='fcm_unavailable'?
    'Firebase غير متاح على الجهاز. تأكد من Google Play Services.':'لم تتم الموافقة على إشعارات Android.');
   Alert.alert('تم تسجيل واتساب فقط','تم ربط جهازك بإشعارات واتساب على السيرفر، لكن وصول Push لم يتأكد بعد. جرّب استقبال رسالة والتطبيق مقفول مع تشغيل Cron. تنبيهات التذاكر والطلبات حاليًا محلية أثناء تشغيل التطبيق.');
  }catch(e){Alert.alert('إعداد إشعارات الخلفية',e instanceof Error?e.message:'تعذر ربط الجهاز بالإشعارات.');}
 };
 const checkBackgroundPush=async()=>{
  if(!session)return;
  try{
   const paired=await restoreTelegramWhatsApp(session);
   if(!paired)throw Error('اربط TelegramNotify من صفحة واتساب أولًا.');
   const s=await whatsAppPushStatus(session);
   Alert.alert('حالة FCM على السيرفر',s.configured?
    'إرسال FCM مهيأ على السيرفر. عدد الأجهزة المسجلة: '+s.registered_devices+
    '. يلزم تشغيل Cron واختبار رسالة جديدة للتأكد من التسليم.':
    'مفاتيح FCM Service Account غير مهيأة على السيرفر. الإشعارات والتطبيق مقفول لن تصل حتى يتم إعدادها.');
  }catch(e){Alert.alert('حالة FCM',e instanceof Error?e.message:'تعذر فحص خدمة FCM.');}
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
  <Card style={{gap:8}}>
   <View style={{flexDirection:'row-reverse',gap:10,alignItems:'center'}}>
    <View style={{width:39,height:39,borderRadius:13,backgroundColor:C.red+'16',
     alignItems:'center',justifyContent:'center'}}>
     <Icon name="bell-ring-outline" color={C.red} size={23}/>
    </View>
    <View style={{flex:1,gap:4}}>
     <T size={14} weight="800">تنبيهات WHMCS</T>
     <T size={11} color={C.muted}>داخل التطبيق؛ واتساب في الخلفية بعد إعداد السيرفر</T>
    </View>
   </View>
   <Action compact icon="bell-check-outline" label="السماح بالإشعارات" onPress={()=>
    void enableDeviceNotifications().then(ok=>
     Alert.alert(ok?'تم السماح بالإشعارات':'إشعارات Android',
      ok?'إذن الجهاز جاهز.':'اسمح بالإشعارات من إعدادات Android.')
    ).catch(()=>Alert.alert('تنبيهات الجهاز','تعذّر الحصول على الإذن.'))}/>
   <Action compact icon="bell-ring" secondary label="اختبار إشعار محلي" onPress={()=>
    void testDeviceNotification().then(result=>{
     if(result==='permission_denied')
      Alert.alert('إشعارات Android مقفولة','افتح إعدادات التطبيق من Android ← الإشعارات، واسمح بإشعارات WHMCS وقناة واتساب.');
    }).catch(()=>Alert.alert('اختبار الإشعارات','تعذر إرسال إشعار محلي. راجع إعدادات إشعارات Android.'))}/>
   <Action compact secondary icon="bell-badge-outline" label="ربط إشعارات واتساب بالخلفية"
    onPress={()=>void enableBackgroundPush()}/>
   <Action compact secondary icon={showAdvancedPush?'chevron-up':'information-outline'}
    label={showAdvancedPush?'إخفاء التشخيص':'تشخيص إشعارات الخلفية'}
    onPress={()=>setShowAdvancedPush(value=>!value)}/>
   {showAdvancedPush?<View style={{gap:8}}>
    <Action compact secondary icon="cloud-check-outline" label="فحص FCM على السيرفر"
     onPress={()=>void checkBackgroundPush()}/>
    <Action compact secondary icon="shield-check-outline" label="فحص Firebase على الجهاز"
     onPress={firebaseTest}/>
    <Notice tone="info" title="حالة Push الحقيقية"
     message="اختبار الإشعار المحلي لا يثبت وصول إشعارات الخلفية. واتساب يحتاج مفتاح خدمة FCM آمنًا في TelegramNotify مع Cron. التذاكر والطلبات والعملاء حاليًا تُفحص أثناء تشغيل التطبيق فقط."/>
   </View>:null}
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
  <Section title="المظهر والألوان"/>
  <Card style={{gap:11}}>
   <T size={13} weight="800">اختيار المظهر</T>
   <T color={C.muted} size={11}>الافتراضي حسب إعدادات Android. التغيير يطبّق فورًا على واجهات التطبيق.</T>
   <View style={{flexDirection:'row-reverse',gap:7}}>
    {([
     ['system','حسب النظام','theme-light-dark'],
     ['light','فاتح','weather-sunny'],
     ['dark','داكن','weather-night']
    ] as [ThemePreference,string,string][]).map(([value,label,icon])=>
     <View key={value} style={{flex:1}}>
      <Action compact secondary={themePreference!==value}
       icon={themePreference===value?'check-circle-outline':icon}
       label={label} onPress={()=>onThemeChange(value)}/>
     </View>
    )}
   </View>
   <T color={C.muted} size={11}>الوضع الحالي: {effectiveTheme==='light'?'فاتح':'داكن'}</T>
  </Card>
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
