import {callApi,listOf} from './api';
import type {Session} from '../types';
export interface NewTicketDraft {departmentId:number;subject:string;message:string;priority:string;clientId?:number;name?:string;email?:string}
export function newTicketParams(draft:NewTicketDraft):Record<string,string|number> {
 if(!Number.isSafeInteger(draft.departmentId)||draft.departmentId<1)throw Error('اختر قسم التذكرة');
 if(!draft.subject.trim()||draft.subject.length>255||!draft.message.trim()||draft.message.length>30000)throw Error('اكتب موضوعًا ورسالة صالحين');
 if(!['Low','Medium','High'].includes(draft.priority))throw Error('أولوية غير صالحة');
 const params:Record<string,string|number>={deptid:draft.departmentId,subject:draft.subject.trim(),message:draft.message.trim(),priority:draft.priority};
 if(draft.clientId!==undefined){
  if(!Number.isSafeInteger(draft.clientId)||draft.clientId<1)throw Error('رقم عميل غير صالح');
  params.clientid=draft.clientId;
 }else{
  if(!draft.name?.trim()||!draft.email||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(draft.email.trim()))throw Error('اكتب اسم الزائر وإيميله الصحيح');
  params.name=draft.name.trim();params.email=draft.email.trim();
 }
 return params;
}
export async function supportDepartments(session:Session):Promise<{id:number;name:string}[]>{
 const r=await callApi(session,'GetSupportDepartments');
 if(!r.ok)throw Error(r.error||'تعذر قراءة الأقسام');
 return listOf(r.data,'departments','department').map(d=>({id:Number(d.id),name:String(d.name||'')})).filter(d=>Number.isSafeInteger(d.id)&&d.id>0);
}
export async function verifyTicketClient(session:Session,id:number):Promise<{id:number;name:string;email:string}>{
 if(!Number.isSafeInteger(id)||id<1)throw Error('اكتب رقم العميل الصحيح');
 const r=await callApi(session,'GetClientsDetails',{clientid:id,stats:false});
 if(!r.ok)throw Error(r.error||'تعذر التحقق من العميل');
 const data:any=r.data;
 const client=data.client||data;
 if(Number(client.client_id||client.id||client.userid)!==id)throw Error('بيانات العميل غير مطابقة للرقم المطلوب');
 return {id,name:String(client.companyname||`${client.firstname||''} ${client.lastname||''}`.trim()),email:String(client.email||'')};
}
