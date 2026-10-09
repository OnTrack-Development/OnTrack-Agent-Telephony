import React, {useMemo,useState} from 'react';
import {View} from 'react-native';
import {C} from '../theme';
import type {DemoState,Page} from '../types';
import {Avatar,Card,Empty,Header,ItemRow,Pill,Search,T} from '../components/UI';

const config:Record<string,{title:string,subtitle:string,icon:string,key:keyof DemoState}>={
 clients:{title:'العملاء',subtitle:'الدليل وبيانات الحسابات',icon:'account-group-outline',key:'clients'},
 invoices:{title:'الفواتير',subtitle:'التحصيل والمستحقات',icon:'receipt-text-outline',key:'invoices'},
 services:{title:'الخدمات',subtitle:'استضافات وسيرفرات وخطط',icon:'server-network',key:'services'},
 orders:{title:'الطلبات',subtitle:'طلبات التفعيل والتجديد',icon:'cart-outline',key:'orders'},
 domains:{title:'الدومينات',subtitle:'الحالة وتواريخ الانتهاء',icon:'web',key:'domains'}
};
const colorOf=(status:string)=>/active|paid/i.test(status)?C.green:/unpaid|overdue|fraud|suspended|expiring/i.test(status)?C.red:C.orange;
export function Directory({page,data,onDetails}: {page:Page,data:DemoState,onDetails:(title:string,lines:[string,string][])=>void}) {
 const c=config[page]; const [q,setQ]=useState('');
 const records=useMemo(()=>c?(data[c.key] as any[]):[],[c,data]);
 const filtered=records.filter(record=>JSON.stringify(record).toLowerCase().includes(q.toLowerCase()));
 if(!c)return null;
 return <View><Header title={c.title} subtitle={c.subtitle}/><Search value={q} onChange={setQ} placeholder={`بحث في ${c.title}...`}/><T size={11} color={C.muted} style={{marginBottom:12}}>{filtered.length} سجل • البيانات {q?'المفلترة':'المعروضة'}</T>
 <Card style={{paddingVertical:4}}>{filtered.length?filtered.map((r:any,i:number)=>{
 const title=String(r.name||r.domain||r.customer||`${c.title} #${r.id}`);
 const description=page==='invoices'?`#${r.id} • ${r.amount} ${r.currency} • ${r.due}`:page==='services'?`${r.plan} • ${r.customer}`:page==='orders'?`${r.product} • ${r.amount}`:page==='clients'?r.email:`${r.customer} • ${r.expiry}`;
 const pairs=Object.entries(r).filter(([k])=>k!=='initials').map(([k,v])=>[k,String(v)] as [string,string]);
 return <ItemRow key={r.id||i} icon={c.icon} heading={title} subtitle={description} color={colorOf(r.status||'')} right={<Pill color={colorOf(r.status||'')} label={String(r.status||'—')}/>} onPress={()=>onDetails(title,pairs)}/>;
 }):<Empty text="لا توجد نتائج مطابقة" icon={c.icon}/>}</Card>
 </View>;
}
