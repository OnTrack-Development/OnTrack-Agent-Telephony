<?php
declare(strict_types=1);
require_once __DIR__.'/push_runtime.php';
if(PHP_SAPI!=='cli'){http_response_code(404);exit;}
/**
 * Dedicated PHP CLI sender, invoked by cron every minute or a trusted queue trigger.
 * Never accepts HTTP traffic and never prints/records access tokens or device tokens.
 */
function otpush_url64(string $str):string {
 return rtrim(strtr(base64_encode($str),'+/','-_'),'=');
}
function otpush_post(string $url,array $headers,string $body):array {
 $c=curl_init($url);
 if($c===false)throw new RuntimeException('Cannot initialize cURL');
 curl_setopt_array($c,[
  CURLOPT_POST=>true,CURLOPT_POSTFIELDS=>$body,CURLOPT_HTTPHEADER=>$headers,
  CURLOPT_CONNECTTIMEOUT=>8,CURLOPT_TIMEOUT=>18,CURLOPT_RETURNTRANSFER=>true,
  CURLOPT_FOLLOWLOCATION=>false,CURLOPT_PROTOCOLS=>CURLPROTO_HTTPS,
  CURLOPT_SSL_VERIFYPEER=>true,CURLOPT_SSL_VERIFYHOST=>2,
  CURLOPT_USERAGENT=>'OnTrack-WHMCS-Push/1.0'
 ]);
 $response=curl_exec($c);
 $code=(int)curl_getinfo($c,CURLINFO_HTTP_CODE);
 curl_close($c);
 if(!is_string($response))throw new RuntimeException('FCM transport error');
 return [$code,json_decode($response,true)];
}
function otpush_access_token(array $config):string {
 if(!extension_loaded('openssl')||!extension_loaded('curl'))
  throw new RuntimeException('OpenSSL and cURL extensions required');
 $file=(string)($config['service_account']??'');
 if($file==='')throw new RuntimeException('Firebase server service account is not configured');
 $raw=file_get_contents(otpush_private_path($file));
 $account=is_string($raw)?json_decode($raw,true):null;
 if(!is_array($account)||($account['project_id']??'')!=='ontrack-whmcs-push'
    ||($account['type']??'')!=='service_account'
    ||!filter_var($account['client_email']??'',FILTER_VALIDATE_EMAIL)
    ||empty($account['private_key']))
  throw new RuntimeException('Firebase service-account configuration invalid');
 $now=time();
 $header=otpush_url64(json_encode(['alg'=>'RS256','typ'=>'JWT'],JSON_THROW_ON_ERROR));
 $payload=otpush_url64(json_encode([
  'iss'=>$account['client_email'],'scope'=>'https://www.googleapis.com/auth/firebase.messaging',
  'aud'=>'https://oauth2.googleapis.com/token','iat'=>$now,'exp'=>$now+3300
 ],JSON_THROW_ON_ERROR));
 $input=$header.'.'.$payload;$signature='';
 if(!openssl_sign($input,$signature,$account['private_key'],OPENSSL_ALGO_SHA256))
  throw new RuntimeException('Cannot sign Firebase access assertion');
 [$status,$response]=otpush_post('https://oauth2.googleapis.com/token',
  ['Content-Type: application/x-www-form-urlencoded'],
  http_build_query(['grant_type'=>'urn:ietf:params:oauth:grant-type:jwt-bearer',
   'assertion'=>$input.'.'.otpush_url64($signature)]));
 if($status!==200||!is_array($response)||!is_string($response['access_token']??null)
    ||strlen($response['access_token'])<32)
  throw new RuntimeException('FCM OAuth server rejected service account');
 return $response['access_token'];
}
function otpush_send(string $bearer,string $device,array $event,array $tenant):array {
 $kind=(string)$event['section'];
 $labels=['tickets'=>'تذكرة جديدة','orders'=>'طلب جديد','clients'=>'عميل جديد'];
 if(!isset($labels[$kind]))throw new RuntimeException('Unsupported event');
 $data=['section'=>$kind,'id'=>(string)$event['record_id'],
  'whmcs_base'=>(string)$tenant['whmcs_base']];
 $payload=['message'=>[
  'token'=>$device['token'],
  'notification'=>['title'=>'WHMCS • '.$labels[$kind],
   'body'=>'إشعار إداري جديد — افتح التطبيق لعرض التفاصيل'],
  'data'=>$data,
  'android'=>['priority'=>'high',
   'notification'=>['channel_id'=>'whmcs-'.$kind]]
 ]];
 return otpush_post('https://fcm.googleapis.com/v1/projects/ontrack-whmcs-push/messages:send',
  ['Content-Type: application/json','Authorization: Bearer '.$bearer],
  json_encode($payload,JSON_THROW_ON_ERROR|JSON_UNESCAPED_UNICODE));
}
function otpush_deliver():array {
 $config=otpush_config();
 $key=otpush_encryption_key($config);
 $db=otpush_db($config);
 $rows=$db->prepare('SELECT p.id AS delivery_id,p.attempts,e.section,e.record_id,e.tenant,
  d.id AS device_id,d.token_cipher FROM deliveries p
  JOIN devices d ON d.id=p.device_id JOIN events e ON e.id=p.event_id
  WHERE p.state="pending" AND p.next_try<=? AND d.active=1
  ORDER BY p.id ASC LIMIT 35');
 $rows->execute([time()]);
 $items=$rows->fetchAll(PDO::FETCH_ASSOC);
 if(!$items)return ['queued'=>0,'sent'=>0,'failed'=>0];
 $access=otpush_access_token($config);
 $sent=0;$failed=0;
 foreach($items as $item){
  $attempts=(int)$item['attempts']+1;
  try {
   $tenant=otpush_tenant($config,(string)$item['tenant']);
   $token=otpush_decrypt((string)$item['token_cipher'],$key);
   [$status,$response]=otpush_send($access,['token'=>$token],$item,$tenant);
   if($status===200 && is_array($response) && !empty($response['name'])){
    $stmt=$db->prepare('UPDATE deliveries SET state="sent",attempts=?,last_error="" WHERE id=?');
    $stmt->execute([$attempts,$item['delivery_id']]);$sent++;continue;
   }
   $errorCode='FCM_HTTP_'.(string)$status;
   $details=json_encode($response??[]);
   $retired=in_array($status,[404,410],true)
     ||(is_string($details)&&str_contains($details,'UNREGISTERED'));
   if($retired){
    $s=$db->prepare('UPDATE devices SET active=0,updated_at=? WHERE id=?');
    $s->execute([time(),$item['device_id']]);
   }
   $delay=min(21600,30*(2**min($attempts,8)));
   $s=$db->prepare('UPDATE deliveries SET state=?,attempts=?,next_try=?,last_error=? WHERE id=?');
   $s->execute([$retired||$attempts>=7?'dead':'pending',$attempts,time()+$delay,
    $errorCode,$item['delivery_id']]);$failed++;
  }catch(Throwable $e){
   $s=$db->prepare('UPDATE deliveries SET state=?,attempts=?,next_try=?,last_error=? WHERE id=?');
   $s->execute([$attempts>=7?'dead':'pending',$attempts,time()+min(21600,30*(2**min($attempts,8))),
    'DELIVERY_ERROR',$item['delivery_id']]);$failed++;
  }
 }
 return ['queued'=>count($items),'sent'=>$sent,'failed'=>$failed];
}
try{
 $report=otpush_deliver();
 echo json_encode(['ok'=>true]+$report,JSON_UNESCAPED_SLASHES).PHP_EOL;
}catch(Throwable $e){
 fwrite(STDERR,'Push sender not ready: '.get_class($e).PHP_EOL);
 exit(1);
}
