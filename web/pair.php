<?php
require __DIR__ . '/app/bootstrap.php';
if (empty($_SESSION['admin_ok'])) { header('Location: login.php'); exit; }

$pdo = db();
$error = '';
$code = '';
$expires = '';

try {
    $pdo->exec("DELETE FROM pairing_codes WHERE used_at IS NULL AND expires_at < datetime('now')");

    if ($_SERVER['REQUEST_METHOD'] === 'POST' || empty($_GET['keep'])) {
        do {
            $code = (string) random_int(100000, 999999);
            $q = $pdo->prepare('SELECT 1 FROM pairing_codes WHERE code=? AND used_at IS NULL');
            $q->execute([$code]);
        } while ($q->fetchColumn());

        $expires = gmdate('Y-m-d H:i:s', time() + ((int) cfg('pairing_ttl_minutes', 10) * 60));
        $stmt = $pdo->prepare('INSERT INTO pairing_codes(code,expires_at,created_at) VALUES(?,?,?)');
        $stmt->execute([$code, $expires, now_utc()]);
    }
} catch (Throwable $e) {
    $error = $e->getMessage();
}
?><!doctype html>
<html lang="en">
<head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Pair Android Phone · OnTrack AI Telephony</title>
<link rel="stylesheet" href="assets/app.css?v=20261006-1">
<style>
.pair-page{min-height:100vh;display:grid;place-items:center;padding:22px}
.pair-panel{width:min(560px,100%);background:linear-gradient(180deg,var(--panel2),var(--panel));border:1px solid var(--line);border-radius:22px;padding:30px;text-align:center}
.pair-panel h1{margin:8px 0 6px}.pair-panel p{color:var(--muted);font-size:13px;line-height:1.6}
.pair-code-live{font-size:48px;font-weight:900;letter-spacing:.18em;margin:26px 0}
.actions{display:flex;gap:10px;justify-content:center;flex-wrap:wrap;margin-top:22px}
.secondary{display:inline-block;border-radius:11px;padding:12px 16px;background:#262a31;color:#fff;text-decoration:none;font-weight:750}
</style>
</head>
<body>
<main class="pair-page">
  <section class="pair-panel">
    <div class="brand-mark" style="margin:0 auto 16px">OT</div>
    <div class="eyebrow">ANDROID PAIRING</div>
    <h1>Connect Android Phone</h1>
    <p>Open the OnTrack AI Phone Bridge app, enter the server URL and this 6-digit code.</p>

    <?php if ($error): ?>
      <div class="alert"><?=htmlspecialchars($error)?></div>
    <?php else: ?>
      <div class="pair-code-live"><?=htmlspecialchars($code)?></div>
      <p>Server: <b>https://agent.ontrackegy.com</b><br>Expires: <?=htmlspecialchars($expires)?> UTC</p>
    <?php endif; ?>

    <div class="actions">
      <form method="post"><button class="primary" type="submit">Generate New Code</button></form>
      <a class="secondary" href="./?view=devices">Back to Phone Devices</a>
    </div>
  </section>
</main>
</body>
</html>
