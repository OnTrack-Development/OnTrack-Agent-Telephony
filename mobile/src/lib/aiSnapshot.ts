import type {AiAgent,QueueJob,Session} from '../types';
import {adminPage,adminRequest,adminSessionStamp} from './adminSession';
const tokens=new WeakMap<Session,{token:string;stamp:string}>();
export function snapshotToken(html:string):string {
 const normalized=html.replace(/\\\//g,'/').replace(/\\u0026/g,'&').replace(/&amp;/g,'&');
 const token=normalized.match(/admin_snapshot\.php\?events=\d+&token=([a-f0-9]{48,64})/i)?.[1];
 if(!token)throw Error('لم تتوفر صلاحية قراءة غرفة العمليات.');
 return token;
}
export function normalizeSnapshot(snapshot:any):{agents:AiAgent[];queue:QueueJob[];generatedAt:string}{
 if(!Array.isArray(snapshot?.agents)||!Array.isArray(snapshot?.tickets))throw Error('بيانات غرفة العمليات غير صالحة');
 const statusMap:Record<string,AiAgent['status']>={working:'working',consulting:'review',escalating:'review',attention:'review',available:'idle'};
 const agents:AiAgent[]=snapshot.agents.map((a:any)=>({id:String(a.id),name:String(a.name||''),role:String(a.role||''),status:a.status==='paused'?'offline':statusMap[a.live_status]||'idle',tasks:snapshot.tickets.filter((t:any)=>Number(t.agent_id)===Number(a.id)).length,icon:'robot-outline'}));
 const queue:QueueJob[]=snapshot.tickets.map((t:any)=>({id:Number(t.id),ticket:Number(t.id),agent:agents.find(a=>a.id===String(t.agent_id))?.name||String(t.agent_slug||''),state:String(t.queue_status||''),since:String(t.available_at||'')}));
 return {agents,queue,generatedAt:String(snapshot.generated_at||'')};
}
export async function fetchAiSnapshot(session:Session):Promise<{agents:AiAgent[];queue:QueueJob[];generatedAt:string}>{
 let token=tokens.get(session)?.stamp===adminSessionStamp(session)?tokens.get(session)?.token:undefined;
 if(!token){token=snapshotToken(await adminPage(session,'addonmodules.php?module=ai_support_agent&tab=operations'));tokens.set(session,{token,stamp:adminSessionStamp(session)});}
 const response=await adminRequest(session,'modules/addons/ai_support_agent/admin_snapshot.php?events=80','GET',{}, {'X-AISA-ADMIN-TOKEN':token});
 if(response.status===403){tokens.delete(session);throw Error('انتهت صلاحية غرفة العمليات؛ أعد تحميلها.');}
 let data:any;try{data=JSON.parse(response.body);}catch{throw Error('لم ترجع غرفة العمليات بيانات صالحة.');}
 if(response.status>=400||data.ok!==true)throw Error('تعذر قراءة غرفة العمليات من الموديول الحالي.');
 return normalizeSnapshot(data.snapshot);
}
