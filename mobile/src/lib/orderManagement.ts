import type {Session} from '../types';
import {callApi,listOf} from './api';
const s=(v:any)=>v===null||v===undefined||typeof v==='object'?'':String(v).trim();
const id=(v:any)=>Number.isSafeInteger(Number(v))&&Number(v)>0?Number(v):0;
export function orderNumber(order:any):string{return s(order?.ordernum)||s(order?.id);}
export function orderTitle(order:any):string{
 const n=orderNumber(order),internal=s(order?.id);
 return 'طلب #'+n+(n!==internal&&internal?' • ID '+internal:'');
}
export interface OrderLine {type:string;relid:number;product:string;domain:string;billingcycle:string;amount:string;status:string;paymentstatus:string}
export function orderLines(order:any):OrderLine[]{
 return listOf(order,'lineitems','lineitem').map(row=>({
  type:s(row.type),relid:id(row.relid),product:s(row.product||row.productname||row.description),
  domain:s(row.domain),billingcycle:s(row.billingcycle),amount:s(row.amount),status:s(row.status),
  paymentstatus:s(row.paymentstatus)
 }));
}
export function checkOrderRecord(order:any,orderid:number,clientid?:number):boolean{
 return id(order?.id)===orderid&&id(order?.userid)>0&&(!clientid||id(order.userid)===clientid);
}
export type OrderAction='AcceptOrder'|'CancelOrder'|'FraudOrder'|'PendingOrder'|'DeleteOrder';
export async function runOrderAction(session:Session,action:OrderAction,orderId:number,clientId:number,options?:{autosetup:boolean;sendemail:boolean;sendregistrar:boolean}){
 const result=await callApi(session,'GetOrders',{id:orderId,limitnum:2});
 if(!result.ok)return result;
 const order=listOf(result.data,'orders','order').find(row=>id(row.id)===orderId);
 if(!checkOrderRecord(order,orderId,clientId))return {ok:false,error:'تعذر التحقق من الطلب أو مالكه'};
 const status=s(order.status).toLowerCase();
 if((action==='AcceptOrder'||action==='CancelOrder'||action==='FraudOrder')&&status!=='pending')
  return {ok:false,error:'هذا الإجراء مسموح للطلبات Pending فقط'};
 if(action==='PendingOrder'&&status==='pending')
  return {ok:true,data:{unchanged:true}};
 if(action==='DeleteOrder')return {ok:false,error:'الحذف النهائي يجب إجراؤه من لوحة WHMCS بعد التحقق من الصلاحيات.'};
 const params:Record<string,string|number|boolean>={orderid:orderId};
 if(action==='AcceptOrder'){
  params.autosetup=options?.autosetup?1:0;
  params.sendemail=options?.sendemail?1:0;
  params.sendregistrar=options?.sendregistrar?1:0;
 }
 if(action==='CancelOrder'||action==='FraudOrder')params.cancelsub=0;
 return callApi(session,action,params);
}
