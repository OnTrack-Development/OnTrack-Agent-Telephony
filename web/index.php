<?php
require __DIR__ . '/app/bootstrap.php';
if (empty($_SESSION['admin_ok'])) { header('Location: login.php'); exit; }
?><!doctype html>
<html lang="en" dir="ltr">
<head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>OnTrack AI Telephony</title><link rel="stylesheet" href="assets/app.css">
</head>
<body>
<div class="shell">
  <aside class="sidebar">
    <div class="brand"><div class="brand-mark">OT</div><div><strong>OnTrack</strong><span>AI Telephony</span></div></div>
    <nav>
      <button class="nav active" data-view="overview">Overview</button>
      <button class="nav" data-view="devices">Phone Devices</button>
      <button class="nav" data-view="campaigns">Campaigns</button>
      <button class="nav" data-view="calls">Call History</button>
      <button class="nav" data-view="architecture">Bridge Status</button>
    </nav>
    <div class="sidebar-footer"><span class="dot"></span> POC Server Online<br><a href="logout.php">Sign out</a></div>
  </aside>
  <main class="main">
    <header class="topbar"><div><h1 id="pageTitle">Overview</h1><p id="pageSubtitle">Android-to-AI telephony control plane</p></div><button class="primary" id="pairBtn">+ Pair Android Phone</button></header>
    <section id="view-overview" class="view active">
      <div class="metrics" id="metrics"></div>
      <div class="grid two">
        <article class="card"><div class="card-head"><h2>Live Devices</h2><span>Android bridges</span></div><div id="overviewDevices" class="list"></div></article>
        <article class="card"><div class="card-head"><h2>Recent Calls</h2><span>Latest activity</span></div><div id="recentCalls" class="list"></div></article>
      </div>
      <article class="card flow-card"><div class="card-head"><h2>Current POC Flow</h2><span>No GSM hardware required</span></div><div class="flow"><b>OnTrack Cloud</b><i>→</i><b>Android Bridge</b><i>→</i><b>SIM / Carrier</b><i>→</i><b>Customer</b><i>+</i><b>AI Conference Bridge</b></div></article>
    </section>
    <section id="view-devices" class="view"><article class="card"><div class="card-head"><h2>Registered Phones</h2><span>Each phone represents one customer SIM endpoint</span></div><div id="devicesTable"></div></article></section>
    <section id="view-campaigns" class="view">
      <div class="grid campaign-layout">
        <article class="card"><div class="card-head"><h2>New Voice Campaign</h2><span>Sequential calling for the POC</span></div>
          <form id="campaignForm" class="form-grid">
            <label>Campaign name<input name="name" required placeholder="October invoice reminder"></label>
            <label>Voice agent<input name="agent_name" required value="OnTrack Voice Agent"></label>
            <label>Android phone<select name="device_id" id="campaignDevice" required></select></label>
            <label class="full">Scenario<textarea name="scenario" rows="5" required placeholder="Explain the task and what the agent should do..."></textarea></label>
            <label class="full">Phone numbers<textarea name="numbers" rows="7" required placeholder="01012345678&#10;01112345678&#10;01212345678"></textarea></label>
            <button class="primary full" type="submit">Create & Start Campaign</button>
          </form>
        </article>
        <article class="card"><div class="card-head"><h2>Campaign Queue</h2><span>Progress and state</span></div><div id="campaignList" class="list"></div></article>
      </div>
    </section>
    <section id="view-calls" class="view"><article class="card"><div class="card-head"><h2>Call History</h2><span>Transcript / notes fields are ready for the Voice Agent adapter</span></div><div id="callsTable"></div></article></section>
    <section id="view-architecture" class="view"><div class="grid two"><article class="card status-card"><h2>Android Bridge API</h2><div class="big-status ok">READY</div><p>Pairing, heartbeat, incoming-call instructions, job polling and result reporting endpoints are active.</p></article><article class="card status-card"><h2>Voice Media Adapter</h2><div class="big-status pending">NEXT</div><p>The next milestone connects carrier conference audio to the existing Voice Agent bridge.</p></article></div><article class="card" style="margin-top:14px"><div class="card-head"><h2>Incoming Call Policy</h2><span>Server instruction returned to the Android bridge</span></div><div class="form-grid"><label>Default behavior<select id="incomingMode"><option value="ai">AI answers immediately</option><option value="ai_if_unanswered">Human first, AI after 10 seconds</option><option value="human">Human only</option></select></label><div style="align-self:end"><button class="primary" id="saveIncoming">Save incoming policy</button></div></div></article></section>
  </main>
</div>
<div class="modal-backdrop" id="pairModal"><div class="modal"><button class="close" id="closePair">×</button><div class="eyebrow">ANDROID PAIRING</div><h2>Connect a customer phone</h2><p>Enter this code in the Android Bridge app. It expires automatically.</p><div class="pair-code" id="pairCode">------</div><div class="muted" id="pairExpiry"></div><button class="primary" id="regenPair">Generate new code</button></div></div>
<script src="assets/app.js"></script>
</body></html>
