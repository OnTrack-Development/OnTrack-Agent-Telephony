<?php
/**
 * WHMCS native lifecycle hooks, isolated from the stable WhatsApp addon.
 * These callbacks only queue small, specific events; network delivery is cron.
 */
if (!defined('WHMCS')) { http_response_code(403); exit('Forbidden'); }
require_once __DIR__.'/push.php';

$ontrackEnqueue=static function(string $category,int $id,string $revision,string $title,string $body,int $dept=0): void {
    try { ontrack_mobile_push_enqueue($category,$id,$revision,$title,$body,$dept); }
    catch (\Throwable $e) { error_log('OnTrack mobile hook error: '.$e->getMessage()); }
};
add_hook('TicketOpen',1,static function($v) use($ontrackEnqueue) {
    $id=(int)($v['ticketid']??0);
    $ontrackEnqueue('tickets',$id,'open','تذكرة جديدة #'.$id,
        mb_substr((string)($v['subject']??'طلب دعم جديد'),0,120),(int)($v['deptid']??0));
});
add_hook('TicketOpenAdmin',1,static function($v) use($ontrackEnqueue) {
    $id=(int)($v['ticketid']??0);
    $ontrackEnqueue('tickets',$id,'admin-open','تذكرة جديدة #'.$id,
        mb_substr((string)($v['subject']??'طلب دعم جديد'),0,120),(int)($v['deptid']??0));
});
add_hook('TicketUserReply',1,static function($v) use($ontrackEnqueue) {
    $id=(int)($v['ticketid']??0);$reply=(int)($v['replyid']??0);
    $ontrackEnqueue('tickets',$id,'reply:'.$reply,'رد جديد على التذكرة #'.$id,
        mb_substr((string)($v['subject']??'العميل رد على التذكرة'),0,120),(int)($v['deptid']??0));
});
add_hook('ClientAdd',1,static function($v) use($ontrackEnqueue) {
    $id=(int)($v['client_id']??$v['userid']??0);
    $name=trim((string)($v['firstname']??'').' '.(string)($v['lastname']??''));
    $ontrackEnqueue('clients',$id,'created','عميل جديد',mb_substr($name?:'تم تسجيل حساب عميل جديد',0,160));
});
add_hook('AfterShoppingCartCheckout',1,static function($v) use($ontrackEnqueue) {
    $id=(int)($v['OrderID']??0);
    $ontrackEnqueue('orders',$id,'checkout','طلب جديد #'.$id,'تم إنشاء طلب خدمة جديد في WHMCS');
});
add_hook('InvoicePaid',1,static function($v) use($ontrackEnqueue) {
    $id=(int)($v['invoiceid']??0);
    $ontrackEnqueue('invoices',$id,'paid','تم سداد فاتورة #'.$id,'تم تسجيل سداد الفاتورة في WHMCS');
});
add_hook('InvoiceCreated',1,static function($v) use($ontrackEnqueue) {
    $id=(int)($v['invoiceid']??0);
    $ontrackEnqueue('invoices',$id,'created','فاتورة جديدة #'.$id,'تم إنشاء فاتورة جديدة في WHMCS');
});
add_hook('AfterCronJob',1000,static function() {
    try { ontrack_mobile_push_process(25); }
    catch (\Throwable $e) { error_log('OnTrack mobile push cron hook: '.$e->getMessage()); }
});
