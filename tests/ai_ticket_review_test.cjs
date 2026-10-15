const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const ts=require('../mobile/node_modules/typescript');
const source=fs.readFileSync(path.join(__dirname,'../mobile/src/lib/aiTicketReview.ts'),'utf8');
const js=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
let apiResult=null,calls=[];
const context={exports:{},require(name){
 if(name==='./api')return {callApi:async(_session,action,params)=>{calls.push({action,params});return apiResult;}};
 if(name==='./tickets')return {isClosed:s=>String(s).toLowerCase()==='closed'};
 throw Error('Unexpected import '+name);
}};
vm.runInNewContext(js,context);
const audit=context.exports;
const ticket={id:78,number:'T-78',subject:'Transfer promised',customer:'Owner',status:'Answered',updated:'yesterday'};
function detail(lastAdmin='AI',lastMessage='سأحول التذكرة إلى خدمة العملاء'){
 return {ticketid:78,status:'Answered',replies:{reply:[
  {replyid:1,admin:'',name:'Owner',message:'Please help'},
  {replyid:2,admin:lastAdmin,name:'Admin User',message:lastMessage}
 ]}};
}
const rawUsers={admin_users:[
 {id:7,username:'supportbot',fullName:'العميل الآلي',isDisabled:0},
 {id:8,username:'human',fullName:'Ahmed Fawzi',isDisabled:0},
 {id:9,username:'admin2',fullName:'Ahmed Fawzi',isDisabled:1}
]};
const users=audit.parseAiAdminUsers(rawUsers);
assert.equal(users.length,3);
const bot=users.find(x=>x.id===7);
const human=users.find(x=>x.id===8);
assert.ok(bot);
assert.equal(bot.username,'supportbot');
assert.equal(audit.aiAuthorMatches({admin:'supportbot'},bot),true);
assert.equal(audit.aiAuthorMatches({admin:'العميل الآلي'},bot),true);
assert.equal(audit.aiAuthorMatches({adminid:7,admin:'wrong'},bot),true);
assert.equal(audit.aiAuthorMatches({adminid:8,admin:'supportbot'},bot),false);
assert.equal(audit.aiAuthorMatches({admin:'Ahmed Fawzi'},human),false,'duplicate display names must not match');
assert.equal(audit.aiAuthorMatches({name:'supportbot',admin:''},bot),false,'customer name is never admin proof');
const observed=audit.observedAdminResponders({ticketid:78,replies:{reply:[
 {replyid:0,name:'Bot Name',message:'Customer starts',admin:''},
 {replyid:1,admin:'مساعد الدعم الذكي',message:'Hello',requestor_name:'Customer'},
 {replyid:2,admin:'Ahmed Human',message:'Handled manually'},
 {replyid:3,name:'Customer',message:'Thanks',admin:''}
]}},78);
assert.equal(observed.length,2);
assert.equal(observed[0].source,'reply');
assert.equal(observed[0].fullName,'مساعد الدعم الذكي');
assert.equal(observed[0].id,0);
assert.equal(audit.aiAuthorMatches({admin:'مساعد الدعم الذكي'},observed[0]),true);
assert.equal(audit.aiAuthorMatches({admin:'Ahmed Human'},observed[0]),false);
assert.equal(audit.observedAdminResponders({ticketid:79,replies:{reply:[{admin:'Bot',message:'Wrong ticket'}]}},78).length,0);
assert.equal(audit.observedAdminResponders({ticketid:78,replies:{reply:[{name:'Fake Bot',message:'customer',admin:''}]}},78).length,0);
assert.equal(audit.mentionsHumanTransfer('سأحول التذكرة إلى خدمة العملاء'),true);
assert.equal(audit.mentionsHumanTransfer('We will escalate your ticket'),true);
const matched=audit.classifyAiLastReply(detail('supportbot'),ticket,bot);
assert.equal(matched.kind,'match');
assert.equal(matched.review.author,'supportbot');
assert.equal(matched.review.transferMentioned,true);
assert.equal(matched.review.ticket.status,'Answered');
assert.equal(audit.classifyAiLastReply(detail('Mohamed'),ticket,bot).kind,'skip');
assert.equal(audit.classifyAiLastReply({...detail(),ticketid:79},ticket,bot).kind,'skip');
assert.equal(audit.classifyAiLastReply({...detail(),status:'Closed'},ticket,bot).kind,'skip');
assert.equal(audit.classifyAiLastReply({...detail(),replies:{reply:[
 {replyid:2,admin:'AI',message:'Done'},
 {replyid:3,admin:'',name:'Owner',message:'Still broken'}
]}},ticket,bot).kind,'skip');
assert.equal(audit.classifyAiLastReply({...detail(),replies:{totalresults:20,reply:[{admin:'AI',message:'Done'}]}},ticket,bot).kind,'error');
const stillAi={...detail('supportbot'),flag:0};
assert.equal(audit.classifyActiveAiTicket(stillAi,{...ticket,flag:0},bot).kind,'match');
assert.equal(audit.classifyActiveAiTicket({...stillAi,flag:8},{...ticket,flag:8},bot).kind,'skip');
assert.equal(audit.classifyActiveAiTicket(stillAi,{...ticket,flag:8},bot).kind,'match','authoritative detail flag overrides stale list');
assert.equal(audit.classifyActiveAiTicket({...stillAi,status:'Closed'},ticket,bot).kind,'skip');
assert.equal(audit.classifyActiveAiTicket({...stillAi,replies:{reply:[
 {replyid:1,admin:'supportbot',message:'Hello'},
 {replyid:2,admin:'',name:'Customer',message:'Thanks'}
]}},ticket,bot).kind,'skip');
assert.equal(audit.classifyActiveAiTicket({...stillAi,flag:7},{...ticket,flag:7},bot).kind,'match',
 'ticket still assigned to the selected AI account itself is not a human handoff');
(async()=>{
 apiResult={ok:true,data:detail('supportbot')};
 const result=await audit.checkAiLastReply({},ticket,bot);
 assert.equal(result.kind,'match');
 assert.equal(calls.length,1);assert.equal(calls[0].action,'GetTicket');
 assert.equal(calls[0].params.ticketid,78);assert.equal(calls[0].params.repliessort,'ASC');
 apiResult={ok:false,code:'HTTP_429',error:'Rate limited'};
 const limited=await audit.checkAiLastReply({},ticket,bot);
 assert.equal(limited.rateLimited,true);
 apiResult={ok:true,data:{ticketid:78,replies:{reply:[{admin:'مساعد الدعم الذكي',message:'Verified'}]}}};
 const discovered=await audit.fetchObservedResponders({},ticket);
 assert.equal(discovered.users.length,1);
 assert.equal(discovered.users[0].fullName,'مساعد الدعم الذكي');
 assert.equal(calls.at(-1).action,'GetTicket');
 apiResult={ok:false,code:'HTTP_429',error:'Rate limit'};
 const discoveryLimited=await audit.fetchObservedResponders({},ticket);
 assert.equal(discoveryLimited.rateLimited,true);
 apiResult={ok:true,data:stillAi};
 const checked=await audit.checkActiveAiTicket({},ticket,bot);
 assert.equal(checked.kind,'match');
 assert.equal(calls.at(-1).action,'GetTicket');
  apiResult={ok:true,data:rawUsers};
 const fromWhmcs=await audit.fetchAiAdminUsers({});
 assert.equal(fromWhmcs.ok,true);
 assert.equal(fromWhmcs.users.length,3);
 assert.equal(calls.at(-1).action,'GetAdminUsers');
 assert.equal(calls.at(-1).params.include_disabled,true);
 apiResult={ok:false,error:'Access denied'};
 const blocked=await audit.fetchAiAdminUsers({});
 assert.equal(blocked.ok,false);
 assert.equal(blocked.users.length,0);
 console.log('PASS: WHMCS GetAdminUsers and verified responder-derived selectors, no customer guessing, rate-limit backoff');
})().catch(e=>{console.error(e);process.exit(1);});
