import React from 'react';
import {Pressable,View} from 'react-native';
import {C} from '../theme';
import type {DemoState,Page} from '../types';
import type {FinancialSummary} from '../lib/financial';
import {Card,Empty,Icon,ItemRow,Notice,Pill,Section,T} from '../components/UI';

type HomeProps={data:DemoState;demo:boolean;navigate:(p:Page)=>void;
 capabilities:Record<string,boolean>;totals:Record<string,number|null>;
 financial:FinancialSummary|null;financialError:string;financialBusy:boolean;
 moneyVisible:boolean;onToggleMoney:()=>void};

function MoneyTile({label,value,icon,visible,loading}:{
 label:string;value:string;icon:string;visible:boolean;loading?:boolean}){
 return <View style={{width:'48.5%',padding:13,borderRadius:14,
  backgroundColor:C.surface2,borderWidth:1,borderColor:C.stroke,minHeight:93,justifyContent:'space-between',gap:8}}>
  <View style={{flexDirection:'row-reverse',alignItems:'center',gap:7}}>
   <Icon name={icon} size={16} color={C.muted}/>
   <T size={11} color={C.muted} weight="600">{label}</T>
  </View>
  <T size={17} weight="900" lines={2} style={{textAlign:'right',writingDirection:'ltr',alignSelf:'stretch'}}>
   {visible?(loading?'جارٍ التحميل...':value):'••••••'}
  </T>
 </View>;
}
function CompactAction({label,icon,color,onPress,extra}:{
 label:string;icon:string;color:string;onPress:()=>void;extra?:string}){
 return <Pressable accessibilityRole="button" onPress={onPress}
  style={({pressed})=>({width:'23%',alignItems:'center',justifyContent:'center',gap:8,
   opacity:pressed?0.7:1,paddingVertical:9})}>
  <View style={{width:51,height:51,borderRadius:17,backgroundColor:color+'19',
   borderWidth:1,borderColor:color+'36',alignItems:'center',justifyContent:'center'}}>
   <Icon name={icon} color={color} size={23}/>
  </View>
  <T size={11} weight="800" style={{textAlign:'center'}}>{label}</T>
  {extra?<T size={9} color={C.muted} style={{textAlign:'center'}}>{extra}</T>:null}
 </Pressable>;
}
export function Home({data,demo,navigate,capabilities,totals,financial,financialError,
 financialBusy,moneyVisible,onToggleMoney}:HomeProps){
 const tickets=data.tickets.filter(x=>!['Answered','Closed'].includes(x.status));
 const pendingOrders=data.orders.filter(x=>x.status==='Pending');
 const dueInvoices=data.invoices.filter(x=>x.status==='Unpaid'||x.status==='Overdue');
 const ready=(key:string)=>demo||capabilities[key+'.read']===true;
 const count=(key:'clients'|'services')=>ready(key)?String(totals[key]??data[key].length):'—';
 const income=(v:keyof Pick<FinancialSummary,'today'|'month'|'year'|'allTime'>)=>
  moneyVisible&&!demo?(financial?.[v]||'—'):'••••••';
 return <View style={{paddingBottom:22,gap:18}}>
  <View style={{gap:4}}>
   <T size={11} color={C.muted}>WHMCS • النظرة العامة</T>
   <T size={26} weight="900">لوحة الإدارة</T>
   <T size={12} color={C.muted}>بيانات مباشرة، مختصرة، وتحت تحكمك</T>
  </View>
  <Card style={{gap:13,padding:16,borderRadius:20}}>
   <View style={{flexDirection:'row-reverse',justifyContent:'space-between',alignItems:'center'}}>
    <View style={{gap:4}}>
     <T size={15} weight="900">ملخص الدخل</T>
     <T size={11} color={C.muted}>من إحصاءات WHMCS الرسمية</T>
    </View>
    <Pressable accessibilityRole="button" accessibilityLabel={moneyVisible?'إخفاء الأرصدة':'إظهار الأرصدة'}
     accessibilityState={{expanded:moneyVisible}} onPress={onToggleMoney}
     style={{width:43,height:43,alignItems:'center',justifyContent:'center',
      borderRadius:14,backgroundColor:C.surface2,borderWidth:1,borderColor:C.stroke}}>
     <Icon name={moneyVisible?'eye-off-outline':'eye-outline'} size={23} color={C.blue}/>
    </Pressable>
   </View>
   <View style={{flexDirection:'row-reverse',flexWrap:'wrap',justifyContent:'space-between',rowGap:9}}>
    <MoneyTile label="اليوم" icon="calendar-today" visible={moneyVisible} value={income('today')} loading={financialBusy}/>
    <MoneyTile label="الشهر الحالي" icon="calendar-month-outline" visible={moneyVisible} value={income('month')} loading={financialBusy}/>
    <MoneyTile label="السنة الحالية" icon="calendar-range" visible={moneyVisible} value={income('year')} loading={financialBusy}/>
    <MoneyTile label="كل الوقت" icon="chart-timeline-variant" visible={moneyVisible} value={income('allTime')} loading={financialBusy}/>
   </View>
   <View style={{padding:13,backgroundColor:C.surface2,borderRadius:14,
    borderWidth:1,borderColor:C.stroke,flexDirection:'row-reverse',
    alignItems:'center',justifyContent:'space-between',gap:10}}>
    <View style={{gap:4,flex:1}}>
     <T size={12} weight="700">إجمالي قيمة الفواتير غير المدفوعة</T>
     <T size={10} color={C.muted}>قيمة الفواتير قبل خصم أي دفعات جزئية</T>
    </View>
    <T size={16} weight="900" style={{textAlign:'left'}} lines={3}>
     {!moneyVisible?'••••••':financialBusy?'...':financial?.unpaidAvailable?financial.unpaid:'—'}
    </T>
   </View>
   {moneyVisible&&financialError?<Notice tone="warning" title="الإحصاءات غير متاحة" message={financialError}/>:null}
   {moneyVisible&&financial?.warning?<Notice tone="warning" title="بيانات الفواتير" message={financial.warning}/>:null}
   {!moneyVisible?<T size={10} color={C.muted}>الأرقام مخفية تلقائيًا عند فتح التطبيق أو الرجوع إليه.</T>:null}
  </Card>

  <View style={{flexDirection:'row-reverse',gap:9,justifyContent:'space-between'}}>
   <CompactAction icon="ticket-outline" color={C.red} label="التذاكر" onPress={()=>navigate('tickets')}/>
   <CompactAction icon="cart-outline" color={C.orange} label="الطلبات" onPress={()=>navigate('orders')}/>
   <CompactAction icon="account-group-outline" color={C.blue} label="العملاء" onPress={()=>navigate('clients')}/>
   <CompactAction icon="whatsapp" color={C.green} label="واتساب" onPress={()=>navigate('whatsapp')}/>
  </View>

  <View style={{gap:10}}>
   <Section title="المتابعة" action="عرض التذاكر" onPress={()=>navigate('tickets')}/>
   <View style={{flexDirection:'row-reverse',gap:10,justifyContent:'space-between'}}>
    <Pressable accessibilityRole="button" onPress={()=>navigate('tickets')}
     style={{flex:1,backgroundColor:C.surface,borderWidth:1,borderColor:C.stroke,
      borderRadius:17,padding:13,gap:6,minHeight:100}}>
     <T size={11} color={C.muted}>تذاكر محتاجة رد</T>
     <T size={25} weight="900">{ready('tickets')?tickets.length:'—'}</T>
    </Pressable>
    <Pressable accessibilityRole="button" onPress={()=>navigate('orders')}
     style={{flex:1,backgroundColor:C.surface,borderWidth:1,borderColor:C.stroke,
      borderRadius:17,padding:13,gap:6,minHeight:100}}>
     <T size={11} color={C.muted}>طلبات معلّقة</T>
     <T size={25} weight="900">{ready('orders')?pendingOrders.length:'—'}</T>
    </Pressable>
    <Pressable accessibilityRole="button" onPress={()=>navigate('invoices')}
     style={{flex:1,backgroundColor:C.surface,borderWidth:1,borderColor:C.stroke,
      borderRadius:17,padding:13,gap:6,minHeight:100}}>
     <T size={11} color={C.muted}>فواتير غير مدفوعة</T>
     <T size={25} weight="900">{ready('invoices')?dueInvoices.length:'—'}</T>
    </Pressable>
   </View>
  </View>
  <View style={{flexDirection:'row-reverse',gap:10}}>
   <Pill label={'عملاء '+count('clients')} color={C.blue}/>
   <Pill label={'خدمات '+count('services')} color={C.green}/>
  </View>

  <View style={{gap:6}}>
   <Section title="أحدث التذاكر" action="عرض الكل" onPress={()=>navigate('tickets')}/>
   <Card style={{paddingHorizontal:15,paddingVertical:2}}>
    {tickets.length?tickets.slice(0,3).map(t=><ItemRow key={t.id} icon="ticket-outline"
     heading={t.subject||'تذكرة #'+t.number} subtitle={'#'+t.number+' • '+t.customer}
     color={t.priority==='High'?C.orange:C.blue} onPress={()=>navigate('tickets')}/>):
     <Empty text={ready('tickets')?'مفيش تذاكر انتظار في البيانات المحمّلة':'افتح التذاكر لتحميل أحدث البيانات'}/>}
   </Card>
  </View>
  <T size={10} color={C.muted} style={{textAlign:'center'}}>
   أرقام المتابعة تخص السجلات المحمّلة، وملخص الدخل من GetStats داخل WHMCS.
  </T>
 </View>;
}
