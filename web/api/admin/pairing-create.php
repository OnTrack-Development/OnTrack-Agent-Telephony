<?php
require __DIR__ . '/../../app/bootstrap.php'; require_admin_api();
$pdo=db(); $pdo->exec("DELETE FROM pairing_codes WHERE used_at IS NULL AND expires_at < datetime('now')");
do{$code=(string)random_int(100000,999999);$q=$pdo->prepare('SELECT 1 FROM pairing_codes WHERE code=? AND used_at IS NULL');$q->execute([$code]);}while($q->fetchColumn());
$expires=gmdate('Y-m-d H:i:s',time()+((int)cfg('pairing_ttl_minutes',10)*60));
$stmt=$pdo->prepare('INSERT INTO pairing_codes(code,expires_at,created_at) VALUES(?,?,?)');$stmt->execute([$code,$expires,now_utc()]);
json_response(['ok'=>true,'code'=>$code,'expires_at'=>$expires.' UTC']);
