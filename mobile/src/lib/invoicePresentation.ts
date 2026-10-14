import type {Invoice} from '../types';

/** Calendar-only math: due dates represent local business dates, not UTC instants. */
export function invoiceDayIndex(value:string):number|null{
 const text=String(value||'').trim();
 let year=0,month=0,day=0;
 const iso=/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})(?:[ T].*)?$/.exec(text);
 if(iso){year=Number(iso[1]);month=Number(iso[2]);day=Number(iso[3]);}
 else{
  const regional=/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/.exec(text);
  if(!regional)return null;
  // WHMCS regional display can be ambiguous; prefer day/month for Arabic UI,
  // but only parse dates whose day/month interpretation is unambiguous.
  const first=Number(regional[1]),second=Number(regional[2]);
  if(first<=12&&second<=12)return null;
  day=first>12?first:second;
  month=first>12?second:first;
  year=Number(regional[3]);
 }
 if(year<1970||year>2200||month<1||month>12||day<1||day>31)return null;
 const utc=Date.UTC(year,month-1,day);
 const check=new Date(utc);
 if(check.getUTCFullYear()!==year||check.getUTCMonth()!==month-1||check.getUTCDate()!==day)return null;
 return Math.floor(utc/86400000);
}
export type InvoiceDue={kind:'overdue'|'upcoming'|'today'|'paid'|'neutral';label:string;days:number|null};
export function invoiceDue(invoice:Pick<Invoice,'status'|'due'>,now:Date=new Date()):InvoiceDue{
 const status=String(invoice.status||'').toLowerCase().trim();
 if(status==='paid')return {kind:'paid',label:'مدفوعة',days:null};
 if(!['unpaid','overdue','payment pending'].includes(status))
  return {kind:'neutral',label:invoice.status||'غير معروفة',days:null};
 const due=invoiceDayIndex(invoice.due);
 if(due===null)return {kind:status==='overdue'?'overdue':'neutral',
  label:status==='overdue'?'فاتورة متأخرة':'تاريخ الاستحقاق غير متاح',days:null};
 const today=Math.floor(Date.UTC(now.getFullYear(),now.getMonth(),now.getDate())/86400000);
 const diff=due-today;
 if(diff<0)return {kind:'overdue',label:'متأخرة '+Math.abs(diff)+' يوم',days:-diff};
 if(diff===0)return {kind:'today',label:'مستحقة اليوم',days:0};
 return {kind:'upcoming',label:'متبقي '+diff+' يوم',days:diff};
}
export function invoicePriority(i:Invoice,now:Date=new Date()):number{
 const d=invoiceDue(i,now);
 return d.kind==='overdue'?0:d.kind==='today'?1:d.kind==='upcoming'?2:d.kind==='neutral'?3:4;
}
export function invoiceSort(a:Invoice,b:Invoice,now:Date=new Date()):number{
 const pa=invoicePriority(a,now),pb=invoicePriority(b,now);
 if(pa!==pb)return pa-pb;
 const da=invoiceDayIndex(a.due),db=invoiceDayIndex(b.due);
 // More overdue first; nearest upcoming first.
 if(da!==null&&db!==null&&da!==db)return pa===0?da-db:da-db;
 return b.id-a.id;
}
