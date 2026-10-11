const assert=require('node:assert/strict');
const vm=require('node:vm'),fs=require('node:fs'),path=require('node:path');
const ts=require('../mobile/node_modules/typescript');
let calls=[],invoices=[];
const api={
 callApi:async(_session,action,params)=>{
  calls.push({action,params});
  if(action==='GetStats')return {ok:true,data:{
   income_today:'$0.00 USD',income_thismonth:'$8.00 USD',
   income_thisyear:'$6920.98 USD',income_alltime:'$15853.72 USD'
  }};
  if(action==='GetInvoices')return {ok:true,data:{totalresults:invoices.length,
   invoices:{invoice:invoices}}};
  throw Error('Unexpected WHMCS API '+action);
 },
 listOf:(obj,root,item)=>{
  const value=obj?.[root]?.[item];
  return Array.isArray(value)?value:value?[value]:[];
 }
};
const code=fs.readFileSync(path.join(__dirname,'../mobile/src/lib/financial.ts'),'utf8');
const js=ts.transpileModule(code,{compilerOptions:{module:ts.ModuleKind.CommonJS,
 target:ts.ScriptTarget.ES2022}}).outputText;
const context={exports:{},require(n){if(n==='./api')return api;throw Error(n)}};
vm.runInNewContext(js,context);
const {normalizeStats,unpaidInvoiceTotal,loadFinancialSummary}=context.exports;
(async()=>{
 const session={baseUrl:'https://whmcs.example'};
 invoices=[
  {id:1,total:'100.00',status:'Unpaid',currencycode:'USD',currencyprefix:'$',currencysuffix:' USD'},
  {id:2,total:'150.00',status:'Unpaid',currencycode:'EGP',currencyprefix:'',currencysuffix:' EGP'},
  {id:3,total:'30.50',status:'Unpaid',currencycode:'USD',currencyprefix:'$',currencysuffix:' USD'}
 ];
 let summary=await loadFinancialSummary(session);
 assert.equal(summary.today,'$0.00 USD');
 assert.equal(summary.month,'$8.00 USD');
 assert.equal(summary.year,'$6920.98 USD');
 assert.equal(summary.allTime,'$15853.72 USD');
 assert.equal(summary.unpaid,'$130.50 USD • 150.00 EGP');
 assert.equal(summary.unpaidCount,3);
 assert.equal(summary.unpaidAvailable,true);
 assert.deepEqual(calls.map(c=>c.action),['GetStats','GetInvoices']);
 assert.equal(calls[1].params.status,'Unpaid');
 assert.throws(()=>unpaidInvoiceTotal({totalresults:3,invoices:{invoice:invoices.slice(0,1)}}),/غير كاملة/);
 assert.throws(()=>unpaidInvoiceTotal({totalresults:1,invoices:{invoice:[{
  total:'5.00',status:'Unpaid',currencycode:''}]}}),/عملة/);
 assert.throws(()=>normalizeStats({income_today:0}),/دخل صحيحة/);
 const app=fs.readFileSync(path.join(__dirname,'../mobile/App.tsx'),'utf8');
 const home=fs.readFileSync(path.join(__dirname,'../mobile/src/screens/Home.tsx'),'utf8');
 const lock=fs.readFileSync(path.join(__dirname,'../mobile/src/components/AppLock.tsx'),'utf8');
 assert.ok(app.includes('moneyVisible,setMoneyVisible]=useState(false)'));
 assert.ok(app.includes('if(session&&!demo&&!unlocked)return <AppLock'));
 assert.ok(app.includes("if(state==='background')"));
 assert.ok(home.includes("!moneyVisible?'••••••'"));
 assert.ok(home.includes('onToggleMoney'));
 assert.ok(lock.includes('expo-local-authentication'));
 assert.ok(lock.includes('expo-secure-store'));
 assert.ok(lock.includes('expo-crypto'));
 assert.ok(lock.includes('phase==='));
 assert.ok(!lock.includes('console.log'));
 assert.ok(!app.includes('setMoneyVisible(true);return;'));
 console.log('PASS: GetStats billing periods, segregated unpaid currencies, incomplete invoice fail-closed, hidden money by default, PIN+biometric lock');
})().catch(e=>{console.error(e);process.exitCode=1});
