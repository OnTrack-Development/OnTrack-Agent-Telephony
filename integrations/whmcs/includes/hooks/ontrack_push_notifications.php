<?php
declare(strict_types=1);
/**
 * Optional, standalone WHMCS integration. Never touch whatsapp_notifications
 * or WHMCS core. Install only after a distinct tenant HMAC secret is provisioned
 * in both the central gateway's private config and this installation's private config.
 *
 * ENV ONTRACK_WHMCS_PUSH_CONFIG: absolute path to PHP return-array, outside webroot:
 * return ['tenant'=>'your_tenant_id','hmac_secret'=>'...', 'endpoint'=>
 *         'https://agent.ontrackegy.com/api/push/event.php'];
 */
if(!defined('WHMCS')){exit;}
function otpush_whmcs_event(string $section,int $recordId):void {
 if($recordId<1||!in_array($section,['tickets','orders','clients'],true))return;
 try{
  $filename=getenv('ONTRACK_WHMCS_PUSH_CONFIG');
  if(!is_string($filename)||$filename===''||!str_starts_with($filename,'/')
    ||!is_file($filename)||!is_readable($filename))return;
  $cfg=require $filename;
  if(!is_array($cfg))return;
  $tenant=$cfg['tenant']??null;$secret=$cfg['hmac_secret']??null;
  $url=$cfg['endpoint']??null;
  if(!is_string($tenant)||!preg_match('/^[a-zA-Z0-9_-]{3,64}$/D',$tenant)
    ||!is_string($secret)||strlen($secret)<40
    ||$url!=='https://agent.ontrackegy.com/api/push/event.php'
    ||!function_exists('curl_init'))return;
  $id=($section==='tickets'?'ticket-new-':($section==='orders'?'order-new-':'client-new-')).$recordId;
  $raw=json_encode(['event_id'=>$id,'section'=>$section,'id'=>$recordId],JSON_THROW_ON_ERROR);
  $timestamp=(string)time();
  $hmac='sha256='.hash_hmac('sha256',$timestamp."\n".$raw,$secret);
  $curl=curl_init($url);
  curl_setopt_array($curl,[
   CURLOPT_POST=>true,CURLOPT_RETURNTRANSFER=>true,CURLOPT_FOLLOWLOCATION=>false,
   CURLOPT_CONNECTTIMEOUT=>2,CURLOPT_TIMEOUT=>3,CURLOPT_PROTOCOLS=>CURLPROTO_HTTPS,
   CURLOPT_SSL_VERIFYPEER=>true,CURLOPT_SSL_VERIFYHOST=>2,
   CURLOPT_HTTPHEADER=>['Content-Type: application/json','X-OT-Tenant: '.$tenant,
    'X-OT-Timestamp: '.$timestamp,'X-OT-Signature: '.$hmac],
   CURLOPT_POSTFIELDS=>$raw
  ]);
  curl_exec($curl);
  curl_close($curl);
 }catch(Throwable $e){
  // Never interrupt an order or ticket transaction because a notification failed.
  error_log('OnTrack Push hook deferred: '.get_class($e));
 }
}
add_hook('TicketOpen',1,static function(array $vars):void{
 otpush_whmcs_event('tickets',(int)($vars['ticketid']??0));
});
add_hook('TicketOpenAdmin',1,static function(array $vars):void{
 otpush_whmcs_event('tickets',(int)($vars['ticketid']??0));
});
add_hook('AfterShoppingCartCheckout',1,static function(array $vars):void{
 otpush_whmcs_event('orders',(int)($vars['OrderID']??0));
});
add_hook('ClientAdd',1,static function(array $vars):void{
 otpush_whmcs_event('clients',(int)($vars['client_id']??$vars['userid']??0));
});
