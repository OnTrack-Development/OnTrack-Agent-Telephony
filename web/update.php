<?php
declare(strict_types=1);
require_once __DIR__ . '/app/site_updater.php';
otup_schedule_auto(__DIR__);
$manifest = __DIR__ . '/downloads/latest.json';
$info = is_file($manifest) ? json_decode((string)file_get_contents($manifest), true) : null;
$version = is_array($info) ? (string)($info['version_name'] ?? 'غير معروف') : 'غير معروف';
$deployed = otup_deployed_commit(__DIR__);
header('Content-Type: text/html; charset=utf-8');
header('Cache-Control: no-store');
?><!doctype html>
<html lang="ar" dir="rtl">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>WHMCS — تحديث GitHub التلقائي</title>
<style>body{font:16px system-ui;background:#0a101c;color:#e8edf7;min-height:100vh;display:grid;place-items:center;margin:0;padding:24px}main{max-width:600px;padding:30px;background:#171e2c;border:1px solid #2d3545;border-radius:20px}a{color:#ff576d}small{color:#a8b7cb}</style></head>
<body><main><h1>تحديث WHMCS من GitHub</h1>
<p>التحديث التلقائي مفعّل على السيرفر. يتم فحص المصدر بصورة دورية عند زيارة الموقع أو استخدام واجهة التحديث.</p>
<p>الإصدار المحلي: <strong><?= htmlspecialchars($version, ENT_QUOTES, 'UTF-8') ?></strong></p>
<small>بعد نشر أي تعديل على فرع main تتم مزامنته عند أول فحص دوري. لا توجد بيانات دخول مخزنة داخل الملفات.</small>
<p><a href="/">العودة لصفحة التحميل</a> · <a href="/api/app/latest.php">بيانات الإصدار</a></p></main></body></html>
