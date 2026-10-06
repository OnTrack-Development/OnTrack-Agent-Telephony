const $=(s,r=document)=>r.querySelector(s);

let dashboardData={
  metrics:{devices:0,paired_devices:0,contacts:0,calls_today:0,answered_today:0},
  devices:[],
  calls:[],
  campaigns:[],
  contacts:[],
  media:{status:'disconnected',audio_on_server:false,recording_enabled:false,label:'Phone audio only'}
};

async function api(url,opts={}){
  const response=await fetch(url,{
    headers:{'Content-Type':'application/json',...(opts.headers||{})},
    ...opts
  });
  const payload=await response.json();
  if(!response.ok) throw new Error(payload.error||'Request failed');
  return payload;
}

function esc(v=''){
  return String(v).replace(/[&<>"']/g,m=>({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'
  }[m]));
}

function badge(v){
  return `<span class="badge ${esc(v)}">${esc(v||'—')}</span>`;
}

function empty(t){
  return `<div class="empty">${esc(t)}</div>`;
}

function duration(seconds){
  if(seconds===null || seconds===undefined || seconds==='') return '—';
  const s=Math.max(0,Number(seconds)||0);
  const h=Math.floor(s/3600);
  const m=Math.floor((s%3600)/60);
  const sec=s%60;
  return h>0
    ? `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(sec).padStart(2,'0')}`
    : `${String(m).padStart(2,'0')}:${String(sec).padStart(2,'0')}`;
}

function identity(call){
  const name=(call.contact_name||'').trim();
  const number=call.phone_number||'—';
  return name
    ? `<div class="row-main"><strong>${esc(name)}</strong><span>${esc(number)}</span></div>`
    : `<div class="row-main"><strong>${esc(number)}</strong><span>Unknown contact</span></div>`;
}

function recording(call){
  if(call.recording_url){
    return `<audio class="call-audio" controls preload="none" src="${esc(call.recording_url)}"></audio>`;
  }
  return '<span class="muted">Not recorded — media bridge offline</span>';
}

function setHtml(selector,html){
  const el=$(selector);
  if(el) el.innerHTML=html;
}

async function load(){
  try{
    dashboardData=await api('api/admin/dashboard.php');
    render(dashboardData);
  }catch(error){
    console.error('Dashboard load failed:',error);
  }
}

function render(data){
  renderMetrics(data);
  renderDevices(data.devices||[]);
  renderCalls();
  renderContacts(data.contacts||[]);
  renderCampaigns(data);
  renderConference(data.devices||[]);
  renderMedia(data.media||{});
}

function renderMetrics(data){
  setHtml('#metrics',[
    ['Connected phones',data.metrics.devices],
    ['Synced contacts',data.metrics.contacts||0],
    ['Calls today',data.metrics.calls_today],
    ['Answered',data.metrics.answered_today]
  ].map(x=>`
    <div class="metric">
      <span>${x[0]}</span>
      <strong>${x[1]}</strong>
      <em>live data</em>
    </div>
  `).join(''));
}

function renderDevices(devices){
  setHtml('#overviewDevices',devices.length
    ? devices.slice(0,5).map(x=>`
      <div class="row">
        <div class="row-main">
          <strong>${esc(x.name)}</strong>
          <span>${esc(x.phone_number||'No phone yet')} · ${esc(x.model||'Android')}</span>
        </div>
        ${badge(x.status)}
      </div>
    `).join('')
    : empty('No paired Android phones.'));

  setHtml('#devicesTable',devices.length
    ? `<table class="table">
        <thead>
          <tr>
            <th>Device</th>
            <th>SIM number</th>
            <th>Model</th>
            <th>Last seen</th>
            <th>Status</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          ${devices.map(x=>`
            <tr>
              <td><b>${esc(x.name)}</b><div class="tiny">Device #${x.id}</div></td>
              <td>${esc(x.phone_number||'—')}</td>
              <td>${esc([x.manufacturer,x.model].filter(Boolean).join(' ')||'Android')}</td>
              <td>${esc(x.last_seen_at||'Never')}</td>
              <td>${badge(x.status)}</td>
              <td>
                <div class="row-actions">
                  <button class="mini-action" onclick="renameDevice(${x.id})">Rename</button>
                  <button class="mini-action danger" onclick="removeDevice(${x.id})">Remove</button>
                </div>
              </td>
            </tr>
          `).join('')}
        </tbody>
      </table>`
    : empty('Pair the first Android phone to start.'));
}

function filteredCalls(){
  const search=($('#callSearch')?.value||'').trim().toLowerCase();
  const direction=$('#callDirection')?.value||'';

  return (dashboardData.calls||[]).filter(call=>{
    const haystack=`${call.contact_name||''} ${call.phone_number||''}`.toLowerCase();
    if(search && !haystack.includes(search)) return false;
    if(direction && call.direction!==direction) return false;
    return true;
  });
}

function renderCalls(){
  const calls=filteredCalls();

  setHtml('#recentCalls',(dashboardData.calls||[]).length
    ? dashboardData.calls.slice(0,5).map(x=>`
      <div class="row">
        ${identity(x)}
        <div class="row-main" style="text-align:right">
          <strong>${duration(x.duration_seconds)}</strong>
          <span>${esc(x.direction)} · ${esc(x.created_at)}</span>
        </div>
      </div>
    `).join('')
    : empty('No calls yet.'));

  setHtml('#callsTable',calls.length
    ? `<table class="table">
        <thead>
          <tr>
            <th>Caller / Customer</th>
            <th>Direction</th>
            <th>Status</th>
            <th>Outcome</th>
            <th>Duration</th>
            <th>Server Media</th>
            <th>Recording</th>
            <th>Created</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          ${calls.map(x=>`
            <tr>
              <td>${identity(x)}</td>
              <td>${esc(x.direction)}</td>
              <td>${badge(x.status)}</td>
              <td>${esc(x.outcome||'—')}</td>
              <td><b>${duration(x.duration_seconds)}</b></td>
              <td><span class="media-chip off">NOT CONNECTED</span></td>
              <td>${recording(x)}</td>
              <td>${esc(x.created_at)}</td>
              <td><button class="mini-action danger" onclick="deleteCall(${x.id})">Delete</button></td>
            </tr>
          `).join('')}
        </tbody>
      </table>`
    : empty('No call history matches this filter.'));
}

function renderContacts(contacts){
  setHtml('#contactsTable',contacts.length
    ? `<table class="table">
        <thead><tr><th>Name</th><th>Phone number</th><th>Device</th><th>Last sync</th></tr></thead>
        <tbody>
          ${contacts.map(x=>`
            <tr>
              <td><b>${esc(x.contact_name)}</b></td>
              <td>${esc(x.phone_number)}</td>
              <td>${esc(x.device_name)}</td>
              <td>${esc(x.synced_at)}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>`
    : empty('No contacts synced from Android yet.'));
}

function renderCampaigns(data){
  const select=$('#campaignDevice');
  if(select){
    select.innerHTML=(data.devices||[]).length
      ? data.devices.map(x=>`
          <option value="${x.id}" ${x.status==='offline'?'disabled':''}>
            ${esc(x.name)} ${x.phone_number?'('+esc(x.phone_number)+')':''} ${x.status==='offline'?'[offline]':''}
          </option>
        `).join('')
      : '<option value="">No paired devices</option>';
  }

  setHtml('#campaignList',(data.campaigns||[]).length
    ? data.campaigns.map(x=>`
      <div class="row">
        <div class="row-main">
          <strong>${esc(x.name)}</strong>
          <span>${x.done_contacts}/${x.total_contacts} finished · ${esc(x.agent_name)}</span>
        </div>
        ${badge(x.status)}
      </div>
    `).join('')
    : empty('No campaigns created yet.'));
}

function renderConference(devices){
  const el=$('#conferenceDevices');
  if(!el) return;

  if(!devices.length){
    el.innerHTML=empty('No paired Android devices.');
    return;
  }

  el.innerHTML='<div class="conference-grid">'+devices.map(device=>{
    const status=device.conference_status||'unknown';
    const checked=device.conference_checked_at||'Never';
    const canAdd=device.conference_can_add_call===null || device.conference_can_add_call===undefined
      ? 'UNKNOWN'
      : (Number(device.conference_can_add_call)===1?'YES':'NO');
    const mergeReady=Number(device.conferenceable_count||0)>0 && Number(device.active_call_count||0)>=2;
    const label=status==='merge_ready'?'MERGE READY'
      : status==='add_call_ready'?'ADD CALL READY'
      : status==='unavailable'?'NOT AVAILABLE'
      : 'WAITING FOR LIVE TEST';
    const cls=status==='merge_ready'?'ready'
      : status==='add_call_ready'?'partial'
      : status==='unavailable'?'blocked'
      : 'unknown';

    return `
      <div class="conference-device">
        <div class="conference-device-head">
          <div>
            <strong>${esc(device.name)}</strong>
            <span>${esc(device.phone_number||'No SIM number')}</span>
          </div>
          <span class="conference-badge ${cls}">${label}</span>
        </div>
        <div class="conference-facts">
          <div><span>Add second call</span><b>${canAdd}</b></div>
          <div><span>Active calls</span><b>${Number(device.active_call_count||0)}</b></div>
          <div><span>Merge calls</span><b>${mergeReady?'YES':(status==='unknown'?'UNKNOWN':'NO')}</b></div>
          <div><span>Last check</span><b>${esc(checked)}</b></div>
        </div>
      </div>
    `;
  }).join('')+'</div>';
}

function renderMedia(media){
  const connected=media.status==='connected' && media.audio_on_server===true;

  const overview=$('#mediaOverview');
  if(overview){
    overview.innerHTML=connected
      ? `<div class="media-status-card connected"><b>Server Media Connected</b><span>Live call audio is reaching the server.</span></div>`
      : `<div class="media-status-card disconnected"><b>Server Media Disconnected</b><span>Audio is currently on the Android phone only. The website receives call events, not sound.</span></div>`;
  }

  const label=$('#mediaOverviewLabel');
  if(label) label.textContent=connected?'Audio on server':'Phone audio only';

  const status=$('#mediaStatus');
  if(status){
    status.textContent=connected?'CONNECTED':'DISCONNECTED';
    status.className='big-status '+(connected?'ok':'media-off');
  }

  const detail=$('#mediaStatusDetail');
  if(detail) detail.textContent=media.detail||'No live call audio is reaching this server.';

  const serverAudio=$('#serverAudioState');
  if(serverAudio){
    serverAudio.textContent=connected?'YES':'NO';
    serverAudio.className=connected?'state-ok':'state-off';
  }

  const recordingState=$('#recordingState');
  if(recordingState){
    recordingState.textContent=media.recording_enabled?'ON':'OFF';
    recordingState.className=media.recording_enabled?'state-ok':'state-off';
  }
}

window.renameDevice=async function(deviceId){
  const device=(dashboardData.devices||[]).find(x=>Number(x.id)===Number(deviceId));
  const name=prompt('New device name:',device?.name||'');
  if(name===null) return;
  if(!name.trim()) return alert('Device name cannot be empty.');

  try{
    await api('api/admin/device-manage.php',{
      method:'POST',
      body:JSON.stringify({action:'rename',device_id:deviceId,name:name.trim()})
    });
    await load();
  }catch(error){
    alert(error.message);
  }
};

window.removeDevice=async function(deviceId){
  const device=(dashboardData.devices||[]).find(x=>Number(x.id)===Number(deviceId));
  const label=device?.name||('Device #'+deviceId);
  if(!confirm(`Remove "${label}"?\n\nIts pairing token and synced contacts will be revoked. Existing call history will be preserved.`)) return;

  try{
    await api('api/admin/device-manage.php',{
      method:'POST',
      body:JSON.stringify({action:'remove',device_id:deviceId})
    });
    await load();
  }catch(error){
    alert(error.message);
  }
};

window.deleteCall=async function(callId){
  if(!confirm('Delete this call history entry?')) return;

  try{
    await api('api/admin/call-history-manage.php',{
      method:'POST',
      body:JSON.stringify({action:'delete_one',call_id:callId})
    });
    await load();
  }catch(error){
    alert(error.message);
  }
};

const search=$('#callSearch');
if(search) search.addEventListener('input',renderCalls);

const direction=$('#callDirection');
if(direction) direction.addEventListener('change',renderCalls);

const deleteNumber=$('#deleteNumberBtn');
if(deleteNumber){
  deleteNumber.addEventListener('click',async()=>{
    const phone=prompt('Phone number to remove from call history:');
    if(phone===null || !phone.trim()) return;
    if(!confirm(`Delete every history entry for ${phone.trim()}?`)) return;

    try{
      const result=await api('api/admin/call-history-manage.php',{
        method:'POST',
        body:JSON.stringify({action:'delete_number',phone_number:phone.trim()})
      });
      await load();
      alert(result.deleted+' call entries deleted.');
    }catch(error){
      alert(error.message);
    }
  });
}

const clearHistory=$('#clearHistoryBtn');
if(clearHistory){
  clearHistory.addEventListener('click',async()=>{
    if(!confirm('Clear ALL call history? This cannot be undone.')) return;
    if(!confirm('Confirm again: delete every call history entry?')) return;

    try{
      const result=await api('api/admin/call-history-manage.php',{
        method:'POST',
        body:JSON.stringify({action:'clear_all'})
      });
      await load();
      alert(result.deleted+' call entries deleted.');
    }catch(error){
      alert(error.message);
    }
  });
}

const campaignForm=$('#campaignForm');
if(campaignForm){
  campaignForm.addEventListener('submit',async event=>{
    event.preventDefault();

    const form=new FormData(event.target);
    const payload=Object.fromEntries(form.entries());
    payload.numbers=String(payload.numbers)
      .split(/\r?\n|,/)
      .map(x=>x.trim())
      .filter(Boolean);

    try{
      await api('api/admin/campaign-create.php',{
        method:'POST',
        body:JSON.stringify(payload)
      });
      event.target.reset();
      await load();
      alert('Campaign created and started.');
    }catch(error){
      alert(error.message);
    }
  });
}

async function loadSettings(){
  const input=$('#incomingMode');
  if(!input) return;

  try{
    const settings=await api('api/admin/settings.php');
    input.value=settings.incoming_mode;
  }catch(error){
    console.error('Settings load failed:',error);
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
    }catch(error){
      alert(error.message);
    }
  });
}

load();
loadSettings();
setInterval(load,8000);


async function loadAppRelease(){
  const el=$('#appRelease');
  if(!el) return;

  try{
    const release=await api('api/app/latest.php');
    const size=release.size_bytes
      ? (release.size_bytes/1024/1024).toFixed(2)+' MB'
      : '—';

    el.innerHTML=`
      <div class="app-release-grid">
        <div><span>Version</span><strong>v${esc(release.version_name)}</strong></div>
        <div><span>Version code</span><strong>${Number(release.version_code||0)}</strong></div>
        <div><span>Signing</span><strong class="state-ok">PERSISTENT</strong></div>
        <div><span>Size</span><strong>${size}</strong></div>
      </div>
      <div class="app-release-actions">
        <a class="primary" href="${esc(release.download_url)}">Download latest APK</a>
        <span>SHA-256: ${esc(release.sha256)}</span>
      </div>
    `;
  }catch(error){
    el.innerHTML=empty('No signed Android release has been published to this server yet.');
  }
}
loadAppRelease();
