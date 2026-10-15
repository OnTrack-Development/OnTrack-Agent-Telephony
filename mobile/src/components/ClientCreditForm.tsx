import React,{useRef,useState} from 'react';
import {ActivityIndicator,TextInput,View} from 'react-native';
import {Alert} from './Feedback';
import {Action,Card,Icon,T} from './UI';
import {C} from '../theme';
import type {Session} from '../types';
import {
 addClientCredit,removeClientCredit,formatClientBalance,parseCreditAmount,validateCreditDescription
} from '../lib/clientCredit';
import type {ClientCreditBalance,CreditOperation} from '../lib/clientCredit';

export function ClientCreditForm({session,clientId,clientName,balance,operation,onDone,onCancel}:{
 session:Session;clientId:number;clientName:string;balance:ClientCreditBalance;
 operation:CreditOperation;onDone:(newBalance:number)=>void;onCancel:()=>void;
}){
 const isRemove=operation==='remove',accent=isRemove?C.orange:C.green;
 const title=isRemove?'خصم رصيد':'إضافة رصيد',verb=isRemove?'الخصم':'الإضافة';
 const [amount,setAmount]=useState(''),[description,setDescription]=useState('');
 const [busy,setBusy]=useState(false),[error,setError]=useState('');
 const [uncertain,setUncertain]=useState(false);
 const inFlight=useRef(false),confirmPending=useRef(false);
 const confirm=()=>{
  if(inFlight.current||confirmPending.current||uncertain)return;
  let amountValue:number,reason:string;
  try{amountValue=parseCreditAmount(amount);reason=validateCreditDescription(description,operation);}
  catch(e){setError(e instanceof Error?e.message:'بيانات غير صالحة');return;}
  if(clientId!==balance.clientId){setError('تم إيقاف العملية: حساب العميل غير متطابق.');return;}
  if(isRemove&&Math.round(amountValue*10000)>Math.round(balance.amount*10000)){
   setError('قيمة الخصم أكبر من رصيد العميل المتاح.');return;
  }
  setError('');
  const fixed=amountValue.toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2});
  const after=balance.amount+(isRemove?-amountValue:amountValue);
  const projected=after.toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:4})+' '+balance.currency;
  confirmPending.current=true;
  Alert.alert('تأكيد '+title,
   'العميل: '+clientName+' (#'+clientId+')\n'+
   'الرصيد الحالي: '+formatClientBalance(balance)+'\n'+
   title+': '+(isRemove?'-':'+')+fixed+' '+balance.currency+'\n'+
   'الرصيد المتوقع بعد العملية: '+projected+'\n'+
   'السبب: '+reason+'\n\n'+
   (isRemove
    ?'سيُخصم المبلغ من الرصيد المتاح للعميل في WHMCS. هذا ليس سدادًا لفاتورة ولا استردادًا ماليًا عبر بوابة الدفع.'
    :'سيُضاف المبلغ إلى رصيد العميل في WHMCS. هذا ليس سدادًا لفاتورة ولا خصمًا من بوابة الدفع.')+
   '\nتأكد من بيانات العملية قبل التنفيذ.',
   [{text:'إلغاء',style:'cancel',onPress:()=>{confirmPending.current=false;}},
    {text:'تأكيد '+verb,onPress:()=>{
     confirmPending.current=false;
     if(inFlight.current)return;
     inFlight.current=true;setBusy(true);setError('');
     const task=isRemove
      ?removeClientCredit(session,clientId,amount,reason,balance.currency,balance.amount)
      :addClientCredit(session,clientId,amount,reason,balance.currency);
     void task.then(result=>{
      if(!result.ok||!result.data){
       setError(result.error||'تعذر تعديل الرصيد');
       if(/NETWORK_ERROR|HTTP_5|INVALID_JSON/.test(result.code||'')||
        /غير مؤكدة|راجع سجل العميل|لا تُكرر/.test(result.error||''))setUncertain(true);
       return;
      }
      Alert.alert(isRemove?'تم خصم رصيد العميل':'تمت إضافة رصيد العميل',
       'الرصيد الجديد: '+result.data.newBalance.toLocaleString('en-US',{
        minimumFractionDigits:2,maximumFractionDigits:4
       })+' '+result.data.currency+'\nتم تسجيل العملية في WHMCS.');
      onDone(result.data.newBalance);
     }).catch(()=>{
      setUncertain(true);
      setError('نتيجة الاتصال غير مؤكدة. راجع سجل الرصيد في WHMCS قبل إعادة محاولة '+verb+'.');
     }).finally(()=>{inFlight.current=false;setBusy(false);});
    }}],
   {cancelable:true,onDismiss:()=>{confirmPending.current=false;}});
 };
 return <Card style={{gap:10,padding:13,borderColor:accent+'65'}}>
  <View style={{flexDirection:'row-reverse',gap:7,alignItems:'center'}}>
   <Icon name={isRemove?'wallet-minus-outline':'wallet-plus-outline'} size={21} color={accent}/>
   <T size={14} weight="800">{title} للعميل</T>
  </View>
  <T color={C.muted} size={11}>الرصيد الحالي: {formatClientBalance(balance)}</T>
  <TextInput accessibilityLabel={'قيمة '+title} value={amount}
   editable={!busy&&!uncertain} onChangeText={setAmount}
   keyboardType="decimal-pad" placeholder={'المبلغ ('+balance.currency+')'}
   placeholderTextColor={C.muted} autoCorrect={false}
   style={{borderRadius:11,borderWidth:1,borderColor:C.stroke,backgroundColor:C.surface2,
    color:C.text,textAlign:'right',fontSize:14,paddingHorizontal:12,paddingVertical:11}}/>
  <TextInput accessibilityLabel={'سبب '+title} value={description}
   editable={!busy&&!uncertain} onChangeText={setDescription} maxLength={240}
   placeholder={'سبب '+verb+' أو المرجع المالي (إلزامي)'} placeholderTextColor={C.muted}
   style={{borderRadius:11,borderWidth:1,borderColor:C.stroke,backgroundColor:C.surface2,
    color:C.text,textAlign:'right',fontSize:13,paddingHorizontal:12,paddingVertical:11}}/>
  <T size={10} color={C.muted}>
   {isRemove?'لن يُخصم أكثر من الرصيد المتاح، ولن تتغير حالة أي فاتورة.':
    'إضافة الرصيد منفصلة عن «تسجيل سداد فاتورة».'} يُسجَّل السبب في WHMCS.
  </T>
  {error?<T size={11} color={C.orange}>{error}</T>:null}
  {uncertain?<T color={C.red} weight="700" size={11}>
   تم إيقاف إعادة المحاولة لحماية الرصيد من التكرار. راجع سجل الرصيد في WHMCS وتأكد من نتيجة العملية أولًا.
  </T>:null}
  {busy?<ActivityIndicator color={accent}/>:null}
  <View style={{flexDirection:'row-reverse',gap:8}}>
   <View style={{flex:1}}><Action compact
    label={isRemove?'تأكيد الخصم':'تأكيد الإضافة'}
    icon="check-circle-outline" disabled={busy||uncertain||confirmPending.current}
    onPress={confirm}/></View>
   <View style={{flex:1}}><Action compact secondary label="إلغاء" disabled={busy}
    onPress={onCancel}/></View>
  </View>
 </Card>;
}
