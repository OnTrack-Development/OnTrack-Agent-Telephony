<?php
declare(strict_types=1);
$manifest = __DIR__ . '/downloads/latest.json';
$meta = is_file($manifest) ? json_decode((string) file_get_contents($manifest), true) : null;
$version = is_array($meta) ? (string)($meta['version_name'] ?? '') : '';
$filename = is_array($meta) ? basename((string)($meta['filename'] ?? '')) : '';
$local = $filename !== '' ? __DIR__ . '/downloads/' . $filename : '';
$available = $local !== '' && is_file($local) && filesize($local) === (int)($meta['size_bytes'] ?? -1);
$h = static fn($x): string => htmlspecialchars((string)$x, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
?><!doctype html>
<html lang="ar" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>WHMCS | مركز التحميل والتحديثات</title>
<meta name="theme-color" content="#090E18"><link rel="icon" type="image/png" href="/assets/whmcs-icon.png">
<style>
*{box-sizing:border-box}html{font-family:system-ui,-apple-system,Segoe UI,sans-serif}body{margin:0;min-height:100vh;background:radial-gradient(ellipse at 20% 0%,#2f1727 0,transparent 45%),#090e18;color:#edf1f9;padding:24px;display:grid;place-items:center}
main{width:min(650px,100%)}.top{display:flex;justify-content:space-between;align-items:center;border-bottom:1px solid #2a3449;padding:0 0 22px;margin:0 0 38px}
.logo{font-size:19px;font-weight:900;letter-spacing:.4px}.dot{display:inline-block;width:8px;height:8px;background:#e33452;border-radius:50%;margin-left:9px}
small{color:#a8b5cb}h1{font-size:clamp(30px,6vw,48px);margin:0 0 16px;line-height:1.2}p{color:#acb8cd;line-height:1.9}
.card{border:1px solid #26354d;background:#141b2a;border-radius:24px;padding:30px;margin-top:25px;box-shadow:0 24px 80px #0004}
.tag{display:inline-block;color:#ffbcc6;background:#4f1e32;border-radius:20px;padding:7px 13px;font-size:12px}
.button{display:block;text-decoration:none;background:#e33452;color:white;text-align:center;border-radius:13px;padding:16px;margin-top:20px;font-weight:800}
.button[aria-disabled=true]{opacity:.4;pointer-events:none}.muted{background:#273248;color:#e9eef8}
.info{display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap;margin-top:18px;font-size:12px;color:#a6b3c9}
.footer{font-size:12px;color:#697990;margin-top:35px;text-align:center}
</style></head><body><main>
<div class="top"><div class="logo"><img src="/assets/whmcs-icon.png" alt="" width="32" height="32" style="vertical-align:middle;border-radius:9px;margin-left:8px"> WHMCS</div><small>تحديثات أندرويد الرسمية</small></div>
<span class="tag">ANDROID / ARM64</span>
<h1>تطبيق إدارة WHMCS<br>من مكان واحد.</h1>
<p>تحميل مباشر من سيرفر OnTrack، بدون تحويل إلى GitHub. يتم فحص التحديثات من داخل التطبيق وعرض إشعار عند توفر إصدار أحدث.</p>
<section class="card">
<div class="tag"><?= $available ? 'الإصدار متاح' : 'جارٍ تجهيز الإصدار' ?></div>
<h2>WHMCS <?= $h($version !== '' ? 'v' . $version : '') ?></h2>
<p>APK موقّع لأجهزة Android ARM64. يمكن تثبيت النسخة الجديدة فوق الإصدار السابق بنفس شهادة التوقيع.</p>
<a class="button" <?= $available ? 'href="downloads/' . rawurlencode($filename) . '"' : 'aria-disabled="true"' ?>>تحميل APK من السيرفر</a>
<a class="button muted" href="api/app/latest.php">معلومات الإصدار (JSON)</a>
<div class="info"><span>الحجم: <?= $available ? number_format(filesize($local)/1048576, 2) . ' MiB' : 'غير متاح' ?></span><span>المصدر: agent.ontrackegy.com</span></div>
</section>
<p class="footer">OnTrack Development © <?= date('Y') ?> · لا تشارك مفاتيح WHMCS API مع أي جهة غير موثوقة.</p>
</main></body></html>
