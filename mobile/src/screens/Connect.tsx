import React,{useState} from 'react';
import {KeyboardAvoidingView,Platform,Pressable,ScrollView,TextInput,View} from 'react-native';
import {Alert} from '../components/Feedback';
import {C} from '../theme';
import type {Session} from '../types';
import {Action,Card,Icon,Notice,T} from '../components/UI';

const blank:Session={baseUrl:'https://services.ontrackegy.com',mode:'api',
 username:'',password:'',accessKey:'',identifier:'',secret:''};
export function Connect({onPair,onDemo}:{onPair:(config:Session)=>Promise<void>;onDemo:()=>void}){
 const [config,setConfig]=useState(blank),[busy,setBusy]=useState(false);
 const edit=(key:keyof Session)=>(value:string)=>setConfig(prev=>({...prev,[key]:value}));
 const field=(title:string,key:keyof Session,secret=false)=><View key={key} style={{gap:8}}>
  <T size={12} color={C.muted} weight="700">{title}</T>
  <TextInput value={config[key]} onChangeText={edit(key)} accessibilityLabel={title}
   autoCapitalize="none" autoCorrect={false} secureTextEntry={secret}
   placeholder={title} placeholderTextColor={C.muted}
   style={{color:C.text,backgroundColor:C.surface2,borderWidth:1,borderColor:C.stroke,
    paddingHorizontal:15,paddingVertical:13,borderRadius:14,textAlign:'left',minHeight:52}}/>
 </View>;
 const required=config.mode==='api'?
  !!(config.identifier.trim()&&config.secret):!!(config.username.trim()&&config.password);
 return <KeyboardAvoidingView behavior={Platform.OS==='ios'?'padding':undefined}
  style={{flex:1,backgroundColor:C.bg}}>
  <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{
   paddingHorizontal:22,paddingTop:43,paddingBottom:60,gap:20}}>
   <View style={{gap:16,alignItems:'flex-start',marginBottom:4}}>
    <View style={{width:72,height:72,borderRadius:24,alignItems:'center',justifyContent:'center',
     borderWidth:1,borderColor:C.red+'55',backgroundColor:C.red+'16'}}>
     <Icon name="shield-check-outline" size={37} color={C.red}/>
    </View>
    <View style={{gap:7,alignSelf:'stretch'}}>
     <T size={31} weight="900">مساحة الإدارة</T>
     <T size={14} color={C.muted}>اتصل بسيرفر WHMCS بأمان، وكل أدوات الشغل هتبقى في مكان واحد.</T>
    </View>
   </View>
   <Card style={{gap:19,padding:20}}>
    <View style={{flexDirection:'row-reverse',alignItems:'center',justifyContent:'space-between'}}>
     <T size={18} weight="800">ربط حساب WHMCS</T>
     <Icon name="connection" color={C.red} size={22}/>
    </View>
    {field('رابط WHMCS (HTTPS)','baseUrl')}
    <View style={{gap:9}}>
     <T size={12} color={C.muted} weight="700">طريقة المصادقة</T>
     <View style={{flexDirection:'row-reverse',gap:8}}>
      {([{mode:'api',label:'API Credentials'},{mode:'admin',label:'Admin Legacy'}] as const).map(v=>{
       const active=config.mode===v.mode;
       return <Pressable key={v.mode} accessibilityRole="button"
        accessibilityState={{selected:active}} onPress={()=>setConfig(prev=>({...prev,mode:v.mode}))}
        style={{flex:1,minHeight:49,justifyContent:'center',alignItems:'center',
         backgroundColor:active?C.red+'20':C.surface2,
         borderColor:active?C.red:C.stroke,borderWidth:1,borderRadius:12}}>
        <T size={11} weight="800" color={active?C.red:C.muted}>{v.label}</T>
       </Pressable>;
      })}
     </View>
    </View>
    {config.mode==='api'?<>
     {field('API Identifier','identifier')}
     {field('API Secret','secret',true)}
     <Notice tone="info" title="حماية بيانات الحساب"
      message="استخدم API Credentials بصلاحيات محدودة؛ بيانات الربط مش بتتبعت لخدمة Push."/>
    </>:<>
     {field('Admin Username','username')}
     {field('Admin Password','password',true)}
     {field('API Access Key','accessKey',true)}
     <Notice tone="warning" title="وضع توافق"
      message="يتطلب بيانات WHMCS Admin وقد يخضع لقيود IP. استخدم حسابًا محدود الصلاحيات."/>
    </>}
    <Action label={busy?'جارٍ اختبار الاتصال...':'اتصال وحفظ الجلسة'}
     icon="shield-check-outline" disabled={busy||!required} onPress={async()=>{
      setBusy(true);
      try{await onPair(config);}catch(e){Alert.alert('تعذر الاتصال',e instanceof Error?e.message:'فشل الاتصال');}
      finally{setBusy(false);}
     }}/>
   </Card>
   <View style={{flexDirection:'row-reverse',alignItems:'center',gap:8,justifyContent:'center'}}>
    <Icon name="lock-check-outline" size={17} color={C.green}/>
    <T size={11} color={C.muted}>الجلسة محفوظة محليًا بالتشفير على الجهاز</T>
   </View>
   {__DEV__?<Action secondary label="وضع العرض للمطور" icon="eye-outline" onPress={onDemo}/>:null}
  </ScrollView>
 </KeyboardAvoidingView>;
}
