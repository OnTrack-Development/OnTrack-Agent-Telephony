<?php
declare(strict_types=1);
require_once __DIR__.'/../../app/push_runtime.php';
try{
 [, $data]=otpush_input(1000);
 otpush_json(200,['ok'=>otpush_revoke(otpush_config(),$data)]);
}catch(DomainException $e){
 otpush_json(401,['ok'=>false,'error'=>'Unauthorized']);
}catch(Throwable $e){
 error_log('OnTrack Push revocation error: '.get_class($e));
 otpush_json(503,['ok'=>false,'error'=>'Revocation unavailable']);
}
