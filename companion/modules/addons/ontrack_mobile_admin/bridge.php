<?php
/**
 * Independent WhatsApp mobile API for WHMCS administrators.
 * Do not use Meta Webhook Verify Token or WHMCS API credentials as bearer tokens.
 * This file never writes to whatsapp_notifications tables or modifies its webhook.
 */
declare(strict_types=1);
ini_set('display_errors','0');
header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store, no-cache, must-revalidate, private');
header('X-Content-Type-Options: nosniff');

function mobile_json(int $http, bool $ok, ?array $data=null, string $code='', string $error=''): void {
    http_response_code($http);
    $result=['ok'=>$ok];
    if ($ok) $result['data']=$data ?? [];
    else { $result['code']=$code; $result['error']=$error; }
    echo json_encode($result,JSON_UNESCAPED_UNICODE|JSON_INVALID_UTF8_SUBSTITUTE|JSON_UNESCAPED_SLASHES);
    exit;
}
if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') {
    header('Allow: POST');
    mobile_json(405,false,null,'POST_REQUIRED','This interface only accepts POST requests.');
}
if (!isset($_SERVER['HTTPS']) || !in_array(strtolower((string)$_SERVER['HTTPS']),['on','1'],true)) {
    // WHMCS must be accessed over HTTPS; do not accept spoofable X-Forwarded-Proto.
    mobile_json(403,false,null,'HTTPS_REQUIRED','HTTPS is required for mobile pairing.');
}
if ((int)($_SERVER['CONTENT_LENGTH'] ?? 0)>16384)
    mobile_json(413,false,null,'TOO_LARGE','Request body too large.');
$raw = file_get_contents('php://input',false,null,0,16385);
$input = is_string($raw) ? json_decode($raw,true) : null;
if (!is_array($input) || !is_string($input['operation'] ?? null)
    || !is_array($input['payload'] ?? null)) {
    mobile_json(400,false,null,'INVALID_REQUEST','Invalid JSON operation and payload.');
}
try {
    $whmcsRoot=dirname(__DIR__,3);
    $init=$whmcsRoot.'/init.php';
    if (!is_file($init)) mobile_json(503,false,null,'WHMCS_UNAVAILABLE','WHMCS bootstrap was not found.');
    require_once $init;
    if (!class_exists('WHMCS\\Database\\Capsule'))
        mobile_json(503,false,null,'WHMCS_UNAVAILABLE','WHMCS database unavailable.');
    require_once __DIR__.'/ontrack_mobile_admin.php';
    $required=['mod_ontrack_mobile_pair_codes','mod_ontrack_mobile_sessions','mod_ontrack_mobile_pair_attempts'];
    foreach ($required as $t) if (!\WHMCS\Database\Capsule::schema()->hasTable($t)) {
        mobile_json(503,false,null,'NOT_INSTALLED','Activate OnTrack Mobile Companion in WHMCS addon settings.');
    }
    $op=$input['operation'];
    $payload=$input['payload'];
    $now=gmdate('Y-m-d H:i:s');

    if ($op==='pair') {
        $ip=(string)($_SERVER['REMOTE_ADDR'] ?? 'unknown');
        $ipKey=hash('sha256',$ip);
        $attempts=\WHMCS\Database\Capsule::table('mod_ontrack_mobile_pair_attempts')
            ->where('ip_hash',$ipKey)
            ->where('created_at','>',gmdate('Y-m-d H:i:s',time()-300))->count();
        if ($attempts>=12) mobile_json(429,false,null,'PAIR_RATE_LIMIT','Too many pairing attempts. Retry after 5 minutes.');
        \WHMCS\Database\Capsule::table('mod_ontrack_mobile_pair_attempts')->insert([
            'ip_hash'=>$ipKey,'created_at'=>$now
        ]);
        $code=strtoupper(trim((string)($payload['code'] ?? '')));
        if (!preg_match('/^[A-F0-9]{12}$/D',$code))
            mobile_json(422,false,null,'INVALID_CODE','Pairing code must contain 12 hexadecimal characters.');
        $record=\WHMCS\Database\Capsule::table('mod_ontrack_mobile_pair_codes')
            ->where('code_hash',hash('sha256',$code))
            ->whereNull('used_at')->where('expires_at','>',$now)->first();
        if (!$record) mobile_json(401,false,null,'INVALID_CODE','Pairing code expired or incorrect. Generate a new code in WHMCS.');
        $admin=\WHMCS\Database\Capsule::table('tbladmins')->where('id',(int)$record->admin_id)->first();
        if (!$admin) mobile_json(403,false,null,'ADMIN_DISABLED','The pairing administrator is unavailable.');
        $consumed=\WHMCS\Database\Capsule::table('mod_ontrack_mobile_pair_codes')
            ->where('id',(int)$record->id)->whereNull('used_at')->where('expires_at','>',$now)
            ->update(['used_at'=>$now]);
        if ($consumed!==1) mobile_json(409,false,null,'USED_CODE','Pairing code already consumed.');
        $token=bin2hex(random_bytes(32));
        $device=trim((string)($payload['deviceLabel'] ?? 'WHMCS Android'));
        $device=mb_substr($device,0,100,'UTF-8')?:'WHMCS Android';
        $expiry=gmdate('Y-m-d H:i:s',time()+30*86400);
        \WHMCS\Database\Capsule::table('mod_ontrack_mobile_sessions')->insert([
            'admin_id'=>(int)$record->admin_id,'token_hash'=>hash('sha256',$token),
            'scopes'=>(string)$record->scopes,'device_name'=>$device,
            'expires_at'=>$expiry,'revoked_at'=>null,'created_at'=>$now,
        ]);
        $adminName=trim((string)($admin->firstname ?? '').' '.(string)($admin->lastname ?? ''));
        mobile_json(200,true,[
            'token'=>$token,'adminName'=>$adminName?:((string)($admin->username ?? 'Admin')),
            'expiresAt'=>gmdate('Y-m-d\TH:i:s\Z',time()+30*86400),
            'scopes'=>explode(',',(string)$record->scopes)
        ]);
    }

    $auth=(string)($_SERVER['HTTP_AUTHORIZATION'] ?? '');
    if (!preg_match('/^Bearer ([a-f0-9]{64})$/iD',$auth,$match))
        mobile_json(401,false,null,'NOT_PAIRED','Pair the Android app through your WHMCS admin panel.');
    $tokenHash=hash('sha256',strtolower($match[1]));
    $session=\WHMCS\Database\Capsule::table('mod_ontrack_mobile_sessions')
        ->where('token_hash',$tokenHash)->whereNull('revoked_at')
        ->where('expires_at','>',$now)->first();
    if (!$session) mobile_json(401,false,null,'AUTH_EXPIRED','Device pairing expired or revoked. Generate a new code.');
    $admin=\WHMCS\Database\Capsule::table('tbladmins')->where('id',(int)$session->admin_id)->first();
    if (!$admin) mobile_json(403,false,null,'AUTH_EXPIRED','The paired administrator is unavailable.');
    if ($op==='logout') {
        \WHMCS\Database\Capsule::table('mod_ontrack_mobile_sessions')
            ->where('id',(int)$session->id)->update(['revoked_at'=>$now]);
        mobile_json(200,true,['signedOut'=>true]);
    }

    $scopes=explode(',',(string)$session->scopes);
    $scope=$op==='whatsapp.send'?'whatsapp.send':'whatsapp.read';
    if (!in_array($op,['whatsapp.read','whatsapp.get','whatsapp.send'],true))
        mobile_json(404,false,null,'BAD_OPERATION','Unsupported mobile action.');
    if (!in_array($scope,$scopes,true))
        mobile_json(403,false,null,'FORBIDDEN','Mobile device does not have this WhatsApp permission.');

    $conversations='mod_whatsapp_conversations';
    $messages='mod_whatsapp_chat_messages';
    if (!\WHMCS\Database\Capsule::schema()->hasTable($conversations)
      || !\WHMCS\Database\Capsule::schema()->hasTable($messages))
        mobile_json(503,false,null,'WHATSAPP_NOT_INSTALLED','Stable WhatsApp chat tables unavailable.');
    $convCols=\WHMCS\Database\Capsule::schema()->getColumnListing($conversations);
    $msgCols=\WHMCS\Database\Capsule::schema()->getColumnListing($messages);
    if (array_diff(['id','wa_id'],$convCols)
      ||array_diff(['id','conversation_id','direction','body','created_at'],$msgCols))
        mobile_json(503,false,null,'UNSUPPORTED_SCHEMA','WhatsApp chat database schema does not match this independent adapter.');

    $convSelect=array_values(array_intersect(['id','wa_id','contact_name','name','display_name','profile_name','unread_count','last_message_at','updated_at','client_id'],$convCols));
    $messageSelect=array_values(array_intersect(['id','conversation_id','direction','body','created_at','message_type','status'],$msgCols));
    $outgoing=['out','outgoing','sent','admin','agent'];
    $toMessage=static function ($m) use ($outgoing): array {
        $direction=strtolower(trim((string)$m->direction));
        $body=mb_substr((string)($m->body ?? ''),0,12000,'UTF-8');
        return [
            'id'=>(string)$m->id,'from'=>in_array($direction,$outgoing,true)?'agent':'customer',
            'body'=>$body,'at'=>(string)$m->created_at
        ];
    };

    if ($op==='whatsapp.read') {
        $list=\WHMCS\Database\Capsule::table($conversations)
            ->orderBy('id','desc')->limit(40)->get($convSelect);
        $chats=[];
        foreach ($list as $c) {
            $waId=(string)($c->wa_id ?? '');
            if (!preg_match('/^[1-9][0-9]{7,14}$/D',$waId)) continue;
            $latest=\WHMCS\Database\Capsule::table($messages)
                ->where('conversation_id',(int)$c->id)->orderBy('id','desc')
                ->first($messageSelect);
            $name=trim((string)($c->contact_name??$c->display_name??$c->profile_name??$c->name??''));
            $chats[]=[
                'id'=>(string)$c->id,'name'=>$name?:$waId,'phone'=>$waId,
                'last'=>$latest?mb_substr((string)($latest->body??''),0,240,'UTF-8'):'',
                'time'=>$latest?(string)$latest->created_at:'',
                'unread'=>max(0,(int)($c->unread_count??0)),
                'messages'=>[],
            ];
        }
        mobile_json(200,true,['chats'=>$chats]);
    }

    $convId=filter_var($payload['conversation_id']??null,FILTER_VALIDATE_INT,[
        'options'=>['min_range'=>1,'max_range'=>2147483647]
    ]);
    if (!$convId) mobile_json(422,false,null,'BAD_CONVERSATION','Invalid conversation ID.');
    $conversation=\WHMCS\Database\Capsule::table($conversations)
        ->where('id',(int)$convId)->first(['id','wa_id']);
    if (!$conversation || !preg_match('/^[1-9][0-9]{7,14}$/D',(string)$conversation->wa_id))
        mobile_json(404,false,null,'BAD_CONVERSATION','Verified WhatsApp conversation not found.');

    if ($op==='whatsapp.get') {
        $items=\WHMCS\Database\Capsule::table($messages)
            ->where('conversation_id',(int)$convId)->orderBy('id','desc')
            ->limit(80)->get($messageSelect);
        $entries=[];
        foreach (array_reverse($items->all()) as $msg) $entries[]=$toMessage($msg);
        mobile_json(200,true,['messages'=>$entries]);
    }

    // Explicit WhatsApp send: never directly call Meta Graph API or mutate the stable addon.
    $text=trim((string)($payload['text']??''));
    if ($text===''||mb_strlen($text,'UTF-8')>4096)
        mobile_json(422,false,null,'BAD_MESSAGE','Message must be 1–4096 characters.');
    $lastInbound=\WHMCS\Database\Capsule::table($messages)
        ->where('conversation_id',(int)$convId)
        ->whereIn('direction',['in','inbound','incoming','received'])
        ->orderBy('id','desc')->first(['created_at']);
    if (!$lastInbound || strtotime((string)$lastInbound->created_at)<time()-24*3600)
        mobile_json(409,false,null,'CHAT_CLOSED','The 24-hour service window has expired. Use an approved template in the WHMCS addon.');

    $moduleDir=__DIR__.'/../whatsapp_notifications';
    $service=$moduleDir.'/lib/Services/ChatService.php';
    if (!is_file($service))
        mobile_json(503,false,null,'SEND_UNAVAILABLE','Original WhatsApp ChatService is unavailable.');
    $settingsFile=$moduleDir.'/lib/Services/SettingsCache.php';
    if (is_file($settingsFile)) require_once $settingsFile;
    require_once $service;
    if (!is_callable(['WhatsApp_ChatService','sendText']))
        mobile_json(503,false,null,'SEND_UNAVAILABLE','Original WhatsApp send method is unavailable.');
    if (!class_exists('WhatsApp_SettingsCache') || !is_callable(['WhatsApp_SettingsCache','get']))
        mobile_json(503,false,null,'SEND_UNAVAILABLE','Original WhatsApp SettingsCache is unavailable.');
    $settings=(array)\WhatsApp_SettingsCache::get();
    // Proven module signature: (conversation ID, text, admin ID, module settings).
    // No blind retry if provider outcome is unknown: avoid duplicated customer messages.
    $result=\WhatsApp_ChatService::sendText((int)$convId,$text,0,$settings);
    if (!is_array($result)||($result['success']??false)!==true)
        mobile_json(502,false,null,'DELIVERY_UNKNOWN','Delivery could not be confirmed. Check the original WhatsApp Inbox before retrying.');
    $messageId=trim((string)($result['provider_message_id']??''));
    if ($messageId==='')
        mobile_json(502,false,null,'DELIVERY_UNKNOWN','Message may have been accepted, but provider message ID is missing. Check Inbox before retrying.');
    mobile_json(200,true,['sent'=>true,'message_id'=>$messageId]);
} catch (\Throwable $e) {
    error_log('OnTrack independent WhatsApp mobile bridge failed: '.$e->getMessage());
    mobile_json(503,false,null,'SERVER_ERROR','WhatsApp mobile bridge encountered a server error. Review the WHMCS error log.');
}
