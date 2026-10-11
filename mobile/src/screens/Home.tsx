import React from 'react';
import {Pressable,View} from 'react-native';
import {C} from '../theme';
import type {DemoState,Page} from '../types';
import {Action,Card,Empty,Header,Icon,ItemRow,Metric,Pill,Section,T} from '../components/UI';

export function Home({data,demo,navigate,capabilities,totals}:{
 data:DemoState;demo:boolean;navigate:(p:Page)=>void;
 capabilities:Record<string,boolean>;totals:Record<string,number|null>;
}){
 const tickets=data.tickets.filter(x=>!['Answered','Closed'].includes(x.status));
 const pendingOrders=data.orders.filter(x=>x.status==='Pending');
 const dueInvoices=data.invoices.filter(x=>x.status==='Unpaid'||x.status==='Overdue');
 const ready=(key:string)=>demo||capabilities[key+'.read']===true;
 const metric=(key:'clients'|'services'|'orders'|'invoices')=>
  !ready(key)?'—':String(totals[key]??data[key].length);
 return <View style={{gap:3,paddingBottom:28}}>
  <View style={{marginBottom:18,gap:6}}>
   <View style={{flexDirection:'row-reverse',alignItems:'center',justifyContent:'space-between'}}>
    <T color={C.muted} size={12}>المساحة الرئيسية</T>
    <Pill label={demo?'بيانات تجريبية':'نظام الإدارة'} color={demo?C.orange:C.green} icon="circle-small"/>
   </View>
   <T size={30} weight="900">لوحة القيادة</T>
   <T color={C.muted} size={13}>نظرة واضحة على العمليات اللي محتاجة متابعتك</T>
  </View>

  <Pressable accessibilityRole="button" accessibilityLabel="فتح التذاكر التي تنتظر الرد"
   onPress={()=>navigate('tickets')} style={({pressed})=>({borderRadius:25,backgroundColor:'#232A36',
    borderWidth:1,borderColor:'#3C4556',padding:21,marginBottom:12,
    overflow:'hidden',opacity:pressed?0.85:1})}>
   <View pointerEvents="none" style={{position:'absolute',right:-82,top:-100,
    width:245,height:245,borderRadius:123,backgroundColor:'#3C242D',
    borderWidth:1,borderColor:'#573943'}}/>
   <View pointerEvents="none" style={{position:'absolute',right:7,top:21,
    width:102,height:102,borderRadius:51,borderWidth:1,borderColor:'#71515B',opacity:0.4}}/>
   <View style={{flexDirection:'row-reverse',alignItems:'center',justifyContent:'space-between'}}>
    <View style={{backgroundColor:C.red+'26',padding:10,borderRadius:13}}>
     <Icon name="ticket-confirmation-outline" size={23} color="#FF8797"/>
    </View>
    <View style={{backgroundColor:'#ffffff12',borderRadius:18,paddingVertical:6,paddingHorizontal:10}}>
     <T color="#D4DCE6" size={10}>أولوية المتابعة</T>
    </View>
   </View>
   <T size={12} color="#BBC5D1" style={{marginTop:23}}>تذاكر تنتظر التعامل</T>
   <T size={45} weight="900" style={{textAlign:'right',letterSpacing:-2,marginTop:1}}>
    {ready('tickets')?String(tickets.length):'—'}
   </T>
   <View style={{flexDirection:'row-reverse',alignItems:'center',justifyContent:'space-between',marginTop:16}}>
    <T color="#BBC5D1" size={11}>{ready('tickets')?'من التذاكر المحمّلة':'جاري التحقق من صلاحية التذاكر'}</T>
    <View style={{flexDirection:'row-reverse',alignItems:'center',gap:7}}>
     <T weight="800" color="#FF8B99" size={12}>عرض التذاكر</T>
     <Icon name="arrow-left" size={17} color="#FF8B99"/>
    </View>
   </View>
  </Pressable>

  <Section title="ملخص العمليات"/>
  <View style={{flexDirection:'row-reverse',flexWrap:'wrap',gap:11}}>
   <Metric icon="account-group-outline" label="العملاء" value={metric('clients')}
    sub={ready('clients')?(totals.clients!=null?'إجمالي WHMCS':'السجلات المحمّلة'):'غير محمّل'}
    color={C.blue} onPress={()=>navigate('clients')}/>
   <Metric icon="server-network" label="الخدمات" value={metric('services')}
    sub={ready('services')?(totals.services!=null?'إجمالي WHMCS':'السجلات المحمّلة'):'غير محمّل'}
    color={C.green} onPress={()=>navigate('services')}/>
   <Metric icon="cart-outline" label="طلبات معلّقة"
    value={ready('orders')?String(pendingOrders.length):'—'}
    sub="من السجلات المحمّلة" color={C.orange} onPress={()=>navigate('orders')}/>
   <Metric icon="receipt-text-outline" label="فواتير مستحقة"
    value={ready('invoices')?String(dueInvoices.length):'—'}
    sub="من السجلات المحمّلة" color={C.purple} onPress={()=>navigate('invoices')}/>
  </View>

  <Section title="وصول سريع"/>
  <Card style={{paddingHorizontal:16,paddingVertical:2}}>
   <ItemRow color={C.blue} icon="account-search-outline" heading="دليل العملاء"
    subtitle="الملفات والخدمات والتذاكر" onPress={()=>navigate('clients')}/>
   <ItemRow color={C.orange} icon="cart-check" heading="إدارة الطلبات"
    subtitle="اعتماد الطلبات ومتابعة الخدمات" onPress={()=>navigate('orders')}/>
   <ItemRow color={C.green} icon="whatsapp" heading="صندوق واتساب"
    subtitle="رسائل العملاء والرد عليها" onPress={()=>navigate('whatsapp')}/>
  </Card>

  <Section title="آخر التذاكر" action="عرض الكل" onPress={()=>navigate('tickets')}/>
  <Card style={{paddingHorizontal:16,paddingVertical:4}}>
   {tickets.length?tickets.slice(0,4).map(t=><ItemRow key={t.id} icon="ticket-outline"
    heading={t.subject||'تذكرة #'+t.number} subtitle={'#'+t.number+' • '+t.customer}
    color={t.priority==='High'?C.orange:C.blue} onPress={()=>navigate('tickets')}
    right={<Pill label={t.priority==='High'?'عاجلة':'متابعة'}
     color={t.priority==='High'?C.orange:C.blue}/>}/>):
    <Empty icon="checkbox-marked-circle-outline"
     text={ready('tickets')?'لا توجد تذاكر محتاجة رد في البيانات المحمّلة':'افتح التذاكر لتحميل أحدث البيانات'}/>}
  </Card>
  <View style={{marginTop:17}}>
   <T size={11} color={C.muted} style={{textAlign:'center'}}>الأرقام المعروضة تعتمد على البيانات المصرح بقراءتها من WHMCS.</T>
  </View>
 </View>;
}
