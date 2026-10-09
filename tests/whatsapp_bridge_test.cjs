const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs'),path=require('node:path');
const ts=require('../mobile/node_modules/typescript');
const js=ts.transpileModule(fs.readFileSync(path.join(__dirname,'../mobile/src/lib/whatsappBridge.ts'),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
const storage={},packets=[];
const token='a'.repeat(64);
const session={baseUrl:'https://whmcs.example',mode:'api',username:'',identifier:'test',secret:'secret'};
const fixture={
 pair:{token,adminName:'test-admin',expiresAt:'2099-01-01T00:00:00Z',scopes:['whatsapp.read','whatsapp.send']},
 'whatsapp.read':{chats:[{id:'12',name:'Customer One',phone:'201111222333',last:'Hello',time:'Today',unread:2,messages:[]}]},
 'whatsapp.get':{messages:[{id:'14',from:'customer',body:'Hello',at:'Today'}]},
 'whatsapp.send':{sent:true,message_id:'meta-32'},
 logout:{signedOut:true}
};
const context={exports:{},require(name){
 if(name==='expo-secure-store')return {getItemAsync:async k=>storage[k]||null,
  setItemAsync:async(k,v)=>storage[k]=v,deleteItemAsync:async k=>delete storage[k],WHEN_UNLOCKED_THIS_DEVICE_ONLY:'LOCKED'};
 if(name==='./api')return {validateBaseUrl:s=>s.replace(/\/$/,'')};
 throw Error('Unexpected import '+name);
},AbortController,clearTimeout,setTimeout,fetch:async(url,opts)=>{
 assert.equal(url,'https://whmcs.example/modules/addons/ontrack_mobile_admin/bridge.php');
 assert.equal(opts.method,'POST');const body=JSON.parse(opts.body);
 packets.push({headers:opts.headers,body});
 return {ok:true,status:200,text:async()=>JSON.stringify({ok:true,data:fixture[body.operation]})};
}};
vm.runInNewContext(js,context);
const wa=context.exports;
(async()=>{
 const bad=await wa.pairWhatsApp(session,'WRONG!');
 assert.equal(bad.ok,false);assert.equal(packets.length,0);
 const pair=await wa.pairWhatsApp(session,'123ABC987DEF');
 assert.equal(pair.ok,true);assert.equal(pair.data.adminName,'test-admin');
 const chats=await wa.getWhatsAppInbox(session);
 assert.equal(chats.ok,true);assert.equal(chats.data.length,1);assert.equal(chats.data[0].id,'12');
 const thread=await wa.getWhatsAppThread(session,'12');
 assert.equal(thread.ok,true);assert.equal(thread.data[0].from,'customer');
 const failed=await wa.sendWhatsAppText(session,'bad-id','hello');
 assert.equal(failed.ok,false);
 const sent=await wa.sendWhatsAppText(session,'12','Thanks');
 assert.equal(sent.ok,true);assert.equal(sent.data.messageId,'meta-32');
 assert.equal(packets.find(p=>p.body.operation==='whatsapp.send').headers.Authorization,'Bearer '+token);
 assert.equal((await wa.loadWaPair('https://different.example')),null,'Credential must be scoped to server');
 await wa.unpairWhatsApp(session);
 assert.equal((await wa.loadWaPair(session.baseUrl)),null);
 console.log('PASS: WHMCS WhatsApp admin pairing, scoped secure token, inbox, messages, one explicit send and disconnect');
})().catch(e=>{console.error(e);process.exit(1)});
