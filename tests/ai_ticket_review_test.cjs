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
(async()=>{
 apiResult={ok:true,data:detail('supportbot')};
 const result=await audit.checkAiLastReply({},ticket,bot);
 assert.equal(result.kind,'match');
 assert.equal(calls.length,1);assert.equal(calls[0].action,'GetTicket');
 assert.equal(calls[0].params.ticketid,78);assert.equal(calls[0].params.repliessort,'ASC');
 apiResult={ok:false,code:'HTTP_429',error:'Rate limited'};
 const limited=await audit.checkAiLastReply({},ticket,bot);
 assert.equal(limited.rateLimited,true);
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
 console.log('PASS: real WHMCS admin selector, unique names, staff IDs, read-only lists and 429');
})().catch(e=>{console.error(e);process.exit(1);});
