<?php
declare(strict_types=1);
/**
 * OnTrack Push gateway (fail-closed, multi-tenant, no WHMCS credentials).
 * Firebase service-account secrets must NEVER be committed or placed under web/.
 */
function otpush_json(int $code,array $data):never {
 http_response_code($code);
 header('Content-Type: application/json; charset=utf-8');
 header('Cache-Control: no-store, private');
 header('X-Content-Type-Options: nosniff');
 echo json_encode($data,JSON_UNESCAPED_UNICODE|JSON_UNESCAPED_SLASHES);
 exit;
}
function otpush_private_path(string $value):string {
 $root=realpath(dirname(__DIR__));
 $path=realpath($value);
 if(!$root||!$path||str_starts_with($path,$root.DIRECTORY_SEPARATOR)||$path===$root)
  throw new RuntimeException('Push private configuration is absent or inside the public document root');
 return $path;
}
function otpush_config():array {
 $location=getenv('ONTRACK_PUSH_CONFIG');
 if(!is_string($location)||$location===''||!str_starts_with($location,'/'))
  throw new RuntimeException('Private push configuration is not installed');
 $config=require otpush_private_path($location);
 if(!is_array($config)||($config['firebase_project']??'')!=='ontrack-whmcs-push'
    ||empty($config['tenants'])||!is_array($config['tenants']))
  throw new RuntimeException('Push configuration is incomplete');
 return $config;
}
function otpush_tenant(array $config,string $name):array {
 if(!preg_match('/^[a-zA-Z0-9_-]{3,64}$/D',$name)
    ||!isset($config['tenants'][$name])||!is_array($config['tenants'][$name]))
  throw new RuntimeException('Unknown installation');
 $tenant=$config['tenants'][$name];
 $secret=$tenant['hmac_secret']??null;
 $base=$tenant['whmcs_base']??null;
 if(!is_string($secret)||strlen($secret)<40||!is_string($base)
    ||!preg_match('~^https://[A-Za-z0-9.-]+(?:/[A-Za-z0-9_/-]+)?$~D',$base))
  throw new RuntimeException('Installation not configured');
 return $tenant;
}
function otpush_db(array $config):PDO {
 if(!extension_loaded('pdo_sqlite'))throw new RuntimeException('PDO SQLite unavailable');
 $file=$config['database']??'';
 if(!is_string($file)||!str_starts_with($file,'/'))
  throw new RuntimeException('Database path is not configured');
 $parent=otpush_private_path(dirname($file));
 if(!is_dir($parent)||!is_writable($parent))throw new RuntimeException('Database directory is not writable');
 $db=new PDO('sqlite:'.$parent.DIRECTORY_SEPARATOR.basename($file),null,null,[
  PDO::ATTR_ERRMODE=>PDO::ERRMODE_EXCEPTION,PDO::ATTR_TIMEOUT=>5]);
 $db->exec('PRAGMA busy_timeout=5000; PRAGMA foreign_keys=ON;');
 $db->exec('CREATE TABLE IF NOT EXISTS devices (
  id INTEGER PRIMARY KEY,tenant TEXT NOT NULL,staff INTEGER NOT NULL,
  token_hash TEXT NOT NULL UNIQUE,token_cipher TEXT NOT NULL,revoke_hash TEXT NOT NULL,
  active INTEGER NOT NULL DEFAULT 1,created_at INTEGER NOT NULL,updated_at INTEGER NOT NULL)');
 $db->exec('CREATE INDEX IF NOT EXISTS ix_push_devices_tenant ON devices(tenant,active)');
 $db->exec('CREATE TABLE IF NOT EXISTS events (
  id INTEGER PRIMARY KEY,tenant TEXT NOT NULL,event_key TEXT NOT NULL,
  section TEXT NOT NULL,record_id INTEGER NOT NULL,created_at INTEGER NOT NULL,
  UNIQUE(tenant,event_key))');
 $db->exec('CREATE TABLE IF NOT EXISTS deliveries (
  id INTEGER PRIMARY KEY,event_id INTEGER NOT NULL,device_id INTEGER NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,next_try INTEGER NOT NULL DEFAULT 0,
  state TEXT NOT NULL DEFAULT "pending",last_error TEXT NOT NULL DEFAULT "",
  UNIQUE(event_id,device_id),FOREIGN KEY(event_id) REFERENCES events(id),
  FOREIGN KEY(device_id) REFERENCES devices(id))');
 $db->exec('CREATE INDEX IF NOT EXISTS ix_push_deliveries_due ON deliveries(state,next_try)');
 $db->exec('CREATE TABLE IF NOT EXISTS pairing_uses (
  tenant TEXT NOT NULL,jti TEXT NOT NULL,expires INTEGER NOT NULL,
  PRIMARY KEY(tenant,jti))');
 return $db;
}
function otpush_input(int $max=8192):array {
 if(($_SERVER['REQUEST_METHOD']??'')!=='POST')
  otpush_json(405,['ok'=>false,'error'=>'POST required']);
 $raw=file_get_contents('php://input',false,null,0,$max+1);
 if(!is_string($raw)||strlen($raw)>$max)
  otpush_json(413,['ok'=>false,'error'=>'Invalid payload size']);
 $data=json_decode($raw,true);
 if(!is_array($data))otpush_json(400,['ok'=>false,'error'=>'Invalid JSON']);
 return [$raw,$data];
}
function otpush_b64decode(string $v):string|false {
 if(!preg_match('/^[A-Za-z0-9_-]+$/D',$v))return false;
 return base64_decode(strtr($v,'-_','+/').str_repeat('=',(4-strlen($v)%4)%4),true);
}
function otpush_encryption_key(array $config):string {
 if(!extension_loaded('sodium'))throw new RuntimeException('Sodium extension required');
 $raw=base64_decode((string)($config['token_crypto_key']??''),true);
 if(!is_string($raw)||strlen($raw)!==SODIUM_CRYPTO_SECRETBOX_KEYBYTES)
  throw new RuntimeException('Token encryption key not configured');
 return $raw;
}
function otpush_encrypt(string $value,string $key):string {
 $nonce=random_bytes(SODIUM_CRYPTO_SECRETBOX_NONCEBYTES);
 return base64_encode($nonce.sodium_crypto_secretbox($value,$nonce,$key));
}
function otpush_decrypt(string $cipher,string $key):string {
 $raw=base64_decode($cipher,true);
 if(!is_string($raw)||strlen($raw)<SODIUM_CRYPTO_SECRETBOX_NONCEBYTES+SODIUM_CRYPTO_SECRETBOX_MACBYTES)
  throw new RuntimeException('Token cipher invalid');
 $nonce=substr($raw,0,SODIUM_CRYPTO_SECRETBOX_NONCEBYTES);
 $opened=sodium_crypto_secretbox_open(substr($raw,SODIUM_CRYPTO_SECRETBOX_NONCEBYTES),$nonce,$key);
 if(!is_string($opened))throw new RuntimeException('Cannot decrypt device token');
 return $opened;
}
/** WHMCS hook: HMAC(timestamp + LF + raw JSON); no public self-signup. */
function otpush_accept_event(array $config,?array $override=null):array {
 [$raw,$event]=$override??otpush_input();
 $tenantId=(string)($_SERVER['HTTP_X_OT_TENANT']??'');
 $tenant=otpush_tenant($config,$tenantId);
 $timestamp=(string)($_SERVER['HTTP_X_OT_TIMESTAMP']??'');
 $signature=(string)($_SERVER['HTTP_X_OT_SIGNATURE']??'');
 if(!preg_match('/^[0-9]{10}$/D',$timestamp)||abs(time()-(int)$timestamp)>300
    ||!preg_match('/^sha256=[a-f0-9]{64}$/D',$signature)
    ||!hash_equals('sha256='.hash_hmac('sha256',$timestamp."\n".$raw,$tenant['hmac_secret']),$signature))
  throw new DomainException('Unauthorized event');
 $kind=$event['section']??null;
 $record=$event['id']??null;
 $key=$event['event_id']??null;
 if(!in_array($kind,['tickets','orders','clients'],true)
    ||!is_int($record)||$record<1||$record>1000000000
    ||!is_string($key)||!preg_match('/^[a-zA-Z0-9_.:-]{8,96}$/D',$key))
  throw new InvalidArgumentException('Invalid event');
 $db=otpush_db($config);
 $db->beginTransaction();
 try {
  $s=$db->prepare('INSERT OR IGNORE INTO events(tenant,event_key,section,record_id,created_at)
   VALUES(?,?,?,?,?)');
  $s->execute([$tenantId,$key,$kind,$record,time()]);
  $created=$s->rowCount()===1;
  $count=0;
  if($created){
   $id=(int)$db->lastInsertId();
   $sql='INSERT OR IGNORE INTO deliveries(event_id,device_id,next_try)
     SELECT ?,d.id,? FROM devices d WHERE d.tenant=? AND d.active=1';
   $s=$db->prepare($sql);$s->execute([$id,time(),$tenantId]);$count=$s->rowCount();
  }
  $db->commit();
  return ['ok'=>true,'queued'=>$count,'duplicate'=>!$created];
 }catch(Throwable $e){$db->rollBack();throw $e;}
}
/** Enrollment assertions are short-lived HMACs minted only after WHMCS ADMIN authentication. */
function otpush_verify_pairing(array $config,string $signed):array {
 $pieces=explode('.',$signed);
 if(count($pieces)!==2||strlen($signed)>2400)return [];
 [$encoded,$signature]=$pieces;
 $plain=otpush_b64decode($encoded);
 $claim=is_string($plain)?json_decode($plain,true):null;
 if(!is_array($claim)||!is_string($signature)
    ||!preg_match('/^[a-f0-9]{64}$/D',$signature))return [];
 $name=$claim['tenant']??null;
 if(!is_string($name))return [];
 try{$tenant=otpush_tenant($config,$name);}catch(Throwable){return [];}
 if(!hash_equals(hash_hmac('sha256',$encoded,$tenant['hmac_secret']),$signature))return [];
 $now=time();
 $staff=$claim['staff']??0;$iat=$claim['iat']??0;$exp=$claim['exp']??0;
 $jti=$claim['jti']??null;
 if(($claim['v']??null)!==1||!is_int($staff)||$staff<1
    ||!is_int($iat)||!is_int($exp)||$iat>$now+30||$iat<$now-180
    ||$exp<$now||$exp>$iat+180||!is_string($jti)
    ||!preg_match('/^[A-Za-z0-9_-]{18,100}$/D',$jti))return [];
 return ['tenant'=>$name,'staff'=>$staff,'jti'=>$jti,'exp'=>$exp];
}
function otpush_enroll(array $config,array $data):array {
 $claim=otpush_verify_pairing($config,(string)($data['pairing']??''));
 $token=$data['fcm_token']??null;
 if(!$claim||!is_string($token)||strlen($token)<40||strlen($token)>4096
    ||!preg_match('/^[A-Za-z0-9:._~-]+$/D',$token))
  throw new DomainException('Invalid enrollment');
 $secret=otpush_encryption_key($config);$now=time();
 $digest=hash_hmac('sha256',$token,$secret);
 $revoke=bin2hex(random_bytes(32));
 $db=otpush_db($config);$db->beginTransaction();
 try{
  $db->exec('DELETE FROM pairing_uses WHERE expires < '.($now-300));
  $s=$db->prepare('INSERT OR IGNORE INTO pairing_uses(tenant,jti,expires) VALUES(?,?,?)');
  $s->execute([$claim['tenant'],$claim['jti'],$claim['exp']]);
  if($s->rowCount()!==1)throw new DomainException('Enrollment already used');
  $s=$db->prepare('INSERT INTO devices(tenant,staff,token_hash,token_cipher,revoke_hash,active,created_at,updated_at)
   VALUES(?,?,?,?,?,1,?,?)
   ON CONFLICT(token_hash) DO UPDATE SET tenant=excluded.tenant,staff=excluded.staff,
   token_cipher=excluded.token_cipher,revoke_hash=excluded.revoke_hash,active=1,updated_at=excluded.updated_at');
  $s->execute([$claim['tenant'],$claim['staff'],$digest,otpush_encrypt($token,$secret),
   hash_hmac('sha256',$revoke,$secret),$now,$now]);
  $s=$db->prepare('SELECT id FROM devices WHERE token_hash=?');
  $s->execute([$digest]);$deviceId=(int)$s->fetchColumn();
  $db->commit();
  return ['ok'=>true,'device_id'=>$deviceId,'revoke_token'=>$revoke];
 }catch(Throwable $e){$db->rollBack();throw $e;}
}
function otpush_revoke(array $config,array $data):bool {
 $id=$data['device_id']??null;$secret=$data['revoke_token']??null;
 if(!is_int($id)||$id<1||!is_string($secret)||!preg_match('/^[a-f0-9]{64}$/D',$secret))
  throw new DomainException('Invalid revocation');
 $digest=hash_hmac('sha256',$secret,otpush_encryption_key($config));
 $db=otpush_db($config);
 $s=$db->prepare('UPDATE devices SET active=0,updated_at=? WHERE id=? AND revoke_hash=? AND active=1');
 $s->execute([time(),$id,$digest]);
 return $s->rowCount()===1;
}
