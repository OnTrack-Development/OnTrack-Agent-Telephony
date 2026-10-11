<?php
declare(strict_types=1);
require_once __DIR__.'/../../app/push_runtime.php';
try{
 [, $data]=otpush_input(6400);
 otpush_json(200,otpush_enroll(otpush_config(),$data));
}catch(DomainException $e){
 otpush_json(401,['ok'=>false,'error'=>'Unauthorized pairing']);
}catch(Throwable $e){
 error_log('OnTrack Push enrollment error: '.get_class($e));
 otpush_json(503,['ok'=>false,'error'=>'Enrollment unavailable']);
}
