<?php
declare(strict_types=1);
require_once __DIR__.'/../../app/push_runtime.php';
try {
 $result=otpush_accept_event(otpush_config());
 otpush_json($result['duplicate']?200:202,$result);
} catch(DomainException $e) {
 otpush_json(401,['ok'=>false,'error'=>'Unauthorized']);
} catch(InvalidArgumentException $e) {
 otpush_json(400,['ok'=>false,'error'=>'Invalid event']);
} catch(Throwable $e) {
 error_log('OnTrack Push event error: '.get_class($e));
 otpush_json(503,['ok'=>false,'error'=>'Push gateway unavailable']);
}
