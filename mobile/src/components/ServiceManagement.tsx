import React,{useEffect,useRef,useState} from 'react';
import {Pressable,TextInput,View} from 'react-native';
import {Alert} from './Feedback';
import {C} from '../theme';
import type {Session} from '../types';
import {Action,Card,T} from './UI';
import {callApi} from '../lib/api';
import {executeModuleAction,moduleActions,serviceDraft,serviceFields,serviceOwner,serviceUpdate,ModuleAction,ServiceDraft} from '../lib/serviceManagement';
const modules:{id:ModuleAction;label:string;description:string}[]=[
 {id:'ModuleCreate',label:'Create',description:'إنشاء حساب الخدمة فعليًا على السيرفر.'},
 {id:'ModuleSuspend',label:'Suspend',description:'إيقاف الخدمة على السيرفر.'},
 {id:'ModuleUnsuspend',label:'Unsuspend',description:'إعادة تشغيل الخدمة الموقوفة.'},
 {id:'ModuleTerminate',label:'Terminate',description:'إنهاء الخدمة على السيرفر وقد يتسبب في فقد بياناتها.'},
 {id:'ModuleChangePackage',label:'Change Package',description:'تغيير باقة الخدمة فعليًا باستخدام Module بعد ضبط الباقة المطلوبة.'}
];
const billing=['Free Account','One Time','Monthly','Quarterly','Semi-Annually','Annually','Biennially','Triennially'];
const statuses=['Pending','Active','Suspended','Terminated','Cancelled','Fraud','Completed'];
const inputStyle={color:C.text,textAlign:'right' as const,backgroundColor:C.surface2,borderColor:C.stroke,
 borderWidth:1,borderRadius:10,padding:11,minHeight:45};
export function ServiceManagement({session,data,id,expectedClientId,onChanged}:{
 session:Session;data:any;id:number;expectedClientId?:number;onChanged:()=>void;
}){
 const [editing,setEditing]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const [form,setForm]=useState<ServiceDraft>(()=>serviceDraft(data));
 const inFlight=useRef(false);
 useEffect(()=>{setForm(serviceDraft(data));setEditing(false);setError('');},[data,id]);
 const owner=Number(data?.clientid||data?.userid)||0;
 if(!serviceOwner(data,id,expectedClientId))return <Card><T color={C.orange}>تعذر إثبات ملكية الخدمة المطلوبة. الإدارة معطّلة.</T></Card>;
 const change=(k:keyof ServiceDraft,v:string)=>setForm(prev=>({...prev,[k]:v}));
 const perform=(action:ModuleAction)=>{
  if(inFlight.current)return;
  const spec=modules.find(x=>x.id===action);
  if(!spec)return;
  Alert.alert('تأكيد '+spec.label,spec.description+'\nخدمة #'+id+'\nلن يتم افتراض نجاح العملية قبل رد WHMCS.',[
   {text:'رجوع',style:'cancel'},
   {text:'متابعة',style:action==='ModuleTerminate'?'destructive':'default',onPress:()=>{
    if(action==='ModuleTerminate'){
     Alert.alert('تحذير نهائي','سيتم تنفيذ Terminate الحقيقي على السيرفر. قد يؤدي إلى حذف الملفات والبيانات. هل تؤكد للمرة الثانية؟',[
      {text:'إلغاء',style:'cancel'},
      {text:'إنهاء الخدمة',style:'destructive',onPress:()=>void runModule(action)}
     ],{cancelable:false});
    }else void runModule(action);
   }}
  ],{cancelable:false});
 };
 const runModule=async(action:ModuleAction)=>{
  if(inFlight.current)return;
  inFlight.current=true;setBusy(true);setError('');
  try{
   const r=await executeModuleAction(session,action,id,owner);
   if(!r.ok){setError(r.error||'رفض WHMCS أمر الخدمة');return;}
   Alert.alert('تم','أكد WHMCS تنفيذ '+action+' للخدمة #'+id);onChanged();
  }finally{inFlight.current=false;setBusy(false);}
 };
 const save=()=>{
  if(inFlight.current)return;
  let params:Record<string,string|number>;
  try{params=serviceUpdate(id,data,form,expectedClientId);}catch(e){setError(e instanceof Error?e.message:'البيانات غير صالحة');return;}
  Alert.alert('تحديث الخدمة','حفظ البيانات في WHMCS لا ينفّذ أوامر Module تلقائيًا ولا يعيد حساب الأسعار ما لم تطلب ذلك صراحةً.',[
   {text:'إلغاء',style:'cancel'},
   {text:'حفظ',onPress:async()=>{
    if(inFlight.current)return;
    inFlight.current=true;setBusy(true);setError('');
    try{
     const r=await callApi(session,'UpdateClientProduct',params);
     if(!r.ok){setError(r.error||'رفض WHMCS التعديل');return;}
     Alert.alert('تم','تم حفظ الخدمة #'+id);setEditing(false);onChanged();
    }finally{inFlight.current=false;setBusy(false);}
   }}
  ]);
 };
 return <View style={{gap:12}}>
  <Card style={{gap:12}}>
   <T size={16} weight="800">تعديل الخدمة</T>
   {!editing?<Action compact label="تعديل البيانات الكاملة" secondary icon="pencil-outline" onPress={()=>setEditing(true)}/>:<>
    {serviceFields.map(([field,label])=><View key={field} style={{gap:5}}>
     <T size={12} color={C.muted}>{label}</T>
     <TextInput accessibilityLabel={label} value={form[field]} onChangeText={value=>change(field,value)}
      placeholder={label} placeholderTextColor={C.muted} editable={!busy} multiline={field==='notes'}
      keyboardType={['pid','serverid','promoid'].includes(field)?'number-pad':['firstpaymentamount','recurringamount'].includes(field)?'decimal-pad':'default'}
      style={[inputStyle,field==='notes'?{minHeight:95,textAlignVertical:'top'}:{}]}/>
     {field==='status'?<View style={{flexDirection:'row-reverse',gap:6,flexWrap:'wrap'}}>{statuses.map(x=><Pressable key={x} onPress={()=>change(field,x)}
      style={{padding:5,borderRadius:7,backgroundColor:form.status===x?C.red:C.surface2}}><T size={10}>{x}</T></Pressable>)}</View>:null}
     {field==='billingcycle'?<View style={{flexDirection:'row-reverse',gap:6,flexWrap:'wrap'}}>{billing.map(x=><Pressable key={x} onPress={()=>change(field,x)}
      style={{padding:5,borderRadius:7,backgroundColor:form.billingcycle===x?C.red:C.surface2}}><T size={10}>{x}</T></Pressable>)}</View>:null}
    </View>)}
    <T size={11} color={C.orange}>رقم الباقة/السيرفر وطريقة الدفع لازم تكون قيم موجودة فعلًا في WHMCS. كلمة المرور لا تُعرض ولا تُسترجع هنا.</T>
    {error?<T color={C.orange} size={12}>{error}</T>:null}
    <View style={{gap:7}}><Action disabled={busy} label={busy?'جارٍ الحفظ...':'تأكيد حفظ التعديلات'} onPress={save}/>
     <Action disabled={busy} secondary label="إلغاء التعديل" onPress={()=>{setForm(serviceDraft(data));setEditing(false);setError('');}}/></View>
   </>}
  </Card>
  <Card style={{gap:10}}>
   <T size={16} weight="800">أوامر إدارة السيرفر</T>
   <T size={11} color={C.orange}>تؤثر على الاستضافة الحقيقية، وتحتاج تأكيد وصلاحيات WHMCS وModule متوافقًا.</T>
   {modules.map(x=><Action key={x.id} secondary={x.id!=='ModuleCreate'} disabled={busy||editing}
    label={x.label} onPress={()=>perform(x.id)}/>)}
   {error?<T color={C.orange} size={12}>{error}</T>:null}
  </Card>
 </View>;
}
