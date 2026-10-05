const $=(s,r=document)=>r.querySelector(s);

async function api(url,opts={}){
  const r=await fetch(url,{headers:{'Content-Type':'application/json',...(opts.headers||{})},...opts});
  const j=await r.json();
  if(!r.ok) throw new Error(j.error||'Request failed');
  return j;
}

function esc(v=''){
  return String(v).replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[m]));
}
function badge(v){return `<span class="badge ${esc(v)}">${esc(v||'—')}</span>`;}
function empty(t){return `<div class="empty">${esc(t)}</div>`;}

async function load(){
  try{
    const d=await api('api/admin/dashboard.php');
    render(d);
  }catch(e){
    console.error('Dashboard load failed:',e);
  }
}

function setHtml(id,html){
  const el=$(id);
  if(el) el.innerHTML=html;
}

function render(d){
  setHtml('#metrics',[
    ['Connected phones',d.metrics.devices],
    ['Running campaigns',d.metrics.running_campaigns],
    ['Calls today',d.metrics.calls_today],
    ['Answered',d.metrics.answered_today]
  ].map(x=>`<div class="metric"><span>${x[0]}</span><strong>${x[1]}</strong><em>live POC data</em></div>`).join(''));

  setHtml('#overviewDevices',d.devices.length
    ? d.devices.slice(0,5).map(x=>`<div class="row"><div class="row-main"><strong>${esc(x.name)}</strong><span>${esc(x.phone_number||'No phone yet')} · ${esc(x.model||'Android')}</span></div>${badge(x.status)}</div>`).join('')
    : empty('No Android phones paired yet.'));

  setHtml('#recentCalls',d.calls.length
    ? d.calls.slice(0,5).map(x=>`<div class="row"><div class="row-main"><strong>${esc(x.phone_number)}</strong><span>${esc(x.direction)} · ${esc(x.created_at)}</span></div>${badge(x.outcome||x.status)}</div>`).join('')
    : empty('No calls yet.'));

  setHtml('#devicesTable',d.devices.length
    ? `<table class="table"><thead><tr><th>Device</th><th>SIM number</th><th>Model</th><th>Last seen</th><th>Status</th></tr></thead><tbody>${d.devices.map(x=>`<tr><td><b>${esc(x.name)}</b></td><td>${esc(x.phone_number||'—')}</td><td>${esc([x.manufacturer,x.model].filter(Boolean).join(' ')||'Android')}</td><td>${esc(x.last_seen_at||'—')}</td><td>${badge(x.status)}</td></tr>`).join('')}</tbody></table>`
    : empty('Pair the first Android phone to start.'));

  const deviceSelect=$('#campaignDevice');
  if(deviceSelect){
    deviceSelect.innerHTML=d.devices.length
      ? d.devices.map(x=>`<option value="${x.id}">${esc(x.name)} ${x.phone_number?'('+esc(x.phone_number)+')':''}</option>`).join('')
      : '<option value="">No paired devices</option>';
  }

  setHtml('#campaignList',d.campaigns.length
    ? d.campaigns.map(x=>`<div class="row"><div class="row-main"><strong>${esc(x.name)}</strong><span>${x.done_contacts}/${x.total_contacts} finished · ${esc(x.agent_name)}</span></div>${badge(x.status)}</div>`).join('')
    : empty('No campaigns created yet.'));

  setHtml('#callsTable',d.calls.length
    ? `<table class="table"><thead><tr><th>Number</th><th>Direction</th><th>Status</th><th>Outcome</th><th>Duration</th><th>Created</th></tr></thead><tbody>${d.calls.map(x=>`<tr><td><b>${esc(x.phone_number)}</b></td><td>${esc(x.direction)}</td><td>${badge(x.status)}</td><td>${esc(x.outcome||'—')}</td><td>${x.duration_seconds??'—'}</td><td>${esc(x.created_at)}</td></tr>`).join('')}</tbody></table>`
    : empty('Call records will appear here.'));
}

const campaignForm=$('#campaignForm');
if(campaignForm){
  campaignForm.addEventListener('submit',async e=>{
    e.preventDefault();
    const fd=new FormData(e.target);
    const payload=Object.fromEntries(fd.entries());
    payload.numbers=String(payload.numbers).split(/\r?\n|,/).map(x=>x.trim()).filter(Boolean);
    try{
      await api('api/admin/campaign-create.php',{method:'POST',body:JSON.stringify(payload)});
      e.target.reset();
      await load();
      alert('Campaign created and started.');
    }catch(err){
      alert(err.message);
    }
  });
}

async function loadSettings(){
  const input=$('#incomingMode');
  if(!input) return;
  try{
    const s=await api('api/admin/settings.php');
    input.value=s.incoming_mode;
  }catch(e){
    console.error('Settings load failed:',e);
  }
}

const saveIncoming=$('#saveIncoming');
if(saveIncoming){
  saveIncoming.addEventListener('click',async()=>{
    try{
      await api('api/admin/settings.php',{
        method:'POST',
        body:JSON.stringify({incoming_mode:$('#incomingMode').value})
      });
      alert('Incoming policy saved.');
    }catch(e){
      alert(e.message);
    }
  });
}

load();
loadSettings();
setInterval(load,8000);
