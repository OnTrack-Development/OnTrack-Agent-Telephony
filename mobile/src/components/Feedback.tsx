import React,{useEffect,useState} from 'react';
import {Alert as NativeAlert,BackHandler,Modal,Pressable,ScrollView,View} from 'react-native';
import {C} from '../theme';
import {Icon,T} from './UI';

type Button={text?:string;onPress?:()=>void;style?:'default'|'cancel'|'destructive';isPreferred?:boolean};
type Options={cancelable?:boolean;onDismiss?:()=>void};
type Dialog={id:number;title:string;message?:string;buttons:Button[];options?:Options};
let sequence=0;
const queue:Dialog[]=[];
const subscribers=new Set<()=>void>();
const publish=()=>{for(const cb of subscribers)cb();};
const severity=(dialog:Dialog):'danger'|'warning'|'success'|'info'=>{
 if(dialog.buttons.some(b=>b.style==='destructive')||/تحذير|حذف|إلغاء الخدمة|إنهاء|Terminate|Fraud/i.test(dialog.title))
  return 'danger';
 if(/فشل|تعذر|مرفوض|خطأ|غير متاح|تأكيد|رفض|تغيير|إرسال|حفظ|تعديل|تحويل/i.test(dialog.title)
   ||dialog.buttons.length>1)return 'warning';
 if(/تم|نجاح|مكتمل|اتصل/i.test(dialog.title))return 'success';
 return 'info';
};
/** Drop-in for React Native Alert.alert with accessible, branded UI. No alert is silently auto-confirmed. */
export const Alert={
 alert(title:string,message?:string,buttons?:Button[],options?:Options):void{
  if(subscribers.size===0){NativeAlert.alert(title,message,buttons,options);return;}
  // Bound outstanding dialogs: avoid stacking thousands of network messages.
  if(queue.length>=12)return;
  queue.push({id:++sequence,title:String(title||''),message:message?String(message):undefined,
    buttons:buttons?.length?buttons:[{text:'حسنًا'}],options});
  publish();
 }
};
export function FeedbackHost(){
 const [shown,setShown]=useState<Dialog|null>(null);
 useEffect(()=>{
  const update=()=>setShown(queue[0]||null);
  subscribers.add(update);update();
  return()=>{subscribers.delete(update);};
 },[]);
 const dismiss=(index?:number)=>{
  const current=queue[0];if(!current||current.id!==shown?.id)return;
  const chosen=index===undefined?undefined:current.buttons[index];
  const canCancel=current.options?.cancelable!==false;
  if(index===undefined&&!canCancel)return;
  queue.shift();
  publish();
  if(chosen?.onPress){try{chosen.onPress();}catch{}}
  else if(index===undefined)current.options?.onDismiss?.();
 };
 if(!shown)return null;
 const level=severity(shown);
 const accent=level==='danger'?C.red:level==='warning'?C.orange:level==='success'?C.green:C.blue;
 const symbol=level==='danger'?'alert-octagon-outline':level==='warning'?'alert-circle-outline':
  level==='success'?'check-circle-outline':'information-outline';
 return <Modal transparent visible={!!shown} animationType="fade" onRequestClose={()=>dismiss()}>
  <View style={{flex:1,backgroundColor:'rgba(1,5,10,0.76)',justifyContent:'center',
   paddingHorizontal:25,paddingVertical:32}}>
   <Pressable accessibilityRole="button" accessibilityLabel="إغلاق رسالة التأكيد"
    style={{position:'absolute',top:0,right:0,bottom:0,left:0}}
    disabled={shown.options?.cancelable===false} onPress={()=>dismiss()}/>
   <View accessibilityRole="alert" style={{backgroundColor:C.surface,borderRadius:23,borderWidth:1,
    borderColor:C.stroke,padding:22,maxHeight:'88%',elevation:12,
    shadowColor:'#000',shadowOpacity:0.3,shadowRadius:24,shadowOffset:{width:0,height:12}}}>
    <View style={{flexDirection:'row-reverse',gap:12,alignItems:'center',marginBottom:16}}>
     <View style={{backgroundColor:accent+'18',borderRadius:15,padding:12,borderWidth:1,borderColor:accent+'35'}}>
      <Icon name={symbol} color={accent} size={24}/>
     </View>
     <View style={{flex:1,gap:3}}>
      <T size={17} weight="800" color={C.text}>{shown.title||'تنبيه'}</T>
      <T size={10} weight="600" color={accent}>{level==='danger'?'إجراء حساس':
       level==='warning'?'مراجعة الإجراء':level==='success'?'اكتمل الإجراء':'معلومة'}</T>
     </View>
    </View>
    {shown.message?<ScrollView style={{flexGrow:0,maxHeight:330}} nestedScrollEnabled>
     <T size={13} color={C.muted} style={{lineHeight:23}}>{shown.message}</T>
    </ScrollView>:null}
    <View style={{height:1,backgroundColor:C.stroke,marginVertical:18}}/>
    <View style={{gap:9}}>
     {shown.buttons.map((b,index)=>{
      const isCancel=b.style==='cancel',isDanger=b.style==='destructive';
      const neutral=isCancel||(shown.buttons.length>1&&index===0&&!isDanger);
      return <Pressable key={String(index)} accessibilityRole="button" accessibilityLabel={b.text||'حسنًا'}
       onPress={()=>dismiss(index)}
       style={({pressed})=>({minHeight:48,alignItems:'center',justifyContent:'center',borderRadius:12,
        paddingHorizontal:13,borderWidth:1,borderColor:neutral?C.stroke:isDanger?C.red:accent,
        backgroundColor:neutral?C.surface2:isDanger?C.red:level==='success'?C.green:C.red,
        opacity:pressed?0.8:1})}>
       <T color={C.white} size={13} weight="800">{b.text||'حسنًا'}</T>
      </Pressable>;
     })}
    </View>
   </View>
  </View>
 </Modal>;
}
