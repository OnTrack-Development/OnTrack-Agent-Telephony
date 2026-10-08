const $=(s,r=document)=>r.querySelector(s);

let dashboardData={
  metrics:{devices:0,paired_devices:0,contacts:0,calls_today:0,answered_today:0},
  devices:[],
  calls:[],
  campaigns:[],
  contacts:[],
  media:{status:'disconnected',audio_on_server:false,recording_enabled:false,label:'Direct SIM audio ready'}
};

async function api(url,opts={}){
  const response=await fetch(url,{
    headers:{'Content-Type':'application/json',...(opts.headers||{})},
    ...opts
  });

  const raw=await response.text();
  let payload;

  try{
    payload=JSON.parse(raw);
  }catch(error){
    throw new Error(
      response.status===401
        ? 'Admin session expired. Please sign in again.'
        : 'Server returned an invalid response. Refresh the page and try again.'
    );
  }

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
    return `<audio class="call-audio" controls preload="metadata" src="${esc(call.recording_url)}"></audio>`;
  }

  if(call.recording_status==='recording'){
    return '<span class="recording-live">● RECORDING</span>';
  }

  if(call.media_status==='failed'){
    return `<span class="muted">No recording — ${esc(call.media_error||'platform audio session failed')}</span>`;
  }

  if(['requested','waiting_for_add_call','bridge_leg_dialing','bridge_leg_answered','dtmf_sent','merge_waiting','merge_requested','merge_confirmed','gateway_connected'].includes(call.media_status)){
    return '<span class="muted">Waiting for platform audio session…</span>';
  }

  return '<span class="muted">Not recorded</span>';
}

function mediaChip(call){
  const state=call.media_status||'not_connected';

  if(state==='connected' || state==='recording'){
    return '<span class="media-chip on">CONNECTED</span>';
  }

  if(state==='merge_requested'){
    return '<span class="media-chip pending">MERGING</span>';
  }

  if(state==='merge_confirmed'){
    return '<span class="media-chip pending">PLATFORM SESSION PENDING</span>';
  }

  if(state==='gateway_connected'){
    return '<span class="media-chip pending">PLATFORM CONNECTED</span>';
  }

  if(['requested','waiting_for_add_call','bridge_leg_dialing','bridge_leg_answered','dtmf_sent','merge_waiting'].includes(state)){
    return `<span class="media-chip pending">${esc(state.replaceAll('_',' ').toUpperCase())}</span>`;
  }

  if(state==='failed' || state==='add_call_unavailable' || state==='merge_unavailable'){
    return '<span class="media-chip off">FAILED</span>';
  }

  return '<span class="media-chip off">NOT CONNECTED</span>';
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
  renderPlatformAssignments(data.devices||[]);
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
            <th>AI Media</th>
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
              <td>${mediaChip(x)}${x.media_error?`<div class="tiny">${esc(x.media_error)}</div>`:''}</td>
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

function renderPlatformAssignments(devices){
  const el=$('#platformAssignments');
  if(!el) return;

  if(!devices.length){
    el.innerHTML=empty('No paired Android devices.');
    return;
  }

  el.innerHTML='<div class="conference-grid">'+devices.map(device=>{
    const tenant=device.tenant_name||'Default Workspace';
    const agent=device.voice_agent_name||'Default Voice Agent';
    const agentActive=Number(device.voice_agent_active??1)===1;
    const online=device.status==='online';

    return `
      <div class="conference-device">
        <div class="conference-device-head">
          <div>
            <strong>${esc(device.name)}</strong>
            <span>${esc(device.phone_number||'No SIM number')}</span>
          </div>
          <span class="conference-badge ${online?'ready':'unknown'}">${online?'ONLINE':'OFFLINE'}</span>
        </div>
        <div class="conference-facts">
          <div><span>Tenant</span><b>${esc(tenant)}</b></div>
          <div><span>Voice Agent</span><b>${esc(agent)}</b></div>
          <div><span>Agent state</span><b>${agentActive?'ACTIVE':'DISABLED'}</b></div>
          <div><span>App version</span><b>${esc(device.app_version||'—')}</b></div>
        </div>
      </div>
    `;
  }).join('')+'</div>';
}


function renderMedia(media){
  const live=media.status==='connected' && media.audio_on_server===true;
  const validated=media.phone_audio_validated!==false;

  const overview=$('#mediaOverview');
  if(overview){
    overview.innerHTML=live
      ? `<div class="media-status-card connected"><b>Platform Voice Session Live</b><span>Phone audio is flowing through the OnTrack platform to the assigned Voice Agent.</span></div>`
      : `<div class="media-status-card ready"><b>Direct SIM Audio Path Validated</b><span>Digital RX/TX is proven on the current test handset. Production platform streaming is not active on this call yet.</span></div>`;
  }

  const label=$('#mediaOverviewLabel');
  if(label) label.textContent=live
    ? 'Voice Agent session live'
    : 'Direct SIM audio validated';

  const status=$('#mediaStatus');
  if(status){
    status.textContent=live?'LIVE':'POC VALIDATED';
    status.className='big-status '+(live?'ok':'pending');
  }

  const detail=$('#mediaStatusDetail');
  if(detail) detail.textContent=live
    ? 'The current call audio is attached to an OnTrack platform Voice Agent session.'
    : 'Digital SIM receive and return-audio injection are validated. The remaining step is production phone ↔ platform media streaming.';

  const serverAudio=$('#serverAudioState');
  if(serverAudio){
    serverAudio.textContent=live?'ACTIVE':'NOT ACTIVE';
    serverAudio.className=live?'state-ok':'state-off';
  }

  const recordingState=$('#recordingState');
  if(recordingState){
    recordingState.textContent=media.recording_enabled?'REC':'OFF';
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

async function loadMediaSettings(){
  const enabled=$('#mediaBridgeEnabled');
  if(!enabled) return;

  try{
    const settings=await api('api/admin/media-settings.php');

    enabled.value=settings.enabled?'1':'0';
    $('#mediaBridgeNumber').value=settings.bridge_number||'';
    $('#mediaAutoMerge').value=settings.auto_merge?'1':'0';
    $('#mediaGatewaySecret').value=settings.callback_secret||settings.gateway_secret||'';
    $('#mediaGatewayEventUrl').value=settings.bridge_event_url||settings.gateway_event_url||'';
    $('#mediaGatewayUploadUrl').value=settings.recording_upload_url||settings.gateway_upload_url||'';
  }catch(error){
    console.error('Media settings load failed:',error);
  }
}

const saveMediaBridge=$('#saveMediaBridge');
if(saveMediaBridge){
  saveMediaBridge.addEventListener('click',async()=>{
    try{
      const payload={
        enabled:$('#mediaBridgeEnabled').value==='1',
        bridge_number:$('#mediaBridgeNumber').value.trim(),
        auto_merge:$('#mediaAutoMerge').value==='1'
      };

      await api('api/admin/media-settings.php',{
        method:'POST',
        body:JSON.stringify(payload)
      });

      alert('Media bridge settings saved.');
      await loadMediaSettings();
      await load();
    }catch(error){
      alert(error.message);
    }
  });
}

const toggleMediaSecret=$('#toggleMediaSecret');
if(toggleMediaSecret){
  toggleMediaSecret.addEventListener('click',()=>{
    const input=$('#mediaGatewaySecret');
    const showing=input.type==='text';
    input.type=showing?'password':'text';
    toggleMediaSecret.textContent=showing?'Show':'Hide';
  });
}

const copyMediaSecret=$('#copyMediaSecret');
if(copyMediaSecret){
  copyMediaSecret.addEventListener('click',async()=>{
    const value=$('#mediaGatewaySecret').value||'';
    if(!value) return;

    try{
      await navigator.clipboard.writeText(value);
      copyMediaSecret.textContent='Copied';
      setTimeout(()=>copyMediaSecret.textContent='Copy',1200);
    }catch(error){
      alert('Could not copy the secret automatically.');
    }
  });
}

async function loadAiPlatformSettings(){
  const status=$('#geminiStatus');
  if(!status) return;

  try{
    const settings=await api('api/admin/ai-settings.php');
    const agent=settings.agent||{};

    status.value=settings.gemini_configured
      ? 'CONFIGURED '+(settings.gemini_key_hint||'')
      : 'NOT CONFIGURED';

    $('#defaultAgentName').value=agent.name||'';
    $('#defaultAgentVoice').value=agent.voice_name||'Puck';
    $('#defaultAgentModel').value=agent.model||'gemini-3.8-live';
    $('#defaultAgentPrompt').value=agent.system_prompt||'';
  }catch(error){
    status.value='ERROR';
    console.error('AI platform settings load failed:',error);
  }
}

const saveAiPlatform=$('#saveAiPlatform');
if(saveAiPlatform){
  saveAiPlatform.addEventListener('click',async()=>{
    try{
      const payload={
        agent_name:$('#defaultAgentName').value.trim(),
        voice_name:$('#defaultAgentVoice').value.trim(),
        model:$('#defaultAgentModel').value.trim(),
        system_prompt:$('#defaultAgentPrompt').value.trim()
      };

      const key=$('#geminiApiKey').value.trim();
      if(key) payload.gemini_api_key=key;

      await api('api/admin/ai-settings.php',{
        method:'POST',
        body:JSON.stringify(payload)
      });

      $('#geminiApiKey').value='';
      await loadAiPlatformSettings();
      alert('AI platform and default Voice Agent saved.');
    }catch(error){
      alert(error.message);
    }
  });
}

load();
loadSettings();
loadMediaSettings();
loadAiPlatformSettings();
setInterval(load,8000);


function appReleaseMarkup(release){
  const size=release.size_bytes
    ? (release.size_bytes/1024/1024).toFixed(2)+' MB'
    : '—';

  return `
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
}

async function loadAppRelease(){
  const targets=['#appRelease','#updatesAppRelease']
    .map(selector=>$(selector))
    .filter(Boolean);

  if(!targets.length) return;

  try{
    const release=await api('api/app/latest.php');
    const html=appReleaseMarkup(release);
    targets.forEach(el=>el.innerHTML=html);
  }catch(error){
    targets.forEach(el=>{
      el.innerHTML=empty('No signed Android release has been published to this server yet.');
    });
  }
}

function renderWebsiteUpdateStatus(status){
  const el=$('#websiteUpdateStatus');
  if(!el) return;

  const latest=status?.latest||{};
  const deployed=status?.deployed||{};
  const available=status?.update_available===true;

  const latestSha=latest.short_sha||(
    latest.sha ? String(latest.sha).slice(0,12) : 'Unavailable'
  );

  const deployedSha=deployed.short_sha||(
    deployed.sha ? String(deployed.sha).slice(0,12) : 'Not recorded yet'
  );

  el.innerHTML=`
    <div class="update-status-grid">
      <div>
        <span>Deployed</span>
        <strong>${esc(deployedSha)}</strong>
      </div>
      <div>
        <span>GitHub main</span>
        <strong>${esc(latestSha)}</strong>
      </div>
      <div>
        <span>Status</span>
        <strong class="${available?'state-off':'state-ok'}">
          ${available?'UPDATE AVAILABLE':'UP TO DATE'}
        </strong>
      </div>
    </div>
    <div class="update-commit-message">
      ${esc(latest.message||'Latest GitHub commit status')}
    </div>
  `;

  const button=$('#runWebsiteUpdate');
  if(button){
    button.textContent=available
      ? 'Update website from GitHub'
      : 'Reinstall latest website version';
  }
}

async function loadWebsiteUpdateStatus(){
  if(!$('#websiteUpdateStatus')) return;

  try{
    const result=await api('api/admin/system-update.php');
    renderWebsiteUpdateStatus(result.status);
  }catch(error){
    setHtml(
      '#websiteUpdateStatus',
      `<div class="update-error">${esc(error.message)}</div>`
    );
  }
}

const runWebsiteUpdate=$('#runWebsiteUpdate');
if(runWebsiteUpdate){
  runWebsiteUpdate.addEventListener('click',async()=>{
    if(!confirm(
      'Update the website from GitHub main?\n\nLocal config and the SQLite database will be preserved.'
    )) return;

    runWebsiteUpdate.disabled=true;
    runWebsiteUpdate.textContent='Updating website…';

    try{
      const result=await api('api/admin/system-update.php',{
        method:'POST',
        body:JSON.stringify({action:'update'})
      });

      runWebsiteUpdate.textContent=
        'Updated '+Number(result.files||0)+' files — reloading…';

      setTimeout(()=>{
        window.location.href='?view=updates&updated=1';
      },700);
    }catch(error){
      runWebsiteUpdate.disabled=false;
      runWebsiteUpdate.textContent='Update website from GitHub';
      alert(error.message);
    }
  });
}

loadAppRelease();
loadWebsiteUpdateStatus();


function setMobileNav(open){
  document.body.classList.toggle('mobile-nav-open',open);

  const button=$('#mobileMenuToggle');
  if(button){
    button.setAttribute('aria-expanded',open?'true':'false');
    button.textContent=open?'×':'☰';
  }
}

const mobileMenuToggle=$('#mobileMenuToggle');
if(mobileMenuToggle){
  mobileMenuToggle.addEventListener('click',()=>{
    setMobileNav(!document.body.classList.contains('mobile-nav-open'));
  });
}

const mobileNavOverlay=$('#mobileNavOverlay');
if(mobileNavOverlay){
  mobileNavOverlay.addEventListener('click',()=>setMobileNav(false));
}

document.querySelectorAll('.sidebar .nav').forEach(link=>{
  link.addEventListener('click',()=>setMobileNav(false));
});

document.addEventListener('keydown',event=>{
  if(event.key==='Escape') setMobileNav(false);
});

window.addEventListener('resize',()=>{
  if(window.innerWidth>900) setMobileNav(false);
});
