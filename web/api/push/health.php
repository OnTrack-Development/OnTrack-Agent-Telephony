<?php
declare(strict_types=1);
require_once __DIR__.'/../../app/push_runtime.php';
header('Cache-Control: no-store');
try {
 $config=otpush_config();
 otpush_encryption_key($config);
 otpush_json(200,['ok'=>true,'service'=>'OnTrack Push','configured'=>true,'remote_delivery'=>'pending_fcm_credentials']);
} catch(Throwable $e) {
 otpush_json(200,['ok'=>true,'service'=>'OnTrack Push','configured'=>false,'remote_delivery'=>'not_active']);
}
