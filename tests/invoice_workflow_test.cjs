const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const ts=require('../mobile/node_modules/typescript');
const source=fs.readFileSync(path.join(__dirname,'../mobile/src/lib/invoices.ts'),'utf8');
const code=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
const calls=[];
let currentInvoice=null,paymentResult=null;
const document={
 result:'success',invoiceid:27,userid:100,status:'Unpaid',date:'2026-10-01',duedate:'2026-10-30',
 paymentmethod:'banktransfer',balance:'17.00',notes:'old note',taxrate:'0',taxrate2:'0',credit:'0',
 items:{item:[{id:3,description:'Shared Hosting',amount:'15.00',taxed:1},
  {id:4,description:'Maintenance',amount:'2.00',taxed:0}]}
};
const context={exports:{},require(name){
 if(name==='./api')return {
  listOf:(d,c,k)=>{const raw=d?.[c]?.[k];return Array.isArray(raw)?raw:raw?[raw]:[]},
  callApi:async(_session,action,params)=>{
   calls.push({action,params});
   if(action==='GetInvoice')return {ok:true,data:currentInvoice||document};
   if(action==='AddInvoicePayment'&&paymentResult)return paymentResult;
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
 const paymentParams=api.buildReceivedPayment(27,document,new Date(2026,9,15,19,8,44));
 assert.equal(paymentParams.invoiceid,27);
 assert.equal(paymentParams.gateway,'banktransfer');
 assert.equal(paymentParams.date,'2026-10-15 19:08:44');
 assert.equal(paymentParams.transid,'ONTRACK-APP-MANUAL-27');
 assert.equal('amount' in paymentParams,false,'WHMCS uses the actual outstanding balance');
 assert.equal('noemail' in paymentParams,false,'WHMCS email and paid hooks must not be disabled');
 assert.throws(()=>api.buildReceivedPayment(27,{...document,invoiceid:28}),/هوية|فاتورة/);
 assert.throws(()=>api.buildReceivedPayment(27,{...document,userid:0}),/هوية|فاتورة/);
 assert.throws(()=>api.buildReceivedPayment(27,{...document,status:'Paid'}),/غير المدفوعة/);
 assert.throws(()=>api.buildReceivedPayment(27,{...document,status:'Cancelled'}),/غير المدفوعة/);
 assert.throws(()=>api.buildReceivedPayment(27,{...document,balance:'0.00'}),/رصيد موجب/);
 assert.throws(()=>api.buildReceivedPayment(27,{...document,balance:undefined}),/رصيد/);
 assert.throws(()=>api.buildReceivedPayment(27,{...document,paymentmethod:'invalid gateway'}),/طريقة الدفع/);
 assert.throws(()=>api.buildReceivedPayment(27,{...document,transactions:{transaction:[
  {transid:'ONTRACK-APP-MANUAL-27',amountin:'3.00'}]}}),/تسجيل دفع سابق/);
 const result=await api.executeInvoiceAction(session,'Paid',{id:27,status:'Unpaid'});
 assert.equal(result.ok,true);
 assert.equal(calls.at(-1).action,'AddInvoicePayment');
 assert.equal(calls.at(-1).params.gateway,'banktransfer');
 assert.equal(calls.at(-1).params.transid,'ONTRACK-APP-MANUAL-27');
 assert.ok(!calls.some(x=>x.action==='UpdateInvoice'&&x.params.status==='Paid'),
  'Changing invoice status must never substitute for invoice payment hooks');
 paymentResult={ok:false,code:'NETWORK_ERROR',error:'Lost connection'};
 const uncertain=await api.executeInvoiceAction(session,'Paid',{id:27,status:'Unpaid'});
 assert.equal(uncertain.ok,false);
 assert.equal(uncertain.code,'NETWORK_ERROR');
 paymentResult=null;
 currentInvoice={...document,status:'Paid',balance:'0.00'};
 const duplicate=await api.executeInvoiceAction(session,'Paid',{id:27,status:'Unpaid'});
 assert.equal(duplicate.ok,true);
 assert.equal(duplicate.data.unchanged,true);
 assert.equal(calls.at(-1).action,'GetInvoice');
 currentInvoice={...document,transactions:{transaction:[{transid:'ONTRACK-APP-MANUAL-27'}]}};
 const replay=await api.executeInvoiceAction(session,'Paid',{id:27,status:'Unpaid'});
 assert.equal(replay.ok,false);
 assert.match(replay.error,/تسجيل دفع سابق/);
 assert.equal(calls.at(-1).action,'GetInvoice');
 currentInvoice={...document,status:'Cancelled'};
 const cancelled=await api.executeInvoiceAction(session,'Paid',{id:27,status:'Unpaid'});
 assert.equal(cancelled.ok,false);
 assert.equal(calls.at(-1).action,'GetInvoice');
 currentInvoice=null;
 const copy=await api.executeInvoiceAction(session,'duplicate',{id:27,status:'Unpaid'});
 assert.equal(copy.ok,true);
 assert.equal(calls.at(-1).action,'CreateInvoice');
 const reminder=await api.executeInvoiceAction(session,'reminder',{id:27,status:'Unpaid'},template);
 assert.equal(reminder.ok,true);
 assert.equal(calls.at(-1).action,'SendEmail');
 assert.equal(calls.at(-1).params.id,27);
 assert.ok(!calls.some(x=>x.action==='DeleteInvoice'));
 console.log('PASS: authentic AddInvoicePayment hook path, manual receipt guard, no Paid status shortcut, invoice editors and reminders');
})().catch(e=>{console.error(e);process.exit(1)});
