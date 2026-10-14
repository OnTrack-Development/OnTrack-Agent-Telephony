const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const ts=require('../mobile/node_modules/typescript');
const source=fs.readFileSync(path.join(__dirname,'../mobile/src/lib/invoicePreview.ts'),'utf8');
const js=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
let response={ok:true,data:{invoiceid:457,userid:22,items:{item:[
 {id:1,description:'Starter &amp; Secure <b>Hosting</b>',amount:'50.00'},
 {id:2,description:'Domain Renewal',amount:'12.00'}]}}};
let calls=0;
const ctx={exports:{},require(name){
 if(name==='./api')return {callApi:async(_,action,params)=>{calls++;assert.equal(action,'GetInvoice');assert.equal(params.invoiceid,457);return response;}};
 if(name==='./invoices')return {exactInvoice:(r,id)=>Number(r.invoiceid||r.id)===id&&Number(r.userid)>0,
  readInvoiceLines:r=>(r.items?.item||[]).map(x=>({description:x.description,removed:false}))};
 throw Error('Unrecognized dependency '+name);
}};
vm.runInNewContext(js,ctx);
const {parseInvoiceCardPreview,loadInvoiceCardPreview}=ctx.exports;
const target={id:457,clientId:22};
const raw=parseInvoiceCardPreview(response.data,target);
assert.equal(raw.kind,'ready');
assert.equal(raw.label,'Starter & Secure Hosting');
assert.equal(raw.otherCount,1);
assert.equal(parseInvoiceCardPreview({...response.data,invoiceid:458},target).kind,'error');
assert.equal(parseInvoiceCardPreview({...response.data,userid:23},target).kind,'error');
assert.equal(parseInvoiceCardPreview({invoiceid:457,userid:22,items:{item:[]}},target).kind,'empty');
(async()=>{
 const ok=await loadInvoiceCardPreview({},target);assert.equal(ok.preview.kind,'ready');assert.equal(calls,1);
 response={ok:false,code:'HTTP_429',error:'rate limited'};
 const blocked=await loadInvoiceCardPreview({},target);assert.equal(blocked.rateLimited,true);assert.equal(blocked.preview.kind,'error');
 console.log('PASS: invoice line descriptions, extra-count, owner mismatch rejection and 429 handling');
})().catch(e=>{console.error(e);process.exit(1)});
