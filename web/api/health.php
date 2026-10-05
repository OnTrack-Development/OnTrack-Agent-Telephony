<?php
require __DIR__ . '/../app/bootstrap.php';
try{db()->query('SELECT 1');json_response(['ok'=>true,'service'=>'OnTrack AI Telephony','time'=>now_utc(),'version'=>'0.1.2']);}catch(Throwable $e){json_response(['ok'=>false,'error'=>'Database unavailable'],500);}
