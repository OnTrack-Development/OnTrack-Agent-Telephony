const assert=require('node:assert/strict');
const {createHash}=require('node:crypto');
const vm=require('node:vm');
const fs=require('node:fs');
const ts=require('/opt/nvm/versions/node/v22.16.0/lib/node_modules/typescript');
const path=require('node:path');
let saved={};const packets=[];
const source=fs.readFileSync(path.join(__dirname,'../mobile/src/lib/api.ts'),'utf8');
const js=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText;
const context={exports:{},require:(name)=>{
  if(name==='expo-secure-store')return {setItemAsync:async(k,v)=>{saved[k]=v},getItemAsync:async(k)=>saved[k]||null,deleteItemAsync:async k=>delete saved[k],WHEN_UNLOCKED_THIS_DEVICE_ONLY:'LOCKED'};
  if(name==='js-md5')return {md5:s=>createHash('md5').update(s).digest('hex')};
  throw Error(`Unexpected import ${name}`);
 },URL,URLSearchParams,AbortController,Promise,setTimeout,clearTimeout,fetch:async(url,init)=>{
  assert.equal(url,'https://whmcs.example/includes/api.php');
  const body=new URLSearchParams(init.body);packets.push(body);
  const action=body.get('action');
  const fixture={GetClients:{result:'success',clients:{client:[{id:'2',firstname:'Demo',lastname:'Client',email:'test@example.test'}]}},GetTickets:{result:'success',tickets:{ticket:[]}},GetInvoices:{result:'success',invoices:{invoice:[]}},GetClientsProducts:{result:'success',products:{product:[]}},GetOrders:{result:'success',orders:{order:[]}},GetClientsDomains:{result:'success',domains:{domain:[]}},GetAdminDetails:{result:'success',adminid:1},AddTicketReply:{result:'success'}};
  return {ok:true,status:200,text:async()=>JSON.stringify(fixture[action]||{result:'error',message:'unknown'})};
 }};
vm.runInNewContext(js,context);const api=context.exports;
(async()=>{
 assert.equal(api.validateBaseUrl('https://whmcs.example/'),'https://whmcs.example');
 assert.throws(()=>api.validateBaseUrl('http://whmcs.example'));
 assert.throws(()=>api.validateBaseUrl('https://user:pass@whmcs.example/'));
 const session={baseUrl:'https://whmcs.example',mode:'api',username:'',password:'',accessKey:'',identifier:'identifier-a',secret:'secret-b'};
 const result=await api.connect(session);assert.equal(result.ok,true);
 assert.equal(packets[0].get('username'),'identifier-a');assert.equal(packets[0].get('password'),'secret-b');
 const overview=await api.loadOverview(session);assert.equal(overview.state.clients.length,1);assert.equal(overview.state.clients[0].name,'Demo Client');assert.equal(Object.keys(overview.errors).length,0);
 const ticket=await api.replyToTicket(session,123,'مرحبا');assert.equal(ticket.ok,true);assert.equal(packets.at(-1).get('ticketid'),'123');
 const admin={...session,mode:'admin',username:'staff',password:'correct password',accessKey:'key'};
 const auth=await api.connect(admin);assert.equal(auth.ok,true);
 assert.equal(packets.at(-1).get('password'),createHash('md5').update('correct password').digest('hex'));
 assert.equal(packets.at(-1).get('accesskey'),'key');
 await api.signOut();assert.equal(await api.loadSession(),null);
 console.log('PASS: 13 mock-API assertions: HTTPS enforcement, API credentials, dashboard normalization, ticket reply, legacy hash and secure logout');
})().catch(e=>{console.error(e);process.exit(1)});
