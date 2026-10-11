const assert=require('node:assert/strict');
const vm=require('node:vm'),fs=require('node:fs'),path=require('node:path');
const ts=require('../mobile/node_modules/typescript');
const products={products:{product:[{id:52,clientid:92,username:'olduser',name:'Super',pid:6,serverid:8,
 domain:'example.test',regdate:'2026-04-01',nextduedate:'2026-11-12',billingcycle:'Annually',
 firstpaymentamount:'50.00',recurringamount:'50.00',status:'Active',notes:''}]}};
const orders={orders:{order:[{id:298,ordernum:'8278191479',userid:92,status:'Pending',
 lineitems:{lineitem:[{type:'product',relid:52,product:'Starter Plan',domain:'example.test',amount:'50.00',status:'Pending'}]}}]}};
const calls=[];
const api={
 callApi:async(_session,action,params)=>{
  calls.push({action,params});
  if(action==='GetClientsProducts')return {ok:true,data:products};
  if(action==='GetOrders')return {ok:true,data:orders};
  return {ok:true,data:{result:'success'}};
 },
 listOf:(d,k,l)=>{const v=d?.[k]?.[l];return Array.isArray(v)?v:v?[v]:[]}
};
function load(name){
 const source=fs.readFileSync(path.join(__dirname,'../mobile/src/lib/'+name+'.ts'),'utf8');
 const js=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
 const ctx={exports:{},require(module){if(module==='./api')return api;throw Error('Unknown dependency '+module)}};
 vm.runInNewContext(js,ctx);return ctx.exports;
}
const services=load('serviceManagement'),order=load('orderManagement');
(async()=>{
 const session={baseUrl:'https://whmcs.example'};
 const service=products.products.product[0];
 assert.equal(services.serviceOwner(service,52,92),true);
 assert.equal(services.serviceOwner(service,52,93),false);
 assert.equal(services.serviceOwner({...service,clientid:93},52,92),false);
 const draft=services.serviceDraft(service);
 assert.equal(draft.serviceusername,'olduser');
 const next={...draft,domain:'second.test',recurringamount:'70.00',notes:'manual adjustment'};
 const params=services.serviceUpdate(52,service,next,92);
 assert.equal(params.serviceid,52);
 assert.equal(params.recurringamount,'70.00');
 assert.equal(params.domain,'second.test');
 assert.equal(params.notes,'manual adjustment');
 assert.equal('servicepassword' in params,false);
 assert.throws(()=>services.serviceUpdate(52,service,draft,92),/لا توجد تغييرات/);
 assert.throws(()=>services.serviceUpdate(52,service,next,93),/ملكية/);
 assert.throws(()=>services.serviceUpdate(52,service,{...draft,nextduedate:'2026-02-30'},92),/التاريخ/);
 let result=await services.executeModuleAction(session,'ModuleSuspend',52,92);
 assert.equal(result.ok,true);
 assert.equal(calls.at(-1).action,'ModuleSuspend');
 result=await services.executeModuleAction(session,'ModuleTerminate',52,93);
 assert.equal(result.ok,false);
 assert.equal(calls.at(-1).action,'GetClientsProducts');
 const ord=orders.orders.order[0];
 assert.equal(order.orderTitle(ord),'طلب #8278191479 • ID 298');
 assert.equal(order.orderLines(ord)[0].product,'Starter Plan');
 assert.equal(order.checkOrderRecord(ord,298,92),true);
 assert.equal(order.checkOrderRecord(ord,298,91),false);
 result=await order.runOrderAction(session,'AcceptOrder',298,92,{autosetup:false,sendemail:false,sendregistrar:false});
 assert.equal(result.ok,true);
 assert.equal(calls.at(-1).action,'AcceptOrder');
 assert.equal(calls.at(-1).params.autosetup,0);
 result=await order.runOrderAction(session,'FraudOrder',298,92);
 assert.equal(result.ok,true);assert.equal(calls.at(-1).action,'FraudOrder');
 result=await order.runOrderAction(session,'AcceptOrder',298,93);
 assert.equal(result.ok,false);assert.equal(calls.at(-1).action,'GetOrders');
 result=await order.runOrderAction(session,'DeleteOrder',298,92);
 assert.equal(result.ok,false);
 assert.ok(!calls.some(c=>c.action==='DeleteOrder'));
 console.log('PASS: service edit validation/ownership/modules, order lineitems/external number/status controls');
})().catch(e=>{console.error(e);process.exit(1)});
