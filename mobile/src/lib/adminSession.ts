import {NativeModules} from 'react-native';
import * as SecureStore from 'expo-secure-store';
import {validateBaseUrl} from './api';
import type {Session} from '../types';

interface HttpResponse {status:number;url:string;body:string}
interface LoginForm {action:string;fields:Record<string,string>;otpField?:string}
interface AdminState {directory:string;key:string;ready:boolean;username:string;revision:number;challenge?:LoginForm}
let states=new WeakMap<Session,AdminState>();
const CONFIG_KEY='whmcs-existing-whatsapp-admin-directory-v1';
let epoch=0;
export const adminSessionReady=(session:Session)=>!!states.get(session)?.ready;
export const adminSessionStamp=(session:Session)=>(states.get(session)?.key||'')+'|'+(states.get(session)?.revision||0);
export const adminDirectory=(session:Session)=>states.get(session)?.directory||'admin';
export function validateAdminDirectory(value:string):string {
 const dir=value.trim().replace(/^\/+|\/+$/g,'');
 if(!/^[A-Za-z0-9_-]{2,64}$/.test(dir))throw Error('اكتب اسم مجلد الإدارة فقط، بدون رابط');
 return dir;
}
export async function savedAdminDirectory(session:Session):Promise<string>{
 return await SecureStore.getItemAsync(CONFIG_KEY+'|'+validateBaseUrl(session.baseUrl))||'admin';
}
export function htmlText(value:string):string {
 return value.replace(/<br\s*\/?>/gi,'\n').replace(/<[^>]*>/g,' ').replace(/&#x([0-9a-f]+);/gi,(_m,n)=>{
  const code=parseInt(n,16);return code<=0x10ffff?String.fromCodePoint(code):'';
 }).replace(/&#(\d+);/g,(_m,n)=>Number(n)<=0x10ffff?String.fromCodePoint(Number(n)):'')
 .replace(/&quot;/g,'"').replace(/&#039;|&apos;/g,"'").replace(/&lt;/g,'<').replace(/&gt;/g,'>')
 .replace(/&nbsp;/g,' ').replace(/&amp;/g,'&').trim();
}
export function attributes(tag:string):Record<string,string>{
 const out:Record<string,string>={};
 const re=/([\w:-]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g;
 for(const m of tag.matchAll(re))out[m[1]!.toLowerCase()]=htmlText(m[2]??m[3]??m[4]??'');
 return out;
}
export function checkedAdminUrl(base:string,directory:string,target:string):string {
 const root=validateBaseUrl(base)+'/',url=new URL(target,root),home=new URL(root);
 if(url.origin!==home.origin||url.username||url.password||url.hash||!url.pathname.startsWith(home.pathname))
  throw Error('مسار الإدارة خارج WHMCS');
 const path=url.pathname.slice(home.pathname.length),dir=validateAdminDirectory(directory);
 if(path.includes('%')||path.includes('..')||!new RegExp('^'+dir+'/(?:|(?:index|login|dologin|logout|twofa|supporttickets|addonmodules)\\.php)$').test(path))
  throw Error('مسار إدارة غير مدعوم');
 if(path===dir+'/addonmodules.php'&&(url.searchParams.getAll('module').length!==1||!['whatsapp_notifications','ai_support_agent'].includes(url.searchParams.get('module')||'')))
  throw Error('موديول غير مدعوم');
 return url.toString();
}
export function parseLoginForm(html:string,pageUrl:string,base:string,dir:string):LoginForm|null{
 for(const match of html.matchAll(/<form\b([^>]*)>([\s\S]*?)<\/form>/gi)){
  const inputs=Array.from(match[2]!.matchAll(/<input\b[^>]*>/gi),m=>attributes(m[0]));
  const login=inputs.some(i=>i.name==='username')&&inputs.some(i=>i.name==='password');
  const otp=inputs.find(i=>/^(code|twofa|otp|twofacode|authenticationcode)$/i.test(i.name||'')&&i.type!=='hidden');
  if(!login&&!otp)continue;
  if(/g-recaptcha|h-captcha|name\s*=\s*["']captcha/i.test(match[2]!))throw Error('تسجيل دخول الإدارة يتطلب CAPTCHA؛ لا يمكن إكماله تلقائيًا.');
  const form=attributes(match[1]!);
  const action=checkedAdminUrl(base,dir,new URL(form.action||pageUrl,pageUrl).toString());
  const fields:Record<string,string>={};
  for(const input of inputs)if(input.name&&input.type==='hidden')fields[input.name]=input.value||'';
  return {action,fields,...(otp?{otpField:otp.name}:{})};
 }
 return null;
}
export async function resetAdminSessions():Promise<void>{
 epoch++;states=new WeakMap<Session,AdminState>();
 await NativeModules.CommandAdminSession?.resetAll();
}
async function request(session:Session,state:AdminState,target:string,method:'GET'|'POST',fields:Record<string,string|number>={},headers:Record<string,string>={}):Promise<HttpResponse>{
 const native=NativeModules.CommandAdminSession;
 if(!native?.request)throw Error('الربط الداخلي يحتاج تحديث تطبيق WHMCS لأحدث إصدار.');
 const stamp=epoch;
 const response:HttpResponse=await native.request(state.key,validateBaseUrl(session.baseUrl),state.directory,target,method,fields,headers);
 if(stamp!==epoch)throw Error('تم تغيير جلسة الدخول.');
 return response;
}
export async function loginAdmin(session:Session,directory:string,username:string,password:string,otp=''):Promise<{ready:boolean;needsOtp:boolean}>{
 const dir=validateAdminDirectory(directory),name=username.trim();
 if(!name||(!password&&!otp))throw Error('اكتب اسم الموظف وكلمة المرور');
 let state=states.get(session);
 if(!state||state.directory!==dir||state.username!==name){
  await resetAdminSessions();
  state={directory:dir,key:validateBaseUrl(session.baseUrl)+'|'+dir+'|'+name+'|'+epoch,ready:false,username:name,revision:0};states.set(session,state);
 }
 state.ready=false;
 let form=state.challenge;
 if(!form||!otp){
  const page=await request(session,state,dir+'/index.php','GET');
  if(page.status===404)throw Error('مجلد الإدارة غير صحيح. اكتب اسم مجلد الإدارة الموجود عندك.');
  if(page.status>=400)throw Error('WHMCS رفض فتح صفحة الدخول ('+page.status+').');
  form=parseLoginForm(page.body,page.url,session.baseUrl,dir)||undefined;
  if(!form&&/logout\.php/i.test(page.body)){state.ready=true;state.revision++;return {ready:true,needsOtp:false};}
 }
 if(!form)throw Error('لم يتم التعرف على نموذج تسجيل دخول WHMCS.');
 const fields={...form.fields,...(form.otpField?{[form.otpField]:otp}:{username:name,password})};
 const response=await request(session,state,form.action,'POST',fields);
 const next=parseLoginForm(response.body,response.url,session.baseUrl,dir);
 if(next?.otpField){state.challenge=next;return {ready:false,needsOtp:true};}
 state.challenge=undefined;
 if(response.status>=400||next||!/logout\.php/i.test(response.body))throw Error('لم يتم تسجيل الدخول. راجع بيانات الموظف وقيود الدخول في WHMCS.');
 state.ready=true;state.revision++;
 await SecureStore.setItemAsync(CONFIG_KEY+'|'+validateBaseUrl(session.baseUrl),dir,{keychainAccessible:SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY});
 return {ready:true,needsOtp:false};
}
export async function adminRequest(session:Session,target:string,method:'GET'|'POST'='GET',fields:Record<string,string|number>={},headers:Record<string,string>={}):Promise<HttpResponse>{
 const state=states.get(session);
 if(!state?.ready)throw Error('سجّل دخول الإدارة داخل التطبيق أولًا.');
 const response=await request(session,state,target,method,fields,headers);
 if(response.status===401||/\/(?:login|dologin)\.php(?:\?|$)/.test(response.url)||/<input\b[^>]*name\s*=\s*["']password["']/i.test(response.body)){
  state.ready=false;throw Error('انتهت جلسة الإدارة؛ سجّل الدخول مرة أخرى.');
 }
 return response;
}
export async function adminPage(session:Session,page:string):Promise<string>{
 const path=checkedAdminUrl(session.baseUrl,adminDirectory(session),adminDirectory(session)+'/'+page);
 const response=await adminRequest(session,path);
 if(response.status>=400)throw Error('تعذر قراءة صفحة WHMCS ('+response.status+').');
 return response.body;
}
