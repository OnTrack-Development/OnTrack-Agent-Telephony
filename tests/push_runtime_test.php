<?php
declare(strict_types=1);
require_once __DIR__.'/../web/app/push_runtime.php';
function ensure(bool $result,string $message):void {
 if(!$result)throw new RuntimeException('FAILED: '.$message);
}
$dir=sys_get_temp_dir().'/ontrack-push-test-'.bin2hex(random_bytes(5));
if(!mkdir($dir,0700,true))throw new RuntimeException('Cannot create test directory');
$cfg=[
 'firebase_project'=>'ontrack-whmcs-push',
 'database'=>$dir.'/push.sqlite',
 'token_crypto_key'=>base64_encode(random_bytes(SODIUM_CRYPTO_SECRETBOX_KEYBYTES)),
 'tenants'=>[
  'tenant_a'=>['hmac_secret'=>bin2hex(random_bytes(32)),'whmcs_base'=>'https://tenant-a.example'],
  'tenant_b'=>['hmac_secret'=>bin2hex(random_bytes(32)),'whmcs_base'=>'https://tenant-b.example']
 ]
];
try{
 file_put_contents($dir.'/config.php','<?php return '.var_export($cfg,true).';');
 putenv('ONTRACK_PUSH_CONFIG='.$dir.'/config.php');
 $config=otpush_config();
 ensure(otpush_tenant($config,'tenant_a')['whmcs_base']==='https://tenant-a.example','tenant config');
 $key=otpush_encryption_key($config);
 $plaintext='example-fcm-'.str_repeat('a',85);
 ensure(otpush_decrypt(otpush_encrypt($plaintext,$key),$key)===$plaintext,'encrypted device tokens');
 $claim=['v'=>1,'tenant'=>'tenant_a','staff'=>12,'iat'=>time(),'exp'=>time()+100,
  'jti'=>bin2hex(random_bytes(16))];
 $raw=rtrim(strtr(base64_encode(json_encode($claim,JSON_THROW_ON_ERROR)),'+/','-_'),'=');
 $pair=$raw.'.'.hash_hmac('sha256',$raw,$cfg['tenants']['tenant_a']['hmac_secret']);
 $enrolled=otpush_enroll($config,['pairing'=>$pair,'fcm_token'=>$plaintext]);
 ensure($enrolled['ok']===true && $enrolled['device_id']>0,'enrolled authorized device');
 try{otpush_enroll($config,['pairing'=>$pair,'fcm_token'=>$plaintext]);throw new RuntimeException('Replay accepted');}
 catch(DomainException $e){ensure(str_contains($e->getMessage(),'already used'),'pairing replay');}
 $db=otpush_db($config);
 ensure((int)$db->query('SELECT count(*) FROM devices')->fetchColumn()===1,'one device');
 $body=json_encode(['event_id'=>'ticket-new-77','section'=>'tickets','id'=>77],JSON_THROW_ON_ERROR);
 $_SERVER['HTTP_X_OT_TENANT']='tenant_a';$_SERVER['HTTP_X_OT_TIMESTAMP']=(string)time();
 $_SERVER['HTTP_X_OT_SIGNATURE']='sha256='.hash_hmac('sha256',$_SERVER['HTTP_X_OT_TIMESTAMP']."\n".$body,
  $cfg['tenants']['tenant_a']['hmac_secret']);
 $event=otpush_accept_event($config,[$body,json_decode($body,true)]);
 ensure($event['queued']===1&&!$event['duplicate'],'tenant-a delivery');
 $again=otpush_accept_event($config,[$body,json_decode($body,true)]);
 ensure($again['duplicate']===true && $again['queued']===0,'event idempotency');
 $_SERVER['HTTP_X_OT_TENANT']='tenant_b';
 $_SERVER['HTTP_X_OT_SIGNATURE']='sha256='.hash_hmac('sha256',$_SERVER['HTTP_X_OT_TIMESTAMP']."\n".$body,
  $cfg['tenants']['tenant_b']['hmac_secret']);
 $cross=otpush_accept_event($config,[$body,json_decode($body,true)]);
 ensure($cross['queued']===0 && !$cross['duplicate'],'no cross-tenant delivery');
 $_SERVER['HTTP_X_OT_SIGNATURE']='sha256='.str_repeat('f',64);
 try{otpush_accept_event($config,[$body,json_decode($body,true)]);throw new RuntimeException('Bad signature accepted');}
 catch(DomainException $e){ensure(true,'bad signature refused');}
 ensure(otpush_revoke($config,['device_id'=>$enrolled['device_id'],
  'revoke_token'=>$enrolled['revoke_token']]),'device revoked');
 ensure(!otpush_revoke($config,['device_id'=>$enrolled['device_id'],
  'revoke_token'=>$enrolled['revoke_token']]),'revocation idempotent');
 $_SERVER['HTTP_X_OT_TENANT']='tenant_a';
 $_SERVER['HTTP_X_OT_SIGNATURE']='sha256='.hash_hmac('sha256',$_SERVER['HTTP_X_OT_TIMESTAMP']."\n".$body,
  $cfg['tenants']['tenant_a']['hmac_secret']);
 $body2=json_encode(['event_id'=>'order-new-78','section'=>'orders','id'=>78],JSON_THROW_ON_ERROR);
 $_SERVER['HTTP_X_OT_SIGNATURE']='sha256='.hash_hmac('sha256',$_SERVER['HTTP_X_OT_TIMESTAMP']."\n".$body2,
  $cfg['tenants']['tenant_a']['hmac_secret']);
 ensure(otpush_accept_event($config,[$body2,json_decode($body2,true)])['queued']===0,'revoked device not targeted');
 echo 'PASS: HMAC hook, SQLite queue, device encryption, one-time enrollment, replay block, tenant isolation, revocation'.PHP_EOL;
}finally{
 putenv('ONTRACK_PUSH_CONFIG');
 foreach(glob($dir.'/*')?:[] as $f)@unlink($f);
 @rmdir($dir);
}
