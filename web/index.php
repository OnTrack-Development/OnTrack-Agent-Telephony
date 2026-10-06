<?php
require __DIR__ . '/app/bootstrap.php';
if (empty($_SESSION['admin_ok'])) { header('Location: login.php'); exit; }

$allowedViews = ['overview','devices','contacts','campaigns','calls','architecture','updates'];
$view = (string)($_GET['view'] ?? 'overview');
if (!in_array($view, $allowedViews, true)) $view = 'overview';

$titles = [
    'overview' => ['Overview', 'Android-to-AI telephony control plane'],
    'devices' => ['Phone Devices', 'Registered Android telephony bridges'],
    'contacts' => ['Contacts', 'Synced contact names and phone numbers from paired devices'],
    'campaigns' => ['Campaigns', 'Sequential outbound AI calling jobs'],
    'calls' => ['Call History', 'Caller identity, duration and recording history'],
    'architecture' => ['Bridge Status', 'Telephony bridge and incoming-call policy'],
    'updates' => ['Updates', 'Website and Android release management'],
];

[$pageTitle, $pageSubtitle] = $titles[$view];
$active = static fn(string $name): string => $view === $name ? ' active' : '';
?><!doctype html>
<html lang="en" dir="ltr">
<head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title><?=htmlspecialchars($pageTitle)?> · OnTrack AI Telephony</title>
<link rel="icon" type="image/svg+xml" href="assets/ontrack-icon.svg">
<link rel="stylesheet" href="assets/app.css?v=20261006-8">
</head>
<body>
<div class="shell">
  <aside class="sidebar">
    <div class="brand"><div class="brand-mark">OT</div><div><strong>OnTrack</strong><span>AI Telephony</span></div></div>
    <nav>
      <a class="nav<?=$active('overview')?>" href="?view=overview">Overview</a>
      <a class="nav<?=$active('devices')?>" href="?view=devices">Phone Devices</a>
      <a class="nav<?=$active('contacts')?>" href="?view=contacts">Contacts</a>
      <a class="nav<?=$active('campaigns')?>" href="?view=campaigns">Campaigns</a>
      <a class="nav<?=$active('calls')?>" href="?view=calls">Call History</a>
      <a class="nav<?=$active('architecture')?>" href="?view=architecture">Bridge Status</a>
      <a class="nav<?=$active('updates')?>" href="?view=updates">Updates</a>
    </nav>
    <div class="sidebar-footer"><span class="dot"></span> POC Server Online<br><a href="logout.php">Sign out</a></div>
  </aside>
  <button class="mobile-nav-overlay" id="mobileNavOverlay" aria-label="Close menu"></button>

  <main class="main">
    <header class="topbar">
      <div class="topbar-title">
        <button class="mobile-menu-toggle" id="mobileMenuToggle" type="button" aria-label="Open navigation" aria-expanded="false">☰</button>
        <div>
          <h1><?=htmlspecialchars($pageTitle)?></h1>
          <p><?=htmlspecialchars($pageSubtitle)?></p>
        </div>
      </div>
      <a class="primary pair-phone-button" href="pair.php">+ Pair Android Phone</a>
    </header>

    <section class="view<?=$active('overview')?>">
      <div class="metrics" id="metrics"></div>
      <div class="grid two">
        <article class="card"><div class="card-head"><h2>Live Devices</h2><span>Heartbeat-based status</span></div><div id="overviewDevices" class="list"></div></article>
        <article class="card"><div class="card-head"><h2>Recent Calls</h2><span>Name + number + duration</span></div><div id="recentCalls" class="list"></div></article>
      </div>
      <article class="card flow-card">
        <div class="card-head"><h2>Current Telephony Flow</h2><span id="mediaOverviewLabel">Checking media path…</span></div>
        <div class="flow"><b>OnTrack Cloud</b><i>→</i><b>Android Bridge</b><i>→</i><b>SIM / Carrier</b><i>→</i><b>Customer</b></div>
        <div id="mediaOverview" class="media-strip"></div>
      </article>
    </section>

    <section class="view<?=$active('devices')?>">
      <article class="card">
        <div class="card-head"><h2>Registered Phones</h2><span>Rename or remove paired endpoints at any time</span></div>
        <div id="devicesTable"></div>
      </article>
    </section>

    <section class="view<?=$active('contacts')?>">
      <article class="card">
        <div class="card-head"><h2>Synced Contacts</h2><span>Name and phone number only</span></div>
        <div id="contactsTable"></div>
      </article>
    </section>

    <section class="view<?=$active('campaigns')?>">
      <div class="grid campaign-layout">
        <article class="card">
          <div class="card-head"><h2>New Voice Campaign</h2><span>Sequential calling for the POC</span></div>
          <form id="campaignForm" class="form-grid">
            <label>Campaign name<input name="name" required placeholder="October invoice reminder"></label>
            <label>Voice agent<input name="agent_name" required value="OnTrack Voice Agent"></label>
            <label>Android phone<select name="device_id" id="campaignDevice" required></select></label>
            <label class="full">Scenario<textarea name="scenario" rows="5" required placeholder="Explain the task and what the agent should do..."></textarea></label>
            <label class="full">Phone numbers<textarea name="numbers" rows="7" required placeholder="01012345678&#10;01112345678&#10;01212345678"></textarea></label>
            <button class="primary full" type="submit">Create & Start Campaign</button>
          </form>
        </article>

        <article class="card">
          <div class="card-head"><h2>Campaign Queue</h2><span>Progress and state</span></div>
          <div id="campaignList" class="list"></div>
        </article>
      </div>
    </section>

    <section class="view<?=$active('calls')?>">
      <article class="card">
        <div class="card-head">
          <h2>Call History</h2>
          <span>Duration is answer → hangup. Server recording starts only after Media Bridge is connected.</span>
        </div>
        <div class="history-toolbar">
          <input id="callSearch" placeholder="Search name or number">
          <select id="callDirection">
            <option value="">All directions</option>
            <option value="inbound">Inbound</option>
            <option value="outbound">Outbound</option>
          </select>
          <button class="secondary-action" id="deleteNumberBtn">Delete by number</button>
          <button class="danger-action" id="clearHistoryBtn">Clear all history</button>
        </div>
        <div id="callsTable"></div>
      </article>
    </section>

    <section class="view<?=$active('architecture')?>">
      <div class="grid two">
        <article class="card status-card">
          <h2>Android Bridge API</h2>
          <div class="big-status ok">READY</div>
          <p>Pairing, contacts, heartbeat, incoming-call instructions, job polling and result reporting are active.</p>
        </article>
        <article class="card status-card">
          <h2>Server Media Path</h2>
          <div class="big-status media-off" id="mediaStatus">DISCONNECTED</div>
          <p id="mediaStatusDetail">The phone is carrying the audio locally. This server currently receives call events only.</p>
        </article>
      </div>

      <article class="card" style="margin-top:14px">
        <div class="card-head"><h2>Media & Recording State</h2><span>Never infer audio from call events</span></div>
        <div class="media-state-grid">
          <div><span>Android call audio</span><strong class="state-ok">LOCAL / ACTIVE WHEN CALLING</strong></div>
          <div><span>Live audio on server</span><strong id="serverAudioState" class="state-off">NO</strong></div>
          <div><span>Server recording</span><strong id="recordingState" class="state-off">OFF</strong></div>
          <div><span>Recording storage</span><strong>Prepared; activates with media bridge</strong></div>
        </div>
      </article>
      <article class="card" style="margin-top:14px">
        <div class="card-head"><h2>Android App Distribution</h2><span>Persistently signed release channel</span></div>
        <div id="appRelease" class="app-release-panel">
          <div class="empty">Loading Android release information…</div>
        </div>
      </article>
      <article class="card" style="margin-top:14px">
        <div class="card-head"><h2>Carrier Conference Capability</h2><span>Measured live from each Android InCallService</span></div>
        <div id="conferenceDevices"></div>
        <div class="conference-note">
          During a real call, the app reports whether Android/your carrier allows a second call. After a second call exists, it also checks whether Telecom exposes the calls as mergeable.
        </div>
      </article>
      <article class="card" style="margin-top:14px">
        <div class="card-head"><h2>Incoming Call Policy</h2><span>Server instruction returned to the Android bridge</span></div>
        <div class="form-grid">
          <label>Default behavior
            <select id="incomingMode">
              <option value="ai">AI answers immediately</option>
              <option value="ai_if_unanswered">Human first, AI after 10 seconds</option>
              <option value="human">Human only</option>
            </select>
          </label>
          <div style="align-self:end"><button class="primary" id="saveIncoming">Save incoming policy</button></div>
        </div>
      </article>
    </section>

    <section class="view<?=$active('updates')?>">
      <div class="grid two">
        <article class="card">
          <div class="card-head">
            <h2>Website Update</h2>
            <span>Uses your existing admin login</span>
          </div>

          <div id="websiteUpdateStatus">
            <div class="empty">Checking GitHub and deployed version…</div>
          </div>

          <div class="update-actions">
            <button class="primary" id="runWebsiteUpdate">
              Update website from GitHub
            </button>
          </div>
        </article>

        <article class="card">
          <div class="card-head">
            <h2>Android Release</h2>
            <span>Persistently signed update channel</span>
          </div>

          <div id="updatesAppRelease">
            <div class="empty">Loading Android release information…</div>
          </div>
        </article>
      </div>

      <article class="card" style="margin-top:14px">
        <div class="card-head">
          <h2>Update Flow</h2>
          <span>No separate updater password</span>
        </div>

        <div class="flow">
          <b>Admin Login</b>
          <i>→</i>
          <b>Update Website</b>
          <i>→</i>
          <b>GitHub main</b>
          <i>→</i>
          <b>Preserve config + database</b>
        </div>

        <div class="conference-note">
          Android app releases are signed with the persistent OnTrack certificate.
          Future APK versions install over the existing app and preserve local pairing
          and settings.
        </div>
      </article>
    </section>

  </main>
</div>

<script src="assets/app.js?v=20261006-8"></script>
</body>
</html>
