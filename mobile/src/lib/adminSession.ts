import {NativeModules} from 'react-native';
import * as SecureStore from 'expo-secure-store';
import {md5} from 'js-md5';
import {validateBaseUrl} from './api';
import type {Session} from '../types';

interface HttpResponse {status:number;url:string;body:string}
interface LoginForm {action:string;fields:Record<string,string>;otpField?:string}
interface AdminState {directory:string;key:string;ready:boolean;username:string;revision:number;challenge?:LoginForm}
let states=new WeakMap<Session,AdminState>();
const CONFIG_KEY='whmcs-admin-directory-v2';
/** SecureStore keys cannot contain : / or |. Hash only the public WHMCS URL. */
export const adminDirectoryStorageKey=(session:Session):string=>CONFIG_KEY+'-'+md5(validateBaseUrl(session.baseUrl));
let epoch=0;
export const adminSessionReady=(session:Session)=>!!states.get(session)?.ready;
export const adminSessionStamp=(session:Session)=>(states.get(session)?.key||'')+'|'+(states.get(session)?.revision||0);
export const adminDirectory=(session:Session)=>states.get(session)?.directory||'admin';
/** Accept either the admin directory name or an admin URL copied from the browser.
 * Never allow this field to change the configured WHMCS host or installation root.
 */
export function validateAdminDirectory(value:string,baseUrl?:string):string {
 const original=value.trim();
 if(!original)throw Error('اكتب اسم مجلد الإدارة أو الصق رابط لوحة WHMCS.');
 let dir=original;
 if(/^https?:\/\//i.test(original)){
  if(!baseUrl)throw Error('رابط الإدارة لازم يكون من نفس سيرفر WHMCS.');
  let u:URL;
  try{u=new URL(original);}catch{throw Error('رابط لوحة الإدارة غير صالح.');}
  const home=new URL(validateBaseUrl(baseUrl)+'/');
  if(u.protocol!=='https:'||u.origin!==home.origin||u.username||u.password||u.hash)
   throw Error('رابط الإدارة لازم يكون HTTPS ومن نفس سيرفر WHMCS.');
  if(!u.pathname.startsWith(home.pathname))
   throw Error('رابط الإدارة خارج مسار تثبيت WHMCS.');
  dir=u.pathname.slice(home.pathname.length);
  if(u.search&&!(dir.endsWith('/addonmodules.php')||dir.endsWith('/index.php')||dir.endsWith('/login.php')))
   throw Error('الصق رابط مجلد الإدارة أو إحدى صفحاته الرئيسية فقط.');
 }else if(/[?:#]/.test(original)){
  throw Error('اكتب اسم مجلد الإدارة فقط، أو رابط HTTPS الكامل لنفس سيرفر WHMCS.');
 }
 dir=dir.replace(/^\/+|\/+$/g,'').replace(/\/(?:index|login|addonmodules)\.php$/i,'');
 if(!/^[A-Za-z0-9_-]{2,64}$/.test(dir))
  throw Error('مجلد الإدارة لازم يكون اسم مجلد واحد مثل admin أو رابط لوحة الإدارة الكامل، وليس مسار ملفات السيرفر.');
 return dir;
}
export async function savedAdminDirectory(session:Session):Promise<string>{
 try{
  const value=await SecureStore.getItemAsync(adminDirectoryStorageKey(session));
  return value?validateAdminDirectory(value,session.baseUrl):'admin';
 }catch{return 'admin';}
}
/** Only store the selected admin *directory*, never username/password/Meta tokens. */
export async function saveAdminDirectory(session:Session,value:string):Promise<string>{
 const dir=validateAdminDirectory(value,session.baseUrl);
 await SecureStore.setItemAsync(adminDirectoryStorageKey(session),dir,{
  keychainAccessible:SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY
 });
 return dir;
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
/** Only an actual, WHMCS-admin-protected WhatsApp Inbox proves native authentication.
 * Do not infer success from logout.php string in arbitrary HTML: many WHMCS
 * themes omit that link. Browser login and app's native cookie jar are separate.
 */
export function isVerifiedWhatsAppInbox(html:string):boolean {
 return /window\.waCSRFToken\s*=\s*["'][a-f0-9]{32,128}["']/i.test(html)
  || /var\s+token\s*=\s*["'][a-f0-9]{32,128}["'];\s*window\.waCSRFToken\s*=\s*token/i.test(html);
}
/** Distinguish admin login from access to the existing WhatsApp addon. */
export function whatsappAccessDiagnostic(html:string,url:string,directory:string):string {
 const plain=htmlText(html).slice(0,15000);
 if(/(?:you do not have permission|permission denied|access denied|unauthori[sz]ed|not authori[sz]ed|ليس لديك صلاحية|غير مصرح|لا تملك صلاحية)/i.test(plain))
  return 'WHMCS رفض الوصول لموديول واتساب. راجع صلاحية موديول واتساب ضمن Administrator Roles، حتى لو الدور اسمه Administrator.';
 if(/(?:addon not found|module not found|not activated|addon module is not active|الموديول غير مفعل|الإضافة غير مفعلة)/i.test(plain))
  return 'صفحة إضافة واتساب غير متاحة داخل WHMCS. تحقق إن الموديول الأصلي مفعل.';
 if(!url.includes('/'+directory+'/addonmodules.php'))
  return 'WHMCS أعاد التوجيه لصفحة مختلفة بدل Inbox واتساب. راجع مسار الإدارة وجلسة دخول الموظف.';
 return 'الدخول لموديول واتساب لم يُثبت رغم استجابة WHMCS. افتح Inbox من المتصفح بنفس الحساب وتأكد من ظهوره، ثم تحقق من صلاحية موديول واتساب.';
}
async function proveAdminAccess(session:Session,state:AdminState):Promise<void>{
 const route=state.directory+'/addonmodules.php?module=whatsapp_notifications&action=chat';
 const page=await request(session,state,route,'GET');
 if(page.status===429)throw Error('السيرفر منع محاولات الدخول مؤقتًا HTTP 429. انتظر قبل المحاولة التالية.');
 if(page.status===401||page.status===403)
  throw Error('WHMCS رفض الوصول لصندوق واتساب (HTTP '+page.status+'). تحقق من صلاحيات الموظف وقواعد حماية الإدارة.');
 if(page.status>=400)
  throw Error('تعذر فتح صندوق واتساب بعد محاولة الدخول (HTTP '+page.status+').');
 if(parseLoginForm(page.body,page.url,session.baseUrl,state.directory))
  throw Error('WHMCS رجّع التطبيق لصفحة تسجيل الدخول بعد إرسال البيانات. راجع بيانات الموظف أو رمز التحقق أو حماية الدخول.');
 if(!isVerifiedWhatsAppInbox(page.body))
  throw Error(whatsappAccessDiagnostic(page.body,page.url,state.directory));
}
export async function loginAdmin(session:Session,directory:string,username:string,password:string,otp=''):Promise<{ready:boolean;needsOtp:boolean}>{
 const dir=validateAdminDirectory(directory,session.baseUrl),name=username.trim();
 if(!name||(!password&&!otp))throw Error('اكتب اسم الموظف وكلمة المرور');
 let state=states.get(session);
 if(!state||state.directory!==dir||state.username!==name){
  await resetAdminSessions();
  state={directory:dir,key:validateBaseUrl(session.baseUrl)+'|'+dir+'|'+name+'|'+epoch,ready:false,username:name,revision:0};states.set(session,state);
 }
 state.ready=false;
 let form=state.challenge;
 if(!form||!otp){
  // WHMCS installations differ in their admin landing path. Try only
  // documented, same-origin admin entrypoints, not arbitrary endpoints.
  const entries=[dir+'/',dir+'/index.php',dir+'/login.php'];
  let seen404=0,loginPage:HttpResponse|null=null;
  for(const candidate of entries){
   const page=await request(session,state,candidate,'GET');
   if(page.status===404){seen404++;continue;}
   if(page.status===429)throw Error('WHMCS رفض كثرة المحاولات مؤقتًا (429). انتظر قبل إعادة تسجيل الدخول.');
   if(page.status===403)throw Error('WHMCS رفض الوصول للإدارة (403). تحقق من صلاحيات الحساب أو حماية السيرفر.');
   if(page.status>=400)throw Error('صفحة إدارة WHMCS رجّعت HTTP '+page.status+'.');
   const parsed=parseLoginForm(page.body,page.url,session.baseUrl,dir);
   if(parsed){form=parsed;loginPage=page;break;}
   if(/logout\.php/i.test(page.body)){
    await proveAdminAccess(session,state);
    state.ready=true;state.revision++;
    return {ready:true,needsOtp:false};
   }
   loginPage=page;
  }
  if(seen404===entries.length)
   throw Error('المجلد غير موجود على هذا الرابط (404). افتح لوحة إدارة WHMCS من المتصفح وانسخ رابطها الكامل في الخانة.');
  if(!form&&loginPage)
   throw Error('صفحة الإدارة موجودة لكن نموذج تسجيل الدخول مختلف أو يطلب حماية إضافية. جرّب نفس رابط لوحة الإدارة المفتوحة في المتصفح.');
 }
 if(!form)throw Error('لم يتم التعرف على نموذج تسجيل دخول WHMCS؛ افتح الإدارة من المتصفح للتحقق من مسار الدخول.');
 const fields={...form.fields,...(form.otpField?{[form.otpField]:otp}:{username:name,password})};
 const response=await request(session,state,form.action,'POST',fields);
 if(response.status===429)throw Error('السيرفر رفض محاولات الدخول مؤقتًا HTTP 429؛ لا تكرر المحاولة قبل انتهاء الحظر.');
 if(response.status===401||response.status===403)
  throw Error('WHMCS رفض بيانات الدخول (HTTP '+response.status+'). قد يكون عنوان الإنترنت أو حساب الموظف مقيدًا.');
 if(response.status>=400)throw Error('رد تسجيل دخول WHMCS هو HTTP '+response.status+'.');
 const next=parseLoginForm(response.body,response.url,session.baseUrl,dir);
 if(next?.otpField){state.challenge=next;return {ready:false,needsOtp:true};}
 state.challenge=undefined;
 if(next)throw Error('WHMCS أعاد نموذج الدخول بعد إرسال البيانات؛ تحقق من كلمة المرور وCAPTCHA أو إعدادات التحقق الثنائي.');
 // Prove a real authenticated page is accessible instead of demanding a
 // hard-coded logout.php link that isn't present in many WHMCS themes.
 await proveAdminAccess(session,state);
 state.ready=true;state.revision++;
 await saveAdminDirectory(session,dir);
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
