const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
const path=require('node:path');
const ts=require('../mobile/node_modules/typescript');
const src=fs.readFileSync(path.join(__dirname,'../mobile/src/lib/clientProfile.ts'),'utf8');
const js=ts.transpileModule(src,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
const requests=[];
const fixtures={
 GetClientsDetails:{result:'success',client:{id:92,firstname:'Client',lastname:'Example',companyname:'Example LLC',email:'client@example.test',phonenumber:'+201234000000',address1:'Office',city:'Cairo',status:'Active',notes:'Internal note',customfields:{customfield:[{name:'Platform',value:'Linux'},{name:'Password',value:'PRIVATE'}]}},stats:{numdueinvoices:'2',dueinvoicesbalance:'500.00',productsnumactive:'3',numtickets:'10'}},
 GetClientsProducts:{result:'success',totalresults:2,products:{product:[{id:1,clientid:92,name:'Hosting',status:'Active'},{id:2,clientid:92,name:'Support',status:'Active'}]}},
 GetClientsDomains:{result:'success',totalresults:0,domains:{domain:[]}},
 GetInvoices:{result:'success',totalresults:1,invoices:{invoice:[{id:11,userid:92,total:'250.00'}]}},
 GetTickets:{result:'success',totalresults:1,tickets:{ticket:[{id:33,userid:92,title:'Need support'}]}},
 GetOrders:{result:'success',totalresults:0,orders:{order:[]}},
 GetContacts:{result:'success',totalresults:0,contacts:{contact:[]}},
 GetQuotes:{result:'success',totalresults:1,quotes:{quote:[{id:99,userid:92,subject:'Migration'}]}},
 GetTransactions:{result:'success',totalresults:1,transactions:{transaction:[{id:44,userid:92,amountin:'100.00'}]}}
};
const context={exports:{},require(name){
 if(name==='./api')return {callApi:async(_session,action,params)=>{requests.push({action,params});return {ok:true,data:fixtures[action]}},listOf:(d,k,l)=>d?.[k]?.[l]||[]};
 throw Error('Unexpected import '+name);
}};
vm.runInNewContext(js,context);
const api=context.exports;
(async()=>{
 const client={id:92,name:'Example LLC',status:'Active',email:'client@example.test'};
 const session={baseUrl:'https://whmcs.example'};
 const summary=await api.fetchClientSummary(session,client);
 assert.equal(summary.ok,true);
 assert.equal(summary.data.id,92);
 assert.equal(summary.data.title,'Client Example');
 assert.equal(summary.data.billing.find(x=>x.label==='الفواتير المستحقة').value,'2');
 assert.equal(summary.data.services.find(x=>x.label==='الخدمات النشطة').value,'3');
 assert.equal(summary.data.custom.length,1);
 assert.equal(summary.data.custom[0].value,'Linux');
 const services=await api.fetchClientTab(session,92,'services');
 assert.equal(services.ok,true);
 assert.equal(services.data.records.length,2);
 assert.equal(requests.length,2,'No eager extra API calls');
 assert.equal(requests[0].action,'GetClientsDetails');
 assert.equal(requests[1].action,'GetClientsProducts');
 assert.equal(requests[1].params.clientid,92);
 const quotes=await api.fetchClientTab(session,92,'quotes');
 const transactions=await api.fetchClientTab(session,92,'transactions');
 assert.equal(quotes.data.records.length,1);
 assert.equal(transactions.data.records.length,1);
 assert.equal(requests[2].params.userid,92);
 assert.equal(requests[3].params.clientid,92);
 const bad=api.normalizeClientDetails({client:{id:93,email:'other@example.test'}},client);
 throw Error('Should have rejected cross-client profile: '+bad.id);
})().catch(e=>{
 if(e.message?.startsWith('WHMCS أرجع بيانات عميل مختلف')) {
  console.log('PASS: profile normalization, WHMCS data tabs and strict client ID isolation');
  process.exit(0);
 }
 console.error(e);process.exit(1);
});
