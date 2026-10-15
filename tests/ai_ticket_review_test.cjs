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
assert.deepEqual(Array.from(audit.aiIdentityNames(' AI ، AI Support Agent ,ai')), ['ai','ai support agent']);
assert.equal(audit.aiAuthorMatches('AI', 'ai'),true);
assert.equal(audit.aiAuthorMatches('AI Support Agent','AI'),false);
assert.equal(audit.aiAuthorMatches('Client AI Smith','AI'),false);
assert.equal(audit.mentionsHumanTransfer('سأحول التذكرة إلى خدمة العملاء'),true);
assert.equal(audit.mentionsHumanTransfer('We will escalate your ticket'),true);
const matched=audit.classifyAiLastReply(detail(),ticket,'AI');
assert.equal(matched.kind,'match');
assert.equal(matched.review.author,'AI');
assert.equal(matched.review.transferMentioned,true);
assert.equal(matched.review.ticket.status,'Answered');
assert.equal(audit.classifyAiLastReply(detail('Mohamed'),ticket,'AI').kind,'skip');
assert.equal(audit.classifyAiLastReply({...detail(),ticketid:79},ticket,'AI').kind,'skip');
assert.equal(audit.classifyAiLastReply({...detail(),status:'Closed'},ticket,'AI').kind,'skip');
assert.equal(audit.classifyAiLastReply({...detail(),replies:{reply:[
 {replyid:2,admin:'AI',message:'Done'},
 {replyid:3,admin:'',name:'Owner',message:'Still broken'}
]}},ticket,'AI').kind,'skip');
assert.equal(audit.classifyAiLastReply({...detail(),replies:{totalresults:20,reply:[{admin:'AI',message:'Done'}]}},ticket,'AI').kind,'error');
(async()=>{
 apiResult={ok:true,data:detail()};
 const result=await audit.checkAiLastReply({},ticket,'AI');
 assert.equal(result.kind,'match');
 assert.equal(calls.length,1);assert.equal(calls[0].action,'GetTicket');
 assert.equal(calls[0].params.ticketid,78);assert.equal(calls[0].params.repliessort,'ASC');
 apiResult={ok:false,code:'HTTP_429',error:'Rate limited'};
 const limited=await audit.checkAiLastReply({},ticket,'AI');
 assert.equal(limited.rateLimited,true);
 console.log('PASS: AI last-replier identity, customer replies, closed exclusion, transfer warnings and 429');
})().catch(e=>{console.error(e);process.exit(1);});
