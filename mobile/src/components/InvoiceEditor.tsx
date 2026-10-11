import React,{useEffect,useRef,useState} from 'react';
import {ActivityIndicator,Alert,Pressable,TextInput,View} from 'react-native';
import type {Session} from '../types';
import {C} from '../theme';
import {Action,Card,Icon,T} from './UI';
import {callApi} from '../lib/api';
import {blankInvoiceDraft,buildInvoiceUpdate,InvoiceDraft,InvoiceField,InvoiceLine,readInvoiceLines} from '../lib/invoices';
type Props={session:Session|null;invoice:any;invoiceId:number;onChanged:()=>void};
const labels:Record<InvoiceField,string>={
 date:'تاريخ الإصدار',duedate:'تاريخ الاستحقاق',paymentmethod:'كود بوابة الدفع',
 notes:'ملاحظات الفاتورة',taxrate:'الضريبة الأولى (%)',taxrate2:'الضريبة الثانية (%)',credit:'الرصيد المستخدم'
};
const inputStyle={color:C.text,textAlign:'right' as const,backgroundColor:C.surface2,padding:12,
 borderColor:C.stroke,borderWidth:1,borderRadius:12,minHeight:45};
export function InvoiceEditor({session,invoice,invoiceId,onChanged}:Props){
 const [editing,setEditing]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const [draft,setDraft]=useState<InvoiceDraft>(()=>blankInvoiceDraft(invoice));
 const [lines,setLines]=useState<InvoiceLine[]>(()=>readInvoiceLines(invoice));
 const pending=useRef(false),nextNew=useRef(0);
 useEffect(()=>{setDraft(blankInvoiceDraft(invoice));setLines(readInvoiceLines(invoice));setEditing(false);setError('');},[invoice,invoiceId]);
 const change=(field:InvoiceField,value:string)=>setDraft(prev=>({...prev,[field]:value}));
 const changeLine=(key:string,patch:Partial<InvoiceLine>)=>setLines(prev=>prev.map(line=>line.key===key?{...line,...patch}:line));
 const reset=()=>{setDraft(blankInvoiceDraft(invoice));setLines(readInvoiceLines(invoice));setEditing(false);setError('');};
 const save=()=>{
  if(!session||pending.current)return;
  let params:Record<string,string|number|boolean>;
  try{params=buildInvoiceUpdate(invoiceId,invoice,draft,lines);}catch(e){setError(e instanceof Error?e.message:'قيم الفاتورة غير صالحة');return;}
  Alert.alert('تأكيد تعديل الفاتورة','سيتم تعديل بيانات وبنود الفاتورة #'+invoiceId+' داخل WHMCS. قد تتغير الضرائب والإجمالي. متابعة؟',[
   {text:'إلغاء',style:'cancel'},
   {text:'حفظ التعديلات',onPress:async()=>{
    if(pending.current)return;
    pending.current=true;setBusy(true);setError('');
    try{
     const r=await callApi(session,'UpdateInvoice',params);
     if(!r.ok){setError(r.error||'رفض WHMCS التعديل');return;}
     setEditing(false);Alert.alert('تم الحفظ','تم تحديث الفاتورة #'+invoiceId);
     onChanged();
    }finally{setBusy(false);pending.current=false;}
   }}
  ]);
 };
 return <Card style={{gap:11}}>
  <T size={16} weight="800">تعديل بيانات وبنود الفاتورة</T>
  {!editing?<Action compact secondary icon="pencil-outline" label="تعديل الفاتورة بالكامل" onPress={()=>setEditing(true)}/>:<>
   {(Object.keys(labels) as InvoiceField[]).map(field=><View key={field} style={{gap:6}}>
    <T color={C.muted} size={12}>{labels[field]}</T>
    <TextInput accessibilityLabel={labels[field]} value={draft[field]} onChangeText={value=>change(field,value)}
     keyboardType={field==='taxrate'||field==='taxrate2'||field==='credit'?'decimal-pad':'default'}
     multiline={field==='notes'} placeholder={field==='date'||field==='duedate'?'YYYY-MM-DD':labels[field]}
     placeholderTextColor={C.muted} style={[inputStyle,field==='notes'?{minHeight:84,textAlignVertical:'top'}:{}]}/>
   </View>)}
   <T weight="800">بنود الفاتورة</T>
   {lines.map(line=><View key={line.key} style={{gap:7,borderWidth:1,borderColor:C.stroke,borderRadius:12,padding:10}}>
    {line.removed?<Action compact secondary label="استرجاع البند" onPress={()=>changeLine(line.key,{removed:false})}/>:<>
     <TextInput accessibilityLabel="وصف البند" value={line.description} onChangeText={description=>changeLine(line.key,{description})}
      multiline placeholder="الوصف" placeholderTextColor={C.muted} style={inputStyle}/>
     <TextInput accessibilityLabel="قيمة البند" value={line.amount} onChangeText={amount=>changeLine(line.key,{amount})}
      keyboardType="decimal-pad" placeholder="القيمة" placeholderTextColor={C.muted} style={inputStyle}/>
     <Pressable onPress={()=>changeLine(line.key,{taxed:!line.taxed})} style={{flexDirection:'row-reverse',alignItems:'center',gap:8}}>
      <Icon name={line.taxed?'checkbox-marked':'checkbox-blank-outline'} color={C.red}/><T>خاضع للضريبة</T>
     </Pressable>
     <Action compact secondary label="حذف هذا البند" onPress={()=>changeLine(line.key,{removed:true})}/>
    </>}
   </View>)}
   <Action compact secondary icon="plus" label="إضافة بند" onPress={()=>{
    const key='new-'+(++nextNew.current);
    setLines(prev=>[...prev,{key,id:null,description:'',amount:'0',taxed:false,removed:false}]);
   }}/>
   {error?<T size={12} color={C.orange}>{error}</T>:null}
   <View style={{flexDirection:'row-reverse',gap:8}}>
    <View style={{flex:1}}><Action label={busy?'جارٍ الحفظ...':'حفظ التعديلات'} disabled={busy||!session} onPress={save}/></View>
    <View style={{flex:1}}><Action label="إلغاء" disabled={busy} secondary onPress={reset}/></View>
   </View>
  </>}
 </Card>;
}
