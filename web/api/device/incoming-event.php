<?php
require __DIR__ . '/../../app/bootstrap.php'; $device=current_device(); $in=json_input();
$state=(string)($in['state']??''); $phone=normalize_phone((string)($in['phone_number']??'')); $callId=(int)($in['call_id']??0);
if(!in_array($state,['ringing','answered','ended','rejected'],true)) json_response(['ok'=>false,'error'=>'Invalid state'],422);
$pdo=db();
if($state==='ringing'){
  if(!$phone) json_response(['ok'=>false,'error'=>'Phone number required'],422);
  $s=$pdo->prepare("INSERT INTO calls(device_id,direction,phone_number,status,created_at) VALUES(?,'inbound',?,'ringing',?)");
  $s->execute([$device['id'],$phone,now_utc()]); $callId=(int)$pdo->lastInsertId();
  $mode=(string)($pdo->query("SELECT setting_value FROM settings WHERE setting_key='incoming_mode'")->fetchColumn()?:'ai');
  $action=$mode==='human'?'ring_human':($mode==='ai_if_unanswered'?'ring_then_ai':'answer_and_bridge_ai');
  json_response(['ok'=>true,'call_id'=>$callId,'instruction'=>['action'=>$action,'delay_seconds'=>$mode==='ai_if_unanswered'?10:0]]);
}
if(!$callId) json_response(['ok'=>false,'error'=>'call_id required'],422);
$q=$pdo->prepare('SELECT * FROM calls WHERE id=? AND device_id=? AND direction=\'inbound\'');$q->execute([$callId,$device['id']]);$call=$q->fetch();if(!$call)json_response(['ok'=>false,'error'=>'Inbound call not found'],404);
if($state==='answered'){$pdo->prepare("UPDATE calls SET status='answered',answered_at=COALESCE(answered_at,?) WHERE id=?")->execute([now_utc(),$callId]);}
else{$end=now_utc();$dur=$call['answered_at']?max(0,strtotime($end)-strtotime($call['answered_at'])):null;$pdo->prepare("UPDATE calls SET status=?,outcome=?,ended_at=?,duration_seconds=? WHERE id=?")->execute([$state==='ended'?'completed':'rejected',$state,$end,$dur,$callId]);}
json_response(['ok'=>true,'call_id'=>$callId]);
