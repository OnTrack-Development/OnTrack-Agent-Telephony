import React,{useRef,useState} from 'react';
import {ActivityIndicator,TextInput,View} from 'react-native';
import {Alert} from './Feedback';
import {Action,Card,Icon,T} from './UI';
import {C} from '../theme';
import type {Session} from '../types';
import {addClientCredit,formatClientBalance,parseCreditAmount,validateCreditDescription} from '../lib/clientCredit';
import type {ClientCreditBalance} from '../lib/clientCredit';

export function ClientCreditForm({session,clientId,clientName,balance,onDone,onCancel}:{
 session:Session;clientId:number;clientName:string;balance:ClientCreditBalance;
 onDone:(newBalance:number)=>void;onCancel:()=>void;
}){
 const [amount,setAmount]=useState(''),[description,setDescription]=useState('');
 const [busy,setBusy]=useState(false),[error,setError]=useState('');
 const inFlight=useRef(false),[uncertain,setUncertain]=useState(false);
 const confirm=()=>{
  if(inFlight.current||uncertain)return;
  let amountValue:number,reason:string;
  try{amountValue=parseCreditAmount(amount);reason=validateCreditDescription(description);}
  catch(e){setError(e instanceof Error?e.message:'بيانات غير صالحة');return;}
  if(clientId!==balance.clientId){setError('تم إيقاف العملية: حساب العميل غير متطابق.');return;}
  setError('');
  const formatted=amountValue.toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2});
  Alert.alert('تأكيد إضافة رصيد',
   'العميل: '+clientName+' (#'+clientId+')\n'+
   'الرصيد الحالي: '+formatClientBalance(balance)+'\n'+
   'إضافة: +'+formatted+' '+balance.currency+'\n'+
   'السبب: '+reason+'\n\n'+
   'سيُسجَّل رصيد مالي جديد في دفتر حساب العميل داخل WHMCS. هذا ليس سداد فاتورة ولا خصمًا من بوابة الدفع. تأكد أن القيمة مستحقة قبل التأكيد.',
   [{text:'إلغاء',style:'cancel'},{text:'تأكيد إضافة الرصيد',onPress:()=>{
    if(inFlight.current)return;
    inFlight.current=true;setBusy(true);setError('');
    void addClientCredit(session,clientId,amount,description,balance.currency).then(result=>{
     if(!result.ok||!result.data){
      setError(result.error||'تعذرت إضافة الرصيد');
      if(/NETWORK_ERROR|HTTP_5|INVALID_JSON/.test(result.code||'')||
       /غير مؤكدة|راجع سجل العميل/.test(result.error||''))setUncertain(true);
      return;
     }
     Alert.alert('تم تسجيل رصيد العميل',
      'الرصيد الجديد: '+result.data.newBalance.toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:4})+
      ' '+result.data.currency+'\nتم تسجيل العملية في WHMCS.');
     onDone(result.data.newBalance);
    }).catch(()=>{
     setUncertain(true);setError('اتصال غير مؤكد. راجع سجل الرصيد في WHMCS قبل إعادة محاولة الإضافة.');
    }).finally(()=>{inFlight.current=false;setBusy(false);});
   }}],{cancelable:true});
 };
 return <Card style={{gap:10,padding:13,borderColor:C.green+'65'}}>
  <View style={{flexDirection:'row-reverse',gap:7,alignItems:'center'}}>
   <Icon name="wallet-plus-outline" size={21} color={C.green}/>
   <T size={14} weight="800">إضافة رصيد للعميل</T>
  </View>
  <T color={C.muted} size={11}>
   الرصيد الحالي: {formatClientBalance(balance)} • العملة ثابتة حسب حساب العميل
  </T>
  <TextInput accessibilityLabel="قيمة الرصيد المراد إضافته" value={amount}
   editable={!busy&&!uncertain} onChangeText={setAmount}
   keyboardType="decimal-pad" placeholder={'المبلغ ('+balance.currency+')'}
   placeholderTextColor={C.muted} autoCorrect={false}
   style={{borderRadius:11,borderWidth:1,borderColor:C.stroke,backgroundColor:C.surface2,
    color:C.text,textAlign:'right',fontSize:14,paddingHorizontal:12,paddingVertical:11}}/>
  <TextInput accessibilityLabel="سبب إضافة الرصيد" value={description}
   editable={!busy&&!uncertain} onChangeText={setDescription} maxLength={240}
   placeholder="السبب أو المرجع المالي (إلزامي)" placeholderTextColor={C.muted}
   style={{borderRadius:11,borderWidth:1,borderColor:C.stroke,backgroundColor:C.surface2,
    color:C.text,textAlign:'right',fontSize:13,paddingHorizontal:12,paddingVertical:11}}/>
  <T size={10} color={C.muted}>إضافة الرصيد منفصلة عن «تسجيل سداد فاتورة». يتم تسجيل السبب في سجل WHMCS.</T>
  {error?<T size={11} color={C.orange}>{error}</T>:null}
  {uncertain?<T color={C.red} weight="700" size={11}>
   تم إيقاف إعادة المحاولة لحماية الرصيد من التكرار. افتح سجل الرصيد في WHMCS وتأكد من نتيجة العملية قبل أي إضافة جديدة.
  </T>:null}
  {busy?<ActivityIndicator color={C.green}/>:null}
  <View style={{flexDirection:'row-reverse',gap:8}}>
   <View style={{flex:1}}><Action compact label="تأكيد الإضافة" icon="check-circle-outline"
    disabled={busy||uncertain} onPress={confirm}/></View>
   <View style={{flex:1}}><Action compact secondary label="إلغاء" disabled={busy}
    onPress={onCancel}/></View>
  </View>
 </Card>;
}
