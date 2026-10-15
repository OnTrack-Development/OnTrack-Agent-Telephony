<?php
/**
 * Independent WHMCS -> Firebase HTTP v1 push transport.
 * Requires ONTRACK_MOBILE_FCM_SERVICE_ACCOUNT_PATH defined in WHMCS private
 * configuration.php, pointing to a Google service account JSON OUTSIDE webroot.
 * No Meta WhatsApp webhook, database schema or sender is changed.
 */
declare(strict_types=1);
if (!defined('WHMCS')) { http_response_code(403); exit('Forbidden'); }

use WHMCS\Database\Capsule;

function ontrack_mobile_push_config(): ?array {
    if (!defined('ONTRACK_MOBILE_FCM_SERVICE_ACCOUNT_PATH')) return null;
    $name=(string)constant('ONTRACK_MOBILE_FCM_SERVICE_ACCOUNT_PATH');
    $real=realpath($name);
    $webroot=realpath((string)($_SERVER['DOCUMENT_ROOT']??''));
    if (!$real || !is_file($real) || ($webroot && ($real===$webroot || strpos($real,$webroot.DIRECTORY_SEPARATOR)===0))) return null;
    $raw=file_get_contents($real);
    $creds=is_string($raw)?json_decode($raw,true):null;
    if (!is_array($creds) || ($creds['project_id']??'')!=='ontrack-whmcs-push'
        || !is_string($creds['client_email']??null) || !is_string($creds['private_key']??null)) return null;
    return $creds;
}
function ontrack_mobile_push_installed(): bool {
    try { return Capsule::schema()->hasTable('mod_ontrack_mobile_push_devices')
        && Capsule::schema()->hasTable('mod_ontrack_mobile_push_events')
        && Capsule::schema()->hasTable('mod_ontrack_mobile_push_deliveries'); }
    catch (\Throwable $e) { return false; }
}
function ontrack_mobile_push_install(): void {
    if (!Capsule::schema()->hasTable('mod_ontrack_mobile_push_devices')) {
        Capsule::schema()->create('mod_ontrack_mobile_push_devices',static function($t) {
            $t->increments('id');
            $t->integer('session_id')->unsigned()->index();
            $t->integer('admin_id')->unsigned()->index();
            $t->string('device_id',64);
            $t->string('fcm_hash',64);
            $t->text('fcm_encrypted');
            $t->dateTime('created_at');
            $t->dateTime('updated_at');
            $t->unique(['session_id','device_id'],'ontrack_push_device_unique');
        });
    }
    if (!Capsule::schema()->hasTable('mod_ontrack_mobile_push_events')) {
        Capsule::schema()->create('mod_ontrack_mobile_push_events',static function($t) {
            $t->increments('id');
            $t->string('event_key',64)->unique();
            $t->string('category',24);
            $t->integer('entity_id')->unsigned();
            $t->integer('dept_id')->unsigned()->default(0);
            $t->string('title',180);
            $t->string('body',220);
            $t->string('status',20)->default('pending')->index();
            $t->integer('attempts')->unsigned()->default(0);
            $t->dateTime('next_attempt_at')->index();
            $t->dateTime('created_at');
        });
    }
    if (!Capsule::schema()->hasTable('mod_ontrack_mobile_push_deliveries')) {
        Capsule::schema()->create('mod_ontrack_mobile_push_deliveries',static function($t) {
            $t->increments('id');
            $t->integer('event_id')->unsigned()->index();
            $t->integer('device_id')->unsigned();
            $t->string('status',16);
            $t->dateTime('updated_at');
            $t->unique(['event_id','device_id'],'ontrack_push_delivery_unique');
        });
    }
    if (!Capsule::schema()->hasTable('mod_ontrack_mobile_push_cursor')) {
        Capsule::schema()->create('mod_ontrack_mobile_push_cursor',static function($t) {
            $t->string('source',40)->primary();
            $t->bigInteger('last_id')->unsigned()->default(0);
        });
    }
    // Capture the initial WhatsApp cursor at module activation (before the
    // first cron). Otherwise the first actual test message may be skipped
    // when worker polling starts for the first time.
    if (Capsule::schema()->hasTable('mod_whatsapp_chat_messages')) {
        Capsule::table('mod_ontrack_mobile_push_cursor')->insertOrIgnore([
            'source'=>'whatsapp_inbound',
            'last_id'=>(int)(Capsule::table('mod_whatsapp_chat_messages')->max('id')??0)
        ]);
    }
}
function ontrack_mobile_push_enqueue(string $category,int $entityId,string $revision,string $title,string $body,int $deptId=0): void {
    if ($entityId<1 || !in_array($category,['tickets','clients','invoices','orders','services','domains','whatsapp'],true)
        || !ontrack_mobile_push_installed()) return;
    $key=hash('sha256',$category.'|'.$entityId.'|'.$revision);
    $title=mb_substr(trim(preg_replace('/[\r\n\t]+/u',' ',$title)??''),0,170);
    $body=mb_substr(trim(preg_replace('/[\r\n\t]+/u',' ',$body)??''),0,210);
    try {
        Capsule::table('mod_ontrack_mobile_push_events')->insertOrIgnore([
            'event_key'=>$key,'category'=>$category,'entity_id'=>$entityId,'dept_id'=>max(0,$deptId),
            'title'=>$title,'body'=>$body,'status'=>'pending','attempts'=>0,
            'next_attempt_at'=>gmdate('Y-m-d H:i:s'),'created_at'=>gmdate('Y-m-d H:i:s')
        ]);
    } catch (\Throwable $e) { error_log('Mobile push enqueue failed: '.$e->getMessage()); }
}
function ontrack_mobile_push_access(int $adminId,string $category,int $deptId): bool {
    $admin=Capsule::table('tbladmins')->where('id',$adminId)->first();
    if (!$admin || (int)($admin->disabled??0)===1) return false;
    if ($category!=='tickets') return true;
    if ($deptId<1) return false; // No safe department match: fail closed.
    $depts=array_filter(array_map('intval',explode(',',(string)($admin->supportdepts??''))));
    return in_array($deptId,$depts,true);
}
function ontrack_mobile_push_oauth(array $cfg): ?string {
    static $cached=null,$expires=0;
    if ($cached && $expires>time()+60) return $cached;
    if (!function_exists('curl_init') || !function_exists('openssl_sign')) return null;
    $b64=static function(string $s):string{return rtrim(strtr(base64_encode($s),'+/','-_'),'=');};
    $now=time();
    $header=$b64(json_encode(['alg'=>'RS256','typ'=>'JWT']));
    $claims=$b64(json_encode([
        'iss'=>$cfg['client_email'],'scope'=>'https://www.googleapis.com/auth/firebase.messaging',
        'aud'=>'https://oauth2.googleapis.com/token','iat'=>$now,'exp'=>$now+3600
    ]));
    $message=$header.'.'.$claims;
    if (!openssl_sign($message,$signature,$cfg['private_key'],OPENSSL_ALGO_SHA256)) return null;
    $jwt=$message.'.'.$b64($signature);
    $ch=curl_init('https://oauth2.googleapis.com/token');
    curl_setopt_array($ch,[
        CURLOPT_POST=>true,CURLOPT_POSTFIELDS=>http_build_query([
            'grant_type'=>'urn:ietf:params:oauth:grant-type:jwt-bearer','assertion'=>$jwt
        ]),CURLOPT_RETURNTRANSFER=>true,CURLOPT_CONNECTTIMEOUT=>3,CURLOPT_TIMEOUT=>8,
        CURLOPT_HTTPHEADER=>['Content-Type: application/x-www-form-urlencoded'],
    ]);
    $raw=curl_exec($ch);$http=(int)curl_getinfo($ch,CURLINFO_HTTP_CODE);curl_close($ch);
    $obj=is_string($raw)?json_decode($raw,true):null;
    if ($http!==200||!is_array($obj)||!is_string($obj['access_token']??null)) return null;
    $cached=$obj['access_token'];$expires=$now+max(120,(int)($obj['expires_in']??3600)-60);
    return $cached;
}
function ontrack_mobile_push_send(array $cfg,string $accessToken,string $fcmToken,$event): string {
    $channel='whmcs-'.(string)$event->category;
    $data=['section'=>(string)$event->category,'id'=>(string)$event->entity_id,
        'event_id'=>(string)$event->event_key];
    $body=json_encode(['message'=>[
        'token'=>$fcmToken,
        'notification'=>['title'=>(string)$event->title,'body'=>(string)$event->body],
        'data'=>$data,
        'android'=>['priority'=>'HIGH','notification'=>[
            'channel_id'=>$channel,'sound'=>'default','tag'=>(string)$event->event_key
        ]]
    ]],JSON_UNESCAPED_UNICODE|JSON_INVALID_UTF8_SUBSTITUTE);
    if (!is_string($body)) return 'failed';
    $url='https://fcm.googleapis.com/v1/projects/'.rawurlencode($cfg['project_id']).'/messages:send';
    $ch=curl_init($url);
    curl_setopt_array($ch,[
        CURLOPT_POST=>true,CURLOPT_POSTFIELDS=>$body,CURLOPT_RETURNTRANSFER=>true,
        CURLOPT_CONNECTTIMEOUT=>3,CURLOPT_TIMEOUT=>10,
        CURLOPT_HTTPHEADER=>['Authorization: Bearer '.$accessToken,'Content-Type: application/json; charset=utf-8'],
    ]);
    $response=curl_exec($ch);$http=(int)curl_getinfo($ch,CURLINFO_HTTP_CODE);curl_close($ch);
    if ($http>=200&&$http<300) return 'sent';
    $json=is_string($response)?json_decode($response,true):null;
    $status=(string)($json['error']['status']??'');
    if (in_array($status,['UNREGISTERED','INVALID_ARGUMENT'],true) && $http===404) return 'unregistered';
    if ($status==='UNREGISTERED') return 'unregistered';
    return 'failed';
}
/** Poll independent read-only WhatsApp tables, starting from latest ID on first run. */
function ontrack_mobile_push_poll_whatsapp(): void {
    if (!ontrack_mobile_push_installed() || !Capsule::schema()->hasTable('mod_whatsapp_chat_messages')) return;
    $source='whatsapp_inbound';
    $cursor=Capsule::table('mod_ontrack_mobile_push_cursor')->where('source',$source)->first();
    if (!$cursor) {
        $max=(int)(Capsule::table('mod_whatsapp_chat_messages')->max('id')??0);
        Capsule::table('mod_ontrack_mobile_push_cursor')->insertOrIgnore(['source'=>$source,'last_id'=>$max]);
        return;
    }
    $messages=Capsule::table('mod_whatsapp_chat_messages')->where('id','>',(int)$cursor->last_id)
        ->orderBy('id')->limit(100)->get(['id','conversation_id','direction']);
    $last=(int)$cursor->last_id;
    foreach($messages as $m) {
        $last=(int)$m->id;
        if (!in_array(strtolower(trim((string)$m->direction)),['in','incoming','inbound','received'],true)) continue;
        $name='العميل';
        if (Capsule::schema()->hasTable('mod_whatsapp_conversations')) {
            $c=Capsule::table('mod_whatsapp_conversations')->where('id',(int)$m->conversation_id)->first();
            if ($c) $name=(string)($c->contact_name??$c->display_name??$c->profile_name??$c->name??'العميل');
        }
        ontrack_mobile_push_enqueue('whatsapp',(int)$m->conversation_id,'msg:'.(int)$m->id,
            'رسالة واتساب • '.mb_substr($name,0,55),'رسالة جديدة من العميل');
    }
    if ($last>(int)$cursor->last_id) Capsule::table('mod_ontrack_mobile_push_cursor')
        ->where('source',$source)->update(['last_id'=>$last]);
}
function ontrack_mobile_push_process(int $limit=30): array {
    $stats=['queued'=>0,'sent'=>0,'failed'=>0,'configured'=>false];
    if (!ontrack_mobile_push_installed()) return $stats;
    $cfg=ontrack_mobile_push_config();$stats['configured']=(bool)$cfg;
    if (!$cfg) return $stats;
    $token=ontrack_mobile_push_oauth($cfg);
    if (!$token) return $stats;
    ontrack_mobile_push_poll_whatsapp();
    $now=gmdate('Y-m-d H:i:s');
    // Recover abandoned processing leases without creating duplicate normal runs.
    Capsule::table('mod_ontrack_mobile_push_events')->where('status','processing')
        ->where('next_attempt_at','<=',$now)->update(['status'=>'retry']);
    $events=Capsule::table('mod_ontrack_mobile_push_events')->whereIn('status',['pending','retry'])
        ->where('next_attempt_at','<=',$now)->orderBy('id')->limit(min(60,max(1,$limit)))->get();
    foreach($events as $event) {
        $lock=Capsule::table('mod_ontrack_mobile_push_events')->where('id',$event->id)
            ->where('status',$event->status)->update([
                'status'=>'processing',
                'next_attempt_at'=>gmdate('Y-m-d H:i:s',time()+900)
            ]);
        if ($lock!==1) continue;
        // Suppress a flood if remote delivery was unavailable for many hours.
        if (strtotime((string)$event->created_at)<time()-1800) {
            Capsule::table('mod_ontrack_mobile_push_events')->where('id',$event->id)
                ->update(['status'=>'done']);
            continue;
        }
        $stats['queued']++;
        $retry=false;
        try {
            $devices=Capsule::table('mod_ontrack_mobile_push_devices as d')
                ->join('mod_ontrack_mobile_sessions as s','s.id','=','d.session_id')
                ->whereNull('s.revoked_at')->where('s.expires_at','>',$now)
                ->where('d.created_at','<=',$event->created_at)
                ->select('d.*')->limit(200)->get();
            foreach($devices as $device) {
                if (!ontrack_mobile_push_access((int)$device->admin_id,(string)$event->category,(int)$event->dept_id))continue;
                $sent=Capsule::table('mod_ontrack_mobile_push_deliveries')
                    ->where('event_id',$event->id)->where('device_id',$device->id)->where('status','sent')->exists();
                if ($sent)continue;
                if (!function_exists('decrypt')) { $retry=true; break; }
                $fcm=decrypt((string)$device->fcm_encrypted);
                if (!is_string($fcm)||strlen($fcm)<20) { $retry=true;continue; }
                $outcome=ontrack_mobile_push_send($cfg,$token,$fcm,$event);
                if ($outcome==='unregistered') Capsule::table('mod_ontrack_mobile_push_devices')->where('id',$device->id)->delete();
                if ($outcome==='failed') $retry=true;
                Capsule::table('mod_ontrack_mobile_push_deliveries')->updateOrInsert(
                    ['event_id'=>$event->id,'device_id'=>$device->id],
                    ['status'=>$outcome,'updated_at'=>gmdate('Y-m-d H:i:s')]);
                if ($outcome==='sent')$stats['sent']++;
                if ($outcome==='failed')$stats['failed']++;
            }
        } catch (\Throwable $e) {
            $retry=true;$stats['failed']++;
            error_log('OnTrack push worker event '.$event->id.': '.$e->getMessage());
        }
        $attempts=(int)$event->attempts+1;
        Capsule::table('mod_ontrack_mobile_push_events')->where('id',$event->id)->update([
            'status'=>($retry&&$attempts<6)?'retry':'done',
            'attempts'=>$attempts,'next_attempt_at'=>gmdate('Y-m-d H:i:s',time()+min(3600,60*(2**min(5,$attempts))))
        ]);
    }
    return $stats;
}
