<?php
/**
 * OnTrack Mobile Admin Companion (independent WHMCS addon).
 * The stable whatsapp_notifications module is NEVER modified by this addon.
 */
declare(strict_types=1);
if (!defined('WHMCS')) { http_response_code(403); exit('No direct access'); }
use WHMCS\Database\Capsule;

function ontrack_mobile_admin_config(): array {
    return [
        'name' => 'OnTrack WHMCS Mobile Companion',
        'description' => 'Independent, administrator-approved mobile pairing for WhatsApp Inbox. No Meta webhook changes.',
        'version' => '0.1.0',
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
        return ['status'=>'success','description'=>'Mobile Companion activated. Original WhatsApp addon not modified.'];
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
                        'scopes'=>'whatsapp.read,whatsapp.send',
                        'expires_at'=>gmdate('Y-m-d H:i:s', time()+300),
                        'used_at'=>null,
                        'created_at'=>gmdate('Y-m-d H:i:s'),
                    ]);
                    $message = 'Scan or enter this one-time code in the WHMCS Android WhatsApp screen. Expires in 5 minutes.';
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
    echo '<div class="container-fluid" style="max-width:800px"><h2>WHMCS Mobile — WhatsApp Inbox</h2>';
    echo '<p>This independent mobile bridge uses the already installed <code>whatsapp_notifications</code> conversations. The existing Meta webhook and addon remain unchanged.</p>';
    if ($message !== '') echo '<div class="alert alert-info">'.$h($message).'</div>';
    if ($newCode !== '') echo '<div class="alert alert-success"><strong style="font-size:26px;letter-spacing:4px">'.$h($newCode).'</strong><p>One use only — valid for 5 minutes. Do not share publicly.</p></div>';
    echo '<form method="post"><input type="hidden" name="ontrack_mobile_csrf" value="'.$h($csrf).'"><input type="hidden" name="mobile_action" value="pair"><button type="submit" class="btn btn-primary">Generate one-time WhatsApp pairing code</button></form>';
    echo '<h3>My mobile devices</h3><table class="table table-striped"><thead><tr><th>Device</th><th>Issued</th><th>Expires (UTC)</th><th>State</th><th></th></tr></thead><tbody>';
    foreach ($devices as $device) {
        $active = $device->revoked_at===null && strtotime((string)$device->expires_at)>time();
        echo '<tr><td>'.$h((string)$device->device_name).'</td><td>'.$h((string)$device->created_at).'</td><td>'.$h((string)$device->expires_at).'</td><td>'.($active?'Active':'Expired / revoked').'</td><td>';
        if ($active) {
            echo '<form method="post"><input type="hidden" name="ontrack_mobile_csrf" value="'.$h($csrf).'"><input type="hidden" name="mobile_action" value="revoke"><input type="hidden" name="device_id" value="'.(int)$device->id.'"><button type="submit" class="btn btn-danger btn-xs">Revoke</button></form>';
        }
        echo '</td></tr>';
    }
    echo '</tbody></table><p>Install the Android app, open WhatsApp, then enter the one-use code. All conversations remain on your WHMCS server.</p></div>';
}
