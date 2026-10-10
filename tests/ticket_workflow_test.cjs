const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const ts=require('../mobile/node_modules/typescript');

const source=fs.readFileSync(path.join(__dirname,'../mobile/src/lib/tickets.ts'),'utf8');
const compiled=ts.transpileModule(source,{
 compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}
}).outputText;
const calls=[];
const sample=[
 {id:'101',tid:'241-101',subject:'Need support',status:'Open',flag:'4'},
 {id:'102',tid:'241-102',subject:'Answered ticket',status:'Answered',flag:'0'},
 {id:'103',tid:'241-103',subject:'Closed ticket',status:'Closed',flag:'0'},
 {id:'104',tid:'241-104',subject:'Customer response',status:'Customer-Reply',flag:'0'},
 {id:'105',tid:'241-105',subject:'On hold',status:'On Hold',flag:'0'}
];
const context={exports:{},require(name){
 if(name==='./api')return {
  listOf:(d,c,s)=>d?.[c]?.[s]||[],
  callApi:async(_s,action,params)=>{
   calls.push({action,params});
   if(action==='GetTickets')return {ok:true,data:{
    result:'success',totalresults:sample.length,tickets:{ticket:sample}
   }};
   if(action==='GetAdminDetails')return {ok:true,data:{adminid:'4',name:'Admin',signature:'<p>Thanks<br>Admin</p>'}};
   if(action==='GetTicket')return {ok:true,data:{ticketid:101,tid:'241-101',status:'Open',priority:'High',message:'Original',replies:{reply:[{replyid:2,message:'Response',admin:'Admin',date:'2026-10-09'}]}}};
   if(action==='GetSupportStatuses')return {ok:true,data:{statuses:{status:[{title:'Open'},{title:'Closed'}]}}};
   return {ok:false,error:'Unexpected action: '+action};
  }
 };
 throw Error('Unexpected import '+name);
}};
vm.runInNewContext(compiled,context);
const api=context.exports;
(async()=>{
 const session={baseUrl:'https://whmcs.example',mode:'api',identifier:'demo',secret:'***'};
 assert.equal(api.isClosed('Closed'),true);
 assert.equal(api.isClosed('مقفولة'),true);
 assert.equal(api.isClosed('Open'),false);
 assert.equal(api.ticketMatchesQueue('Closed','awaiting'),false);
 assert.equal(api.ticketMatchesQueue('Closed','allActive'),false);
 assert.equal(api.ticketMatchesQueue('Closed','closed'),true);
 assert.equal(api.ticketMatchesQueue('Closed','all'),false);
 assert.equal(api.ticketMatchesQueue('Answered','answered'),true);
 assert.equal(api.ticketMatchesQueue('Answered','awaiting'),false);
 assert.equal(api.ticketMatchesQueue('Customer-Reply','awaiting'),true);
 const active=await api.fetchTicketQueue(session,'allActive');
 assert.equal(active.ok,true);
 assert.equal(active.tickets.length,4);
 assert.ok(!active.tickets.some(t=>t.id===103));
 const closed=await api.fetchTicketQueue(session,'closed');
 assert.deepEqual(Array.from(closed.tickets.map(t=>t.id)),[103]);
 const waiting=await api.fetchTicketQueue(session,'awaiting');
 assert.deepEqual(Array.from(waiting.tickets.map(t=>t.id)),[101,104,105]);
 const all=await api.fetchTicketQueue(session,'all');
 assert.equal(all.tickets.length,4);
 assert.equal(calls.filter(c=>c.action==='GetTickets').length,4);
 assert.equal(calls.find(c=>c.params.status==='Closed').action,'GetTickets');
 const profile=await api.fetchOperatorProfile(session);
 assert.equal(profile.adminid,4);
 assert.equal(api.signatureText(profile.signature),'Thanks\nAdmin');
 const signed=api.replyWithSignature('I will help',profile.signature,true);
 assert.equal(signed,'I will help\n\n<p>Thanks<br>Admin</p>');
 assert.equal(api.replyWithSignature(signed,profile.signature,true),signed);
 assert.equal(api.replyWithSignature('I will help\n\nThanks\nAdmin',profile.signature,true),'I will help\n\nThanks\nAdmin');
 assert.equal(api.replyWithSignature('I will help',profile.signature,false),'I will help');
 const detail=await api.fetchTicketDetail(session,101);
 assert.equal(detail.ok,true);
 assert.equal(detail.detail.number,'241-101');
 assert.equal(detail.detail.messages.length,2);
 assert.equal(detail.detail.clientId,0);
 assert.equal(detail.detail.customFieldsProvided,false);
 assert.equal(detail.detail.customFields.length,0);
 const enhanced=api.normalizeTicketThread({
  ticketid:55,tid:'Ticket-55',userid:'72',contactid:'3',requestor_name:'Owner',requestor_email:'owner@example.test',
  customfields:{customfield:[
   {id:'17',name:'Server Type',value:'Linux VPS'},
   {id:'18',name:'Password',value:'must-be-masked'}
  ]}
 });
 assert.equal(enhanced.clientId,72);
 assert.equal(enhanced.contactId,3);
 assert.equal(enhanced.email,'owner@example.test');
 assert.equal(enhanced.customFieldsProvided,true);
 assert.equal(enhanced.customFields.length,1);
 assert.equal(enhanced.customFields[0].value,'Linux VPS');
 const single=api.normalizeTicketThread({ticketid:56,customfields:{customfield:{id:1,name:'Platform',value:'Windows'}}});
 assert.equal(single.customFields.length,1);
 console.log('PASS: WHMCS ticket queue modes, hidden closed tickets, custom statuses, admin signature and ticket detail');
})().catch(err=>{console.error(err);process.exit(1);});
