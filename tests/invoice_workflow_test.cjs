const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const ts=require('../mobile/node_modules/typescript');
const source=fs.readFileSync(path.join(__dirname,'../mobile/src/lib/invoices.ts'),'utf8');
const code=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
const calls=[];
const document={
 result:'success',invoiceid:27,userid:100,status:'Unpaid',date:'2026-10-01',duedate:'2026-10-30',
 paymentmethod:'banktransfer',notes:'old note',taxrate:'0',taxrate2:'0',credit:'0',
 items:{item:[{id:3,description:'Shared Hosting',amount:'15.00',taxed:1},
  {id:4,description:'Maintenance',amount:'2.00',taxed:0}]}
};
const context={exports:{},require(name){
 if(name==='./api')return {
  listOf:(d,c,k)=>{const raw=d?.[c]?.[k];return Array.isArray(raw)?raw:raw?[raw]:[]},
  callApi:async(_session,action,params)=>{
   calls.push({action,params});
   if(action==='GetInvoice')return {ok:true,data:document};
   if(action==='GetEmailTemplates')return {ok:true,data:{emailtemplates:{emailtemplate:[{name:'Invoice Payment Reminder'}]}}};
   return {ok:true,data:{result:'success'}};
  }
 };
 throw Error('Unexpected dependency '+name);
}};
vm.runInNewContext(code,context);
const api=context.exports;
const error=(f,pattern)=>assert.throws(f,pattern);
(async()=>{
 const session={baseUrl:'https://whmcs.example',mode:'api',identifier:'sample',secret:'x'};
 assert.equal(api.exactInvoice(document,27),true);
 assert.equal(api.exactInvoice({...document,invoiceid:28},27),false);
 assert.equal(api.exactInvoice({...document,userid:0},27),false);
 const original=api.readInvoiceLines(document);
 assert.equal(original.length,2);
 assert.equal(original[0].taxed,true);
 const draft=api.blankInvoiceDraft(document);
 const lines=original.map(x=>({...x}));
 lines[0].description='Shared Hosting Plus';
 lines[0].amount='17.00';
 lines[1].removed=true;
 lines.push({key:'new-1',id:null,description:'Optional setup',amount:'3.50',taxed:false,removed:false});
 const params=api.buildInvoiceUpdate(27,document,{...draft,notes:'new note',date:'2026-10-02'},lines);
 assert.equal(params.invoiceid,27);
 assert.equal(params.notes,'new note');
 assert.equal(params.date,'2026-10-02');
 assert.equal(params['itemdescription[3]'],'Shared Hosting Plus');
 assert.equal(params['itemamount[3]'],'17.00');
 assert.equal(params['itemtaxed[3]'],1);
 assert.equal(params['deletelineids[0]'],4);
 assert.equal(params['newitemdescription[0]'],'Optional setup');
 assert.equal(params['newitemamount[0]'],'3.50');
 error(()=>api.buildInvoiceUpdate(27,document,draft,original),/لم يتم تغيير/);
 error(()=>api.buildInvoiceUpdate(27,document,{...draft,duedate:'2026-02-30'},original),/تاريخ/);
 error(()=>api.buildInvoiceUpdate(27,document,{...draft,paymentmethod:'invalid wrong'},original),/طريقة الدفع/);
 error(()=>api.buildInvoiceUpdate(27,document,draft,original.slice(0,1)),/بنود الفاتورة غير مكتملة/);
 const dupe=api.buildDuplicateInvoice(document,27);
 assert.equal(dupe.userid,100);
 assert.equal(dupe.status,'Unpaid');
 assert.equal(dupe.sendinvoice,0);
 assert.equal(dupe['itemdescription[0]'],'Shared Hosting');
 assert.equal(dupe['itemamount[1]'],'2.00');
 assert.equal('credit' in dupe,false);
 const template=await api.invoiceReminderTemplate(session);
 assert.equal(template,'Invoice Payment Reminder');
 const result=await api.executeInvoiceAction(session,'Paid',{id:27,status:'Unpaid'});
 assert.equal(result.ok,true);
 assert.equal(calls.at(-1).action,'UpdateInvoice');
 assert.equal(calls.at(-1).params.status,'Paid');
 const copy=await api.executeInvoiceAction(session,'duplicate',{id:27,status:'Unpaid'});
 assert.equal(copy.ok,true);
 assert.equal(calls.at(-1).action,'CreateInvoice');
 const reminder=await api.executeInvoiceAction(session,'reminder',{id:27,status:'Unpaid'},template);
 assert.equal(reminder.ok,true);
 assert.equal(calls.at(-1).action,'SendEmail');
 assert.equal(calls.at(-1).params.id,27);
 assert.ok(!calls.some(x=>x.action==='DeleteInvoice'));
 console.log('PASS: invoice identity, form array params, dates, line update/add/delete, duplication, reminders and bulk statuses');
})().catch(e=>{console.error(e);process.exit(1)});
