import type {Session} from '../types';
import {callApi,listOf} from './api';

/**
 * WHMCS GetStats uses the same backend-calculated income definitions as the
 * admin overview. Preserve its original, formatted currency strings verbatim.
 * Never infer revenue from invoices, sum currencies or silently fabricate zeros.
 */
export interface FinancialSummary{
 today:string;month:string;year:string;allTime:string;
 unpaid:string;unpaidCount:number;unpaidAvailable:boolean;
 warning?:string;
}
function amount(v:any):string{
 if(typeof v==='string'&&v.trim()&&v.trim().length<80)return v.trim();
 if(typeof v==='number'&&Number.isFinite(v))return v.toFixed(2);
 throw Error('WHMCS لم يرجع قيمة دخل صحيحة');
}
export function normalizeStats(data:any):Omit<FinancialSummary,'unpaid'|'unpaidCount'|'unpaidAvailable'|'warning'>{
 return {today:amount(data?.income_today),month:amount(data?.income_thismonth),
 year:amount(data?.income_thisyear),allTime:amount(data?.income_alltime)};
}
export function unpaidInvoiceTotal(response:any):{value:string;count:number}{
 const count=Number(response?.totalresults);
 const rows=listOf(response,'invoices','invoice');
 if(!Number.isSafeInteger(count)||count<0||count!==rows.length)
  throw Error('قائمة الفواتير غير المدفوعة غير كاملة؛ لن نعرض إجماليًا ناقصًا.');
 const totals=new Map<string,{value:number;prefix:string;suffix:string}>();
 for(const row of rows){
  if(!['Unpaid','Overdue'].includes(String(row.status)))continue;
  // GetInvoices lists face values, not necessarily remaining balance after partial payments.
  const total=Number(row.total);
  if(!Number.isFinite(total)||total<0)throw Error('WHMCS أعاد قيمة فاتورة غير صالحة');
  const code=String(row.currencycode||'').trim();
  if(!code)throw Error('تعذر تحديد عملة إحدى الفواتير');
  const prefix=String(row.currencyprefix||''),suffix=String(row.currencysuffix||'');
  const old=totals.get(code);
  if(old)old.value+=total;
  else totals.set(code,{value:total,prefix,suffix});
 }
 return {value:totals.size?Array.from(totals.entries())
  .map(([code,item])=>item.prefix+item.value.toFixed(2)+(item.suffix||' '+code)).join(' • '):'0.00',
  count};
}
export async function loadFinancialSummary(session:Session):Promise<FinancialSummary>{
 const stats=await callApi(session,'GetStats');
 if(!stats.ok)throw Error(stats.error||'صلاحية عرض إحصاءات الدخل غير متاحة');
 const core=normalizeStats(stats.data);
 const inv=await callApi(session,'GetInvoices',{status:'Unpaid',limitstart:0,limitnum:500});
 if(!inv.ok)return {...core,unpaid:'—',unpaidCount:0,unpaidAvailable:false,
  warning:'إيرادات WHMCS متاحة، لكن إجمالي الفواتير غير المدفوعة يتطلب صلاحية قراءة الفواتير.'};
 try{
  const total=unpaidInvoiceTotal(inv.data);
  return {...core,unpaid:total.value,unpaidCount:total.count,unpaidAvailable:true};
 }catch(e){return {...core,unpaid:'—',unpaidCount:0,unpaidAvailable:false,
  warning:e instanceof Error?e.message:'إجمالي الفواتير غير متاح'};}
}
