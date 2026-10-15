<?php
/** Optional once-per-minute worker: php /path/to/whmcs/modules/addons/ontrack_mobile_admin/cron.php */
declare(strict_types=1);
if (PHP_SAPI!=='cli') { http_response_code(403); exit('CLI only'); }
$root=dirname(__DIR__,3);
if (!is_file($root.'/init.php')) { fwrite(STDERR,"WHMCS bootstrap missing\n"); exit(1); }
require_once $root.'/init.php';
require_once __DIR__.'/push.php';
try {
    $result=ontrack_mobile_push_process(40);
    echo json_encode($result,JSON_UNESCAPED_UNICODE|JSON_UNESCAPED_SLASHES).PHP_EOL;
} catch (\Throwable $e) {
    error_log('OnTrack mobile push CLI: '.$e->getMessage());
    fwrite(STDERR,"Push worker error\n");
    exit(1);
}
