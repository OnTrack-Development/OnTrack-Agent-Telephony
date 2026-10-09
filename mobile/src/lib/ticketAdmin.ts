import type {Session} from '../types';
import type {TicketCustomField} from './tickets';
import {adminDirectory,adminPage,adminRequest,attributes,htmlText} from './adminSession';
export interface TicketAdminData {customFields:TicketCustomField[];aiNonce:string|null;whmcsToken:string|null}
export function parseTicketAdmin(html:string):TicketAdminData {
 const fields:TicketCustomField[]=[];
 const labels=new Map<string,string>();
 for(const m of html.matchAll(/<label\b([^>]*)>([\s\S]*?)<\/label>/gi)){
  const attrs=attributes(m[1]!);if(attrs.for)labels.set(attrs.for,htmlText(m[2]!));
 }
 const controls=/<input\b[^>]*>|<textarea\b[^>]*>[\s\S]*?<\/textarea>|<select\b[^>]*>[\s\S]*?<\/select>/gi;
 let whmcsToken:string|null=null;
 for(const m of html.matchAll(controls)){
  const a=attributes(m[0].split('>')[0]!),name=a.name||'';
  if(name==='token'&&a.value)whmcsToken=a.value;
  const id=name.match(/^customfields?\[(\d+)\]$/i)?.[1];
  if(!id||a.type==='password'||a.type==='hidden')continue;
  let label=labels.get(a.id||'')||'';
  if(!label){
   const prefix=html.slice(Math.max(0,m.index!-1200),m.index!);
   label=Array.from(prefix.matchAll(/<label\b[^>]*>([\s\S]*?)<\/label>/gi)).pop()?.[1]||'';
   // WHMCS also uses table cells for labels.
   if(!label)label=Array.from(prefix.matchAll(/<td\b[^>]*>([^<]*(?:<b>[^<]*<\/b>)?[^<]*)<\/td>/gi)).pop()?.[1]||'';
   label=htmlText(label);
  }
  if(!label||/password|secret|private.?key|token|كلمة.?المرور|كود.?سري/i.test(label))continue;
  let value=a.value||'';
  if(/^<textarea/i.test(m[0]))value=htmlText(m[0].replace(/^<textarea\b[^>]*>/i,'').replace(/<\/textarea>$/i,''));
  if(/^<select/i.test(m[0])){
   const options=Array.from(m[0].matchAll(/<option\b([^>]*)>([\s\S]*?)<\/option>/gi));
   const chosen=options.filter(option=>'selected' in attributes(option[1]!));
   value=(chosen.length?chosen:options.slice(0,1)).map(option=>htmlText(option[2]!)).join('، ');
  }
  if(a.type==='checkbox')value='checked' in a?'نعم':'لا';
  if(!fields.some(f=>f.id===id))fields.push({id,name:label,value});
 }
 const control=html.includes('id="aisa-return-ai"')||html.includes("id='aisa-return-ai'");
 const aiNonce=control?html.match(/body\.set\(\s*['"]ai_ticket_nonce['"]\s*,\s*['"]([0-9]+\.[a-f0-9]{64})['"]\s*\)/i)?.[1]||null:null;
 return {customFields:fields,aiNonce,whmcsToken};
}
export async function readTicketAdmin(session:Session,id:number):Promise<TicketAdminData>{
 if(!Number.isSafeInteger(id)||id<1)throw Error('رقم تذكرة غير صالح');
 return parseTicketAdmin(await adminPage(session,'supporttickets.php?action=view&id='+id));
}
export async function returnTicketToAi(session:Session,id:number):Promise<string>{
 // Fetch a fresh per-ticket, per-admin token from the real hook; never synthesize a handoff.
 const data=await readTicketAdmin(session,id);
 if(!data.aiNonce)throw Error('إجراء الإرجاع غير متاح لهذه التذكرة؛ تحقق من تفعيل أدوات AI وملكية التذكرة البشرية.');
 const response=await adminRequest(session,adminDirectory(session)+'/supporttickets.php?action=view&id='+id,'POST',{
  ai_ticket_action:'return_to_ai',ticketid:id,ai_ticket_nonce:data.aiNonce,...(data.whmcsToken?{token:data.whmcsToken}:{})
 },{'X-Requested-With':'XMLHttpRequest'});
 let json:any;try{json=JSON.parse(response.body);}catch{throw Error('لم يرجع WHMCS تأكيدًا؛ أعد تحميل التذكرة قبل المحاولة.');}
 if(response.status>=400||json.ok!==true)throw Error(String(json.message||'تعذر إعادة التذكرة إلى AI'));
 return String(json.message||'تمت إعادة التذكرة إلى المساعد AI');
}
