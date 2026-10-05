<?php
require __DIR__ . '/../../app/bootstrap.php';
require_admin_api();
$pdo = db();
$metrics = [
 'devices'=>(int)$pdo->query("SELECT COUNT(*) FROM devices WHERE revoked_at IS NULL")->fetchColumn(),
 'running_campaigns'=>(int)$pdo->query("SELECT COUNT(*) FROM campaigns WHERE status='running'")->fetchColumn(),
 'calls_today'=>(int)$pdo->query("SELECT COUNT(*) FROM calls WHERE date(created_at)=date('now')")->fetchColumn(),
 'answered_today'=>(int)$pdo->query("SELECT COUNT(*) FROM calls WHERE date(created_at)=date('now') AND (outcome='answered' OR answered_at IS NOT NULL)")->fetchColumn(),
];
$devices=$pdo->query("SELECT id,name,phone_number,manufacturer,model,app_version,status,last_seen_at,created_at FROM devices WHERE revoked_at IS NULL ORDER BY id DESC")->fetchAll();
$calls=$pdo->query("SELECT id,direction,phone_number,status,outcome,duration_seconds,created_at FROM calls ORDER BY id DESC LIMIT 100")->fetchAll();
$campaigns=$pdo->query("SELECT c.id,c.name,c.agent_name,c.status,c.created_at, COUNT(cc.id) total_contacts, SUM(CASE WHEN cc.status IN ('completed','failed','skipped') THEN 1 ELSE 0 END) done_contacts FROM campaigns c LEFT JOIN campaign_contacts cc ON cc.campaign_id=c.id GROUP BY c.id ORDER BY c.id DESC LIMIT 50")->fetchAll();
json_response(['ok'=>true,'metrics'=>$metrics,'devices'=>$devices,'calls'=>$calls,'campaigns'=>$campaigns]);
