const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const ts=require('../mobile/node_modules/typescript');
const calls=[],saved=[],apiCalls=[];
let scenario='success',apiHandler=async()=>({ok:false,error:'Not allowed'});
const csrf='a'.repeat(64),nonce='1791600000.'+'b'.repeat(64),snapshot='c'.repeat(48);
const loginHtml='<form action="dologin.php"><input type="hidden" name="token" value="login-token"><input name="username"><input type="password" name="password"></form>';
const ticketHtml=`<input name="token" value="ticket-csrf" type="hidden"><label for="cf1">Domain</label><input id="cf1" name="customfield[1]" value="example.test"><label for="cf2">Description</label><textarea id="cf2" name="customfields[2]">A &amp; B</textarea><label for="cf3">Platform</label><select id="cf3" name="customfield[3]"><option>Linux</option><option selected>Windows</option></select><label for="cf4">Password</label><input id="cf4" name="customfield[4]" type="password" value="hidden"><label for="cf5">Enabled</label><input id="cf5" name="customfield[5]" type="checkbox" checked><button id="aisa-return-ai"></button><script>body.set('ai_ticket_nonce','${nonce}');</script>`;
const session={baseUrl:'https://example.test/portal',mode:'admin',username:'staff',password:'staff-pass'};
const conversation={id:3,display_name:'Customer',phone:'+201234567890',unread_count:2,window:{open:true,remaining_seconds:3600}};
const native={resetAll:async()=>{},request:async(key,base,dir,target,method,fields,headers)=>{
 calls.push({key,base,dir,target,method,fields,headers});
 const url=new URL(target,base+'/');let body='',status=200;
 if(scenario==='expired')return {status:401,url:url.toString(),body:'{"status":"error"}'};
 if(url.pathname.endsWith('index.php'))body=loginHtml;
 else if(url.pathname.endsWith('dologin.php')){assert.equal(fields.token,'login-token');assert.equal(fields.username,'staff');assert.equal(fields.password,'staff-pass');body=scenario==='otp'?'<form action="twofa.php"><input type="hidden" name="token" value="otp-token"><input name="code"></form>':'<a href="logout.php">Sign out</a>';}
 else if(url.pathname.endsWith('twofa.php')){assert.equal(fields.code,'123456');assert.equal(fields.token,'otp-token');body='<a href="logout.php">Sign out</a>';}
 else if(url.pathname.endsWith('addonmodules.php'))body=url.searchParams.get('module')==='whatsapp_notifications'?`<script>var token = "${csrf}"; window.waCSRFToken = token;</script>`:`<script>{"snapshot_url":"../modules/addons/ai_support_agent/admin_snapshot.php?events=100&token=${snapshot}"}</script>`;
 else if(url.pathname.endsWith('supporttickets.php')){
  if(method==='POST'){assert.equal(fields.ai_ticket_action,'return_to_ai');assert.equal(fields.ticketid,101);assert.equal(fields.ai_ticket_nonce,nonce);assert.equal(fields.token,'ticket-csrf');body='{"ok":true,"message":"Returned by module"}';}else body=ticketHtml;
 }else if(url.pathname.endsWith('admin_snapshot.php')){
  assert.equal(headers['X-AISA-ADMIN-TOKEN'],snapshot);body=JSON.stringify({ok:true,snapshot:{agents:[{id:5,name:'Hosting',role:'Hosting support',status:'active',live_status:'working'}],tickets:[{id:101,agent_id:5,queue_status:'processing'}],generated_at:'now'}});
 }else if(url.pathname.endsWith('ajax.php')){
  const action=fields.ajax_action||url.searchParams.get('ajax_action');
  if(method==='POST')assert.equal(headers['X-WA-CSRF'],csrf);
  if(action==='chat_list')body=JSON.stringify({status:'success',conversations:[conversation],unread_total:2});
  else if(action==='chat_messages')body=JSON.stringify({status:'success',conversation:{...conversation,id:scenario==='mismatch'?4:3},messages:[{id:7,direction:'incoming',body:'hello',message_type:'text'}]});
  else if(action==='chat_send'){if(scenario==='window'){status=409;body='{"status":"error","window_closed":true,"message":"Window closed"}';}else body='{"status":"success"}';}
  else if(action==='chat_mark_read')body='{"status":"success"}';
  else throw Error('Undocumented action '+action);
 }else throw Error('Unknown route '+url);
 return {status,url:url.toString(),body};
}};
const cache={};
function load(name){
 if(cache[name])return cache[name];
 const code=fs.readFileSync(path.join(__dirname,'../mobile/src/lib/'+name+'.ts'),'utf8');
 const js=ts.transpileModule(code,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
 const context={exports:{},URL,URLSearchParams,setTimeout,clearTimeout,require(imported){
  if(imported==='react-native')return {NativeModules:{CommandAdminSession:native}};
  if(imported==='expo-secure-store')return {WHEN_UNLOCKED_THIS_DEVICE_ONLY:1,getItemAsync:async()=>null,setItemAsync:async(k,v)=>saved.push({k,v})};
  if(imported==='./api')return {validateBaseUrl:base=>base.replace(/\/$/,''),listOf:(d,c,s)=>{const v=d?.[c]?.[s];return Array.isArray(v)?v:v?[v]:[];},callApi:async(s,action,params)=>{apiCalls.push({s,action,params});return apiHandler(s,action,params);}};
  if(imported.startsWith('./'))return load(imported.slice(2));
  throw Error('Unexpected import '+imported);
 }};
 vm.runInNewContext(js,context);cache[name]=context.exports;return context.exports;
}
(async()=>{
 const admin=load('adminSession'),wa=load('whatsapp'),ticket=load('ticketAdmin'),create=load('createTicket'),ai=load('aiSnapshot');
 assert.throws(()=>admin.checkedAdminUrl(session.baseUrl,'admin','https://attacker.test/admin/dologin.php'));
 assert.throws(()=>admin.checkedAdminUrl(session.baseUrl,'admin','admin/addonmodules.php?module=other'));
 assert.throws(()=>admin.checkedAdminUrl(session.baseUrl,'admin','admin/../clientarea.php'));
 assert.throws(()=>admin.validateAdminDirectory('https://attacker.test'));
 assert.throws(()=>admin.parseLoginForm('<form action="https://attacker.test/admin/dologin.php"><input name="username"><input name="password"></form>','https://example.test/portal/admin/index.php',session.baseUrl,'admin'));
 await assert.rejects(()=>admin.adminRequest(session,'admin/index.php'),/أولًا/);
 scenario='otp';const first=await admin.loginAdmin(session,'admin','staff','staff-pass');assert.equal(first.needsOtp,true);assert.equal(admin.adminSessionReady(session),false);
 scenario='success';const second=await admin.loginAdmin(session,'admin','staff','staff-pass','123456');assert.equal(second.ready,true);assert.ok(!saved.some(x=>x.v.includes('staff-pass')));
 await wa.prepareWhatsApp(session);const list=await wa.listConversations(session,'Customer',true);assert.equal(list.unread,2);assert.equal(list.conversations[0].id,3);
 const query=new URL(calls.at(-1).target,session.baseUrl+'/');assert.equal(query.searchParams.get('ajax_action'),'chat_list');assert.equal(query.searchParams.get('unread_only'),'1');
 const thread=await wa.conversationMessages(session,3);assert.equal(thread.messages[0].body,'hello');
 scenario='mismatch';await assert.rejects(()=>wa.conversationMessages(session,3),/مطابقة/);scenario='success';
 await wa.sendWhatsAppText(session,3,' Hello ');assert.equal(calls.at(-1).fields.message,'Hello');assert.equal(calls.at(-1).method,'POST');
 const sendCount=calls.filter(x=>x.fields.ajax_action==='chat_send').length;
 scenario='window';await assert.rejects(()=>wa.sendWhatsAppText(session,3,'test'),/Window closed/);assert.equal(calls.filter(x=>x.fields.ajax_action==='chat_send').length,sendCount+1,'no implicit write retry');scenario='success';
 await assert.rejects(()=>wa.sendWhatsAppText(session,3,''),/غير صالح/);
 await wa.markConversationRead(session,3);
 const parsed=ticket.parseTicketAdmin(ticketHtml);assert.equal(parsed.customFields.length,4);assert.equal(parsed.customFields[1].value,'A & B');assert.equal(parsed.customFields[2].value,'Windows');assert.equal(parsed.customFields[3].value,'نعم');assert.equal(parsed.aiNonce,nonce);
 assert.equal(ticket.parseTicketAdmin('<p>Missing control</p>').aiNonce,null);
 const action=await ticket.returnTicketToAi(session,101);assert.equal(action,'Returned by module');
 const result=await ai.fetchAiSnapshot(session);assert.equal(result.agents[0].tasks,1);assert.equal(result.queue[0].ticket,101);
 assert.throws(()=>create.newTicketParams({departmentId:0,subject:'test',message:'test',priority:'Medium',clientId:1}));
 assert.throws(()=>create.newTicketParams({departmentId:1,subject:'test',message:'test',priority:'Medium',email:'invalid',name:'Guest'}));
 const params=create.newTicketParams({departmentId:1,subject:'Subject',message:'Message',priority:'High',clientId:42});assert.equal(params.clientid,42);assert.ok(!('adminusername' in params));assert.ok(!('ignore_dept_assignments' in params));
 apiHandler=async()=>({ok:true,data:{client:{client_id:43,firstname:'Wrong'}}});await assert.rejects(()=>create.verifyTicketClient(session,42),/مطابقة/);
 apiHandler=async()=>({ok:true,data:{client:{client_id:42,firstname:'Customer',email:'customer@example.test'}}});assert.equal((await create.verifyTicketClient(session,42)).id,42);
 scenario='expired';await assert.rejects(()=>wa.listConversations(session),/انتهت/);assert.equal(admin.adminSessionReady(session),false);
 await admin.resetAdminSessions();assert.equal(admin.adminSessionReady(session),false);
 assert.ok(calls.every(c=>c.base===session.baseUrl));
 console.log('PASS: native admin login and OTP, same-origin routes, session expiry/logout, existing WhatsApp CSRF/read/send/window handling, mismatched conversation rejection, real per-ticket AI nonce, custom fields, AI snapshot and verified new-ticket ownership');
})().catch(e=>{console.error(e);process.exit(1)});
