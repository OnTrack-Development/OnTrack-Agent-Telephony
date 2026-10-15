<?php
/**
 * OnTrack Mobile Admin Companion (independent WHMCS addon).
 * The stable whatsapp_notifications module is NEVER modified by this addon.
 */
declare(strict_types=1);
if (!defined('WHMCS')) { http_response_code(403); exit('No direct access'); }
use WHMCS\Database\Capsule;
require_once __DIR__.'/push.php';

function ontrack_mobile_admin_config(): array {
    return [
        'name' => 'OnTrack WHMCS Mobile Companion',
        'description' => 'Independent, administrator-approved WHMCS mobile push and WhatsApp pairing. Stable WhatsApp module unchanged.',
        'version' => '0.2.0',
        'author' => 'OnTrack Development',
        'language' => 'english',
        'fields' => [],
    ];
}

function ontrack_mobile_admin_activate(): array {
    try {
        if (!Capsule::schema()->hasTable('mod_ontrack_mobile_pair_codes')) {
            Capsule::schema()->create('mod_ontrack_mobile_pair_codes', static function ($table) {
                $table->increments('id');
                $table->integer('admin_id')->unsigned()->index();
                $table->string('code_hash', 64)->unique();
                $table->string('scopes', 100);
                $table->dateTime('expires_at')->index();
                $table->dateTime('used_at')->nullable();
                $table->dateTime('created_at');
            });
        }
        if (!Capsule::schema()->hasTable('mod_ontrack_mobile_sessions')) {
            Capsule::schema()->create('mod_ontrack_mobile_sessions', static function ($table) {
                $table->increments('id');
                $table->integer('admin_id')->unsigned()->index();
                $table->string('token_hash', 64)->unique();
                $table->string('scopes', 100);
                $table->string('device_name', 120);
                $table->dateTime('expires_at')->index();
                $table->dateTime('revoked_at')->nullable();
                $table->dateTime('created_at');
            });
        }
        if (!Capsule::schema()->hasTable('mod_ontrack_mobile_pair_attempts')) {
            Capsule::schema()->create('mod_ontrack_mobile_pair_attempts', static function ($table) {
                $table->increments('id');
                $table->string('ip_hash', 64)->index();
                $table->dateTime('created_at')->index();
            });
        }
        ontrack_mobile_push_install();
        return ['status'=>'success','description'=>'Mobile Companion and push tables installed. Stable WhatsApp addon untouched.'];
    } catch (\Throwable $e) {
        error_log('OnTrack Mobile Companion activation failed: '.$e->getMessage());
        return ['status'=>'error','description'=>'Could not create standalone mobile pairing tables. Check WHMCS error log.'];
    }
}

function ontrack_mobile_admin_deactivate(): array {
    // Deliberately preserve pairing audit and state until manually removed by administrator.
    return ['status'=>'success','description'=>'Companion deactivated. Pairing tables preserved for audit.'];
}

/** WHMCS administrator-only UI: direct browser sessions, not external API credentials. */
function ontrack_mobile_admin_output($vars): void {
    $adminId = (int)($_SESSION['adminid'] ?? 0);
    if ($adminId < 1) { echo '<p>Admin session required.</p>'; return; }
    try { ontrack_mobile_push_install(); } catch (\Throwable $e) { error_log('OnTrack push upgrade: '.$e->getMessage()); }
    if (!isset($_SESSION['ontrack_mobile_pair_csrf'])) {
        $_SESSION['ontrack_mobile_pair_csrf'] = bin2hex(random_bytes(24));
    }
    $csrf = (string)$_SESSION['ontrack_mobile_pair_csrf'];
    $message = '';
    $newCode = '';
    if (($_SERVER['REQUEST_METHOD'] ?? '') === 'POST') {
        $sent = (string)($_POST['ontrack_mobile_csrf'] ?? '');
        if (!hash_equals($csrf, $sent)) {
            $message = 'Security token verification failed. Refresh the WHMCS admin page.';
        } else {
            $action = (string)($_POST['mobile_action'] ?? '');
            if ($action === 'pair') {
                try {
                    // 48-bit one-use pairing code, never stored in plaintext; expires in 5 minutes.
                    $newCode = strtoupper(bin2hex(random_bytes(6)));
                    Capsule::table('mod_ontrack_mobile_pair_codes')->insert([
                        'admin_id'=>$adminId,
                        'code_hash'=>hash('sha256', $newCode),
                        'scopes'=>'whatsapp.read,whatsapp.send,push.devices',
                        'expires_at'=>gmdate('Y-m-d H:i:s', time()+300),
                        'used_at'=>null,
                        'created_at'=>gmdate('Y-m-d H:i:s'),
                    ]);
                    $message = 'Enter this code in Android WHMCS Settings → Notifications. Expires in 5 minutes.';
                } catch (\Throwable $e) {
                    error_log('OnTrack Mobile pairing code creation failure: '.$e->getMessage());
                    $newCode = '';
                    $message = 'Unable to create pairing code. Verify companion activation and database.';
                }
            } elseif ($action === 'revoke') {
                $id = (int)($_POST['device_id'] ?? 0);
                if ($id > 0) {
                    Capsule::table('mod_ontrack_mobile_sessions')->where('admin_id',$adminId)
                        ->where('id',$id)->whereNull('revoked_at')
                        ->update(['revoked_at'=>gmdate('Y-m-d H:i:s')]);
                    $message = 'Mobile device authorization revoked.';
                }
            }
        }
    }
    $devices = [];
    try {
        $devices = Capsule::table('mod_ontrack_mobile_sessions')
            ->where('admin_id',$adminId)->orderBy('id','desc')->limit(30)->get()->all();
    } catch (\Throwable $e) {
        $message = 'Companion database is not ready. Activate the addon from Setup → Addon Modules.';
    }
    $h = static function (string $value): string {
        return htmlspecialchars($value, ENT_QUOTES|ENT_SUBSTITUTE, 'UTF-8');
    };
    echo '<div class="container-fluid" style="max-width:800px"><h2>WHMCS Mobile — Push + WhatsApp</h2>';
    echo '<p>Independent administrator-controlled device pairing for WHMCS push and WhatsApp. The original WhatsApp module remains unchanged.</p>';
    if ($message !== '') echo '<div class="alert alert-info">'.$h($message).'</div>';
    if ($newCode !== '') echo '<div class="alert alert-success"><strong style="font-size:26px;letter-spacing:4px">'.$h($newCode).'</strong><p>One use only — valid for 5 minutes. Do not share publicly.</p></div>';
    echo '<form method="post"><input type="hidden" name="ontrack_mobile_csrf" value="'.$h($csrf).'"><input type="hidden" name="mobile_action" value="pair"><button type="submit" class="btn btn-primary">Generate one-time WHMCS mobile pairing code</button></form>';
    echo '<h3>My mobile devices</h3><table class="table table-striped"><thead><tr><th>Device</th><th>Issued</th><th>Expires (UTC)</th><th>State</th><th></th></tr></thead><tbody>';
    foreach ($devices as $device) {
        $active = $device->revoked_at===null && strtotime((string)$device->expires_at)>time();
        echo '<tr><td>'.$h((string)$device->device_name).'</td><td>'.$h((string)$device->created_at).'</td><td>'.$h((string)$device->expires_at).'</td><td>'.($active?'Active':'Expired / revoked').'</td><td>';
        if ($active) {
            echo '<form method="post"><input type="hidden" name="ontrack_mobile_csrf" value="'.$h($csrf).'"><input type="hidden" name="mobile_action" value="revoke"><input type="hidden" name="device_id" value="'.(int)$device->id.'"><button type="submit" class="btn btn-danger btn-xs">Revoke</button></form>';
        }
        echo '</td></tr>';
    }
    echo '</tbody></table>';
    $pushState = ontrack_mobile_push_installed();
    $cfgReady = ontrack_mobile_push_config()!==null;
    $registered = $pushState ? (int)Capsule::table('mod_ontrack_mobile_push_devices')->count() : 0;
    $pending = $pushState ? (int)Capsule::table('mod_ontrack_mobile_push_events')->whereIn('status',['pending','retry'])->count() : 0;
    $stamp = $pushState ? Capsule::table('mod_ontrack_mobile_push_cursor')->where('source','worker_last_run')->first() : null;
    $lastRun = $stamp ? (int)$stamp->last_id : 0;
    $workerReady = $lastRun>0 && time()-$lastRun<180;
    echo '<h3>Android background FCM push</h3><table class="table table-striped"><tbody>';
    echo '<tr><th>Firebase service account file</th><td>'.($cfgReady?'Available':'Not configured').'</td></tr>';
    echo '<tr><th>Paired push devices</th><td>'.$registered.'</td></tr>';
    echo '<tr><th>Pending events</th><td>'.$pending.'</td></tr>';
    echo '<tr><th>Push worker</th><td>'.($workerReady?'Recently active':($lastRun?'Last seen '.gmdate('Y-m-d H:i:s',$lastRun).' UTC':'Never observed')).'</td></tr>';
    echo '</tbody></table>';
    echo '<p>For background alerts, upload the Companion to WHMCS, save addon settings to register hooks, configure Firebase JSON outside public_html, start cron, and pair your device in Android Settings. This status does not guarantee FCM delivery.</p></div>';
}

/**
 * WHMCS officially routed, bearer-authenticated mobile push endpoint.
 * Direct /modules/addons/*.php access is blocked on production, so the
 * public index.php?m=ontrack_mobile_admin route is used instead.
 * Pairing and FCM registration remain authenticated by bridge.php itself.
 */
function ontrack_mobile_admin_clientarea($vars): array {
    if (($_GET['route'] ?? '') !== 'mobile_push') {
        http_response_code(404);
        header('Content-Type: application/json; charset=utf-8');
        echo json_encode(['ok'=>false,'code'=>'NOT_FOUND']);
        exit;
    }
    require __DIR__.'/bridge.php';
    exit;
}
