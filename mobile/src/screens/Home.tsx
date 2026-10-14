import React from 'react';
import {Pressable,View} from 'react-native';
import {HOME as H} from '../theme';
import type {DemoState,Page} from '../types';
import type {FinancialSummary} from '../lib/financial';
import {invoiceDue} from '../lib/invoicePresentation';
import {Icon,T} from '../components/UI';

type HomeProps={data:DemoState;demo:boolean;navigate:(p:Page)=>void;
 capabilities:Record<string,boolean>;totals:Record<string,number|null>;
 financial:FinancialSummary|null;financialError:string;financialBusy:boolean;
 moneyVisible:boolean;onToggleMoney:()=>void};

export function readyInvoiceCount(totals:Record<string,number|null>,
 capabilities:Record<string,boolean>,demo:boolean,loaded:number):string{
 if(demo)return String(loaded);
 if(capabilities['invoices.read']!==true)return '—';
 return totals.invoices===null||totals.invoices===undefined?'—':String(totals.invoices);
}

const lifted=()=>({backgroundColor:H.paper,borderRadius:19,borderWidth:1,borderColor:H.stroke,
 shadowColor:'#000000',shadowOffset:{width:0,height:3},shadowOpacity:0.025,shadowRadius:8,
 elevation:2} as const);

function MoneyMini({label,value,icon,hidden,loading}:{label:string;value:string;icon:string;
 hidden:boolean;loading:boolean}){
 return <View style={{width:'48.7%',minHeight:61,borderRadius:13,paddingHorizontal:10,
  paddingVertical:8,justifyContent:'space-between',backgroundColor:H.soft,gap:4}}>
  <View style={{flexDirection:'row-reverse',alignItems:'center',gap:5}}>
   <Icon name={icon} color={H.muted} size={15}/>
   <T color={H.muted} size={11} weight="600">{label}</T>
  </View>
  <T color={H.ink} size={14} weight="900" lines={1}
   style={{textAlign:'right',writingDirection:'ltr'}}>{hidden?'••••••':loading?'...':value}</T>
 </View>;
}

function Shortcut({label,icon,subtitle,onPress}:{label:string;icon:string;
 subtitle?:string;onPress:()=>void}){
 return <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress}
  style={({pressed})=>[{width:'31.7%',minHeight:98,alignItems:'center',justifyContent:'center',
   gap:5,paddingHorizontal:5,paddingVertical:9},lifted(),{opacity:pressed?0.74:1}]}>
  <View style={{height:44,width:44,borderRadius:15,backgroundColor:H.soft,
   borderWidth:1,borderColor:H.stroke,alignItems:'center',justifyContent:'center'}}>
   <Icon name={icon} color={H.ink} size={24}/>
   <View style={{position:'absolute',height:6,width:6,borderRadius:3,
    backgroundColor:H.accent,right:5,bottom:5}}/>
  </View>
  <T color={H.ink} weight="800" size={12} lines={1} style={{textAlign:'center'}}>{label}</T>
  {subtitle?<T color={H.muted} size={10} lines={1} style={{textAlign:'center'}}>{subtitle}</T>:null}
 </Pressable>;
}

function CountMini({label,value,icon,color,onPress}:{label:string;value:string;
 icon:string;color:string;onPress:()=>void}){
 return <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress}
  style={({pressed})=>[{flex:1,minHeight:65,paddingHorizontal:10,paddingVertical:9,
   justifyContent:'space-between',gap:4} ,lifted(),{opacity:pressed?0.73:1}]}>
  <View style={{flexDirection:'row-reverse',alignItems:'center',gap:4}}>
   <Icon name={icon} size={15} color={color}/>
   <T size={10} color={H.muted} lines={1}>{label}</T>
  </View>
  <T size={18} weight="900" color={H.ink}>{value}</T>
 </Pressable>;
}

function Label({text,sub}:{text:string;sub?:string}){
 return <View style={{flexDirection:'row-reverse',alignItems:'baseline',justifyContent:'space-between'}}>
  <T color={H.ink} size={16} weight="900">{text}</T>
  {sub?<T size={10} color={H.muted}>{sub}</T>:null}
 </View>;
}

export function Home({data,demo,navigate,capabilities,totals,financial,financialError,
 financialBusy,moneyVisible,onToggleMoney}:HomeProps){
 const ready=(key:string)=>demo||capabilities[key+'.read']===true;
 const tickets=data.tickets.filter(t=>!['Answered','Closed'].includes(t.status));
 const pendingOrders=data.orders.filter(o=>o.status==='Pending');
 const dueInvoices=data.invoices.filter(i=>['unpaid','overdue','payment pending'].includes(i.status.toLowerCase()));
 const overdueCount=dueInvoices.filter(i=>invoiceDue(i).kind==='overdue').length;
 const invoiceCount=readyInvoiceCount(totals,capabilities,demo,data.invoices.length);
 const income=(period:keyof Pick<FinancialSummary,'today'|'month'|'year'|'allTime'>)=>{
  if(demo)return '—';
  return financial?.[period]||'—';
 };
 const quickActions:{page:Page;label:string;icon:string;subtitle?:string}[]=[
  {page:'invoices',label:'الفواتير',icon:'receipt-text-outline',
   subtitle:invoiceCount==='—'?undefined:invoiceCount+' فاتورة'},
  {page:'tickets',label:'التذاكر',icon:'ticket-outline'},
  {page:'whatsapp',label:'واتساب',icon:'whatsapp'},
  {page:'clients',label:'العملاء',icon:'account-outline'},
  {page:'services',label:'الخدمات',icon:'server-outline'},
  {page:'orders',label:'الطلبات',icon:'cart-outline'}
 ];
 return <View style={{paddingBottom:10,gap:13}}>
  <View style={{flexDirection:'row-reverse',alignItems:'center',justifyContent:'space-between',gap:11}}>
   <View style={{flex:1,gap:3}}>
    <T size={10} color={H.accent} weight="800">لوحة الإدارة</T>
    <T color={H.ink} size={21} weight="900">نظرة عامة</T>
   </View>
   <View style={{height:40,width:40,borderRadius:13,backgroundColor:H.paper,
    borderWidth:1,borderColor:H.stroke,alignItems:'center',justifyContent:'center'}}>
    <Icon name="chart-box-outline" color={H.accent} size={22}/>
   </View>
  </View>

  <View style={[lifted(),{padding:12,gap:9}]}>
   <View style={{flexDirection:'row-reverse',alignItems:'center',justifyContent:'space-between'}}>
    <View style={{gap:2}}>
     <T color={H.ink} size={15} weight="900">ملخص الدخل</T>
     <T color={H.muted} size={10}>إحصاءات WHMCS الرسمية</T>
    </View>
    <Pressable accessibilityRole="button" accessibilityLabel={moneyVisible?'إخفاء الأرصدة':'إظهار الأرصدة'}
     accessibilityState={{expanded:moneyVisible}} onPress={onToggleMoney}
     style={{height:32,width:32,borderRadius:11,backgroundColor:H.soft,
      alignItems:'center',justifyContent:'center'}}>
     <Icon name={moneyVisible?'eye-off-outline':'eye-outline'} color={H.accent} size={19}/>
    </Pressable>
   </View>
   <View style={{flexDirection:'row-reverse',flexWrap:'wrap',justifyContent:'space-between',rowGap:7}}>
    <MoneyMini label="اليوم" icon="calendar-today" value={income('today')}
     hidden={!moneyVisible} loading={financialBusy}/>
    <MoneyMini label="الشهر الحالي" icon="calendar-month-outline" value={income('month')}
     hidden={!moneyVisible} loading={financialBusy}/>
    <MoneyMini label="السنة الحالية" icon="calendar-range" value={income('year')}
     hidden={!moneyVisible} loading={financialBusy}/>
    <MoneyMini label="كل الوقت" icon="chart-line" value={income('allTime')}
     hidden={!moneyVisible} loading={financialBusy}/>
   </View>
   <View style={{borderTopWidth:1,borderColor:H.stroke,paddingTop:10,
    flexDirection:'row-reverse',alignItems:'center',gap:8}}>
    <View style={{width:32,height:32,borderRadius:11,backgroundColor:H.accentSoft,
     justifyContent:'center',alignItems:'center'}}>
     <Icon name="receipt-text-outline" color={H.accent} size={19}/>
    </View>
    <View style={{flex:1,gap:1}}>
     <T color={H.ink} size={11} weight="700">إجمالي قيمة الفواتير غير المدفوعة</T>
     <T color={H.muted} size={9}>قبل خصم الدفعات الجزئية</T>
    </View>
    <T color={H.ink} size={12} weight="900" lines={2}
     style={{maxWidth:112,writingDirection:'ltr',textAlign:'left'}}>
     {!moneyVisible?'••••••':financialBusy?'...':financial?.unpaidAvailable?financial.unpaid:'—'}
    </T>
   </View>
   {moneyVisible&&(financialError||financial?.warning)?<View style={{padding:9,borderRadius:10,
    backgroundColor:H.accentSoft}}>
    <T color={H.accent} size={11}>{financialError||financial?.warning}</T>
   </View>:null}
  </View>

  <View style={{gap:8}}>
   <Label text="وصول سريع" sub="اختار الخدمة"/>
   <View style={{flexDirection:'row-reverse',flexWrap:'wrap',justifyContent:'space-between',
    rowGap:8}}>
    {quickActions.map(action=><Shortcut key={action.page} label={action.label}
     icon={action.icon} subtitle={action.subtitle} onPress={()=>navigate(action.page)}/>)}
   </View>
  </View>

  <View style={{gap:8}}>
   <Label text="المتابعة" sub="الأعداد تخص البيانات المحمّلة"/>
   <View style={{flexDirection:'row-reverse',gap:9}}>
    <CountMini label="تذاكر تنتظر" value={ready('tickets')?String(tickets.length):'—'}
     color={H.accent} icon="ticket-outline" onPress={()=>navigate('tickets')}/>
    <CountMini label="طلبات معلقة" value={ready('orders')?String(pendingOrders.length):'—'}
     color={H.accent} icon="cart-clock" onPress={()=>navigate('orders')}/>
    <CountMini label="فواتير متأخرة" value={ready('invoices')?String(overdueCount):'—'}
     color={H.red} icon="clock-alert-outline" onPress={()=>navigate('invoices')}/>
   </View>
  </View>

  {tickets.length>0?<View style={{gap:9}}>
   <Label text="آخر التذاكر" sub="التي تحتاج متابعة"/>
   <View style={[lifted(),{paddingHorizontal:13,paddingVertical:4}]}>
    {tickets.slice(0,2).map((t,index)=><Pressable key={t.id} accessibilityRole="button"
     onPress={()=>navigate('tickets')} style={({pressed})=>({flexDirection:'row-reverse',
      alignItems:'center',paddingVertical:11,gap:10,
      borderBottomWidth:index===Math.min(tickets.length,2)-1?0:1,borderColor:H.stroke,
      opacity:pressed?0.7:1})}>
     <View style={{height:33,width:33,borderRadius:11,backgroundColor:H.soft,
      alignItems:'center',justifyContent:'center'}}>
      <Icon name="ticket-outline" color={H.accent} size={18}/>
     </View>
     <View style={{flex:1,gap:2}}>
      <T color={H.ink} size={12} weight="700" lines={1}>{t.subject||'تذكرة #'+t.number}</T>
      <T color={H.muted} size={10} lines={1}>#{t.number} • {t.customer}</T>
     </View>
     <Icon name="chevron-left" color={H.muted} size={19}/>
    </Pressable>)}
   </View>
  </View>:null}
 </View>;
}
