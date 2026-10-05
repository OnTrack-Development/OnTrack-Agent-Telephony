<?php
require __DIR__ . '/../../app/bootstrap.php'; require_admin_api(); $pdo=db();
if($_SERVER['REQUEST_METHOD']==='POST'){
  $in=json_input(); $mode=(string)($in['incoming_mode']??'');
  if(!in_array($mode,['ai','human','ai_if_unanswered'],true)) json_response(['ok'=>false,'error'=>'Invalid incoming mode'],422);
  $s=$pdo->prepare("INSERT INTO settings(setting_key,setting_value,updated_at) VALUES('incoming_mode',?,?) ON CONFLICT(setting_key) DO UPDATE SET setting_value=excluded.setting_value,updated_at=excluded.updated_at");
  $s->execute([$mode,now_utc()]); json_response(['ok'=>true,'incoming_mode'=>$mode]);
}
$q=$pdo->query("SELECT setting_value FROM settings WHERE setting_key='incoming_mode'");
json_response(['ok'=>true,'incoming_mode'=>(string)($q->fetchColumn()?:'ai')]);
