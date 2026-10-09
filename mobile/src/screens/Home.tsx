import React from 'react';
import {View,Pressable} from 'react-native';
import {C,money} from '../theme';
import type {DemoState,Page} from '../types';
import {Action,Card,Header,Icon,ItemRow,Metric,Pill,Section,T} from '../components/UI';
export function Home({data,demo,navigate,capabilities,totals}: {data:DemoState,demo:boolean,navigate:(p:Page)=>void,capabilities:Record<string,boolean>,totals:Record<string,number|null>}) {
 const open=data.tickets.filter(x=>x.status!=='Answered'&&x.status!=='Closed');
 const unpaid=data.invoices.filter(x=>x.status==='Unpaid'||x.status==='Overdue');
 const outstanding=unpaid.reduce((s,i)=>s+i.amount,0);
 const bars=[26,36,28,47,40,61,49,72,65,80,60,91];
 const currencies=[...new Set(unpaid.map(i=>i.currency).filter(Boolean))];
 const unpaidText=!demo&&capabilities['invoices.read']===undefined?'افتح قسم الفواتير للتحميل':!demo&&!capabilities['invoices.read']?'غير متاح':demo?money(outstanding):currencies.length===1?money(outstanding,currencies[0]||''):currencies.length>1?'فواتير بعملات متعددة':`عدد الفواتير: ${unpaid.length}`;
 return <View>
   <View style={{flexDirection:'row-reverse',justifyContent:'space-between',alignItems:'center',marginBottom:19}}><View><T color={C.muted} size={12}>{`مركز التحكم • ${new Date().toLocaleDateString('ar-EG')}`}</T><T size={25} weight="900">أهلًا بيك 👋</T></View><View style={{width:45,height:45,borderRadius:15,backgroundColor:C.redDark,alignItems:'center',justifyContent:'center'}}><Icon name="shield-account" color={C.red} size={28}/></View></View>
   <Card style={{backgroundColor:'#251925',borderColor:'#542539',padding:18,overflow:'hidden'}}>
     <View style={{flexDirection:'row-reverse',justifyContent:'space-between',alignItems:'center'}}><Pill label={demo?'بيانات تجريبية':'اتصال مباشر'} color={demo?C.orange:C.green} icon="circle-small"/><Icon name="pulse" color={C.red}/></View>
     <T size={13} color={C.muted} style={{marginTop:12}}>الفواتير غير المسددة (السجلات المحمّلة)</T><T size={29} weight="900">{unpaidText}</T><View style={{marginTop:13,flexDirection:'row-reverse',justifyContent:'space-between'}}><T size={12} color={C.muted}>{!demo&&capabilities['invoices.read']===undefined?'لم تُطلب البيانات بعد':!demo&&!capabilities['invoices.read']?'صلاحية القراءة غير متاحة':`${unpaid.length} فاتورة من المحمّل`}</T><Pressable onPress={()=>navigate('invoices')}><T size={12} color={C.red} weight="800">عرض الفواتير ←</T></Pressable></View>
   </Card>
   <Section title="نظرة عامة"/><View style={{flexDirection:'row-reverse',flexWrap:'wrap',gap:10}}>
      <Metric icon="ticket-confirmation-outline" label="تذاكر منتظرة" value={!demo&&!capabilities['tickets.read']?'—':`${open.length}`} color={C.red} sub="ضمن المحمّل" onPress={()=>navigate('tickets')}/>
      <Metric icon="account-group-outline" label="العملاء" value={!demo&&!capabilities['clients.read']?'—':`${totals.clients ?? data.clients.length}`} color={C.blue} sub={totals.clients!=null?'إجمالي API':'محمّلة'} onPress={()=>navigate('clients')}/>
      <Metric icon="server-network" label="الخدمات" value={!demo&&!capabilities['services.read']?'—':`${totals.services ?? data.services.length}`} color={C.green} sub={totals.services!=null?'إجمالي API':'محمّلة'} onPress={()=>navigate('services')}/>
      <Metric icon="cart-outline" label="طلبات جديدة" value={`${data.orders.filter(o=>o.status==='Pending').length}`} color={C.purple} sub="ضمن المحمّل" onPress={()=>navigate('orders')}/>
   </View>
   {demo?<Section title="نشاط التحصيل" action="التفاصيل" onPress={()=>navigate('invoices')}/>:null}
   {demo?<Card style={{paddingBottom:12}}><View style={{flexDirection:'row-reverse',justifyContent:'space-between'}}><View><T weight="800" size={19}>الأداء المالي</T><T size={11} color={C.muted}>رسم توضيحي في الوضع التجريبي</T></View><Pill label="آخر 12 يوم" color={C.blue}/></View><View style={{height:105,flexDirection:'row-reverse',gap:7,alignItems:'flex-end',paddingTop:15}}>{bars.map((n,i)=><View key={i} style={{flex:1,backgroundColor:i===bars.length-1?C.red:C.surface2,borderRadius:6,height:`${n}%`,maxHeight:90}}/>)}</View><View style={{flexDirection:'row-reverse',justifyContent:'space-between',marginTop:9}}><T size={10} color={C.muted}>الأحدث</T><T size={10} color={C.muted}>الأقدم</T></View></Card>:null}
   <Section title="تذاكر تستحق المتابعة" action="كل التذاكر" onPress={()=>navigate('tickets')}/>
   <Card>{data.tickets.filter(t=>t.status!=='Answered'&&t.status!=='Closed').slice(0,3).map((t,i)=><View key={t.id}><ItemRow icon="ticket-outline" heading={t.subject} subtitle={`#${t.number} • ${t.customer} • ${t.priority}`} color={t.priority==='High'?C.red:C.blue} onPress={()=>navigate('tickets')} right={<Pill label={t.priority==='High'?'عاجل':'متابعة'} color={t.priority==='High'?C.red:C.orange}/>}/>{i===2?null:null}</View>)}</Card>
   <Section title="الوصول السريع"/><View style={{flexDirection:'row-reverse',gap:9,marginBottom:20}}><View style={{flex:1}}><Action label="رسائل واتساب" icon="whatsapp" onPress={()=>navigate('whatsapp')}/></View><View style={{flex:1}}><Action label="غرفة AI" icon="robot-outline" secondary onPress={()=>navigate('ai')}/></View></View>
 </View>;
}
