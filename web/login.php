<?php
require __DIR__ . '/app/bootstrap.php';
if (!empty($_SESSION['admin_ok'])) { header('Location: ./'); exit; }
$error = '';
if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $password = (string)($_POST['password'] ?? '');
    
    $hash = (string)cfg('admin_password_hash', '');
    $legacy = (string)cfg('admin_password', '');
    $ok = $hash !== '' ? password_verify($password, $hash) : ($legacy !== '' && hash_equals($legacy, $password));
    if ($ok) {
        session_regenerate_id(true);
        $_SESSION['admin_ok'] = true;
        header('Location: ./'); exit;
    }
    $error = 'Incorrect password';
}
?><!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>OnTrack AI Telephony</title><link rel="stylesheet" href="assets/app.css"></head><body class="login-body"><main class="login-card"><div class="brand-mark">OT</div><h1>OnTrack AI Telephony</h1><p>Secure POC dashboard</p><?php if ($error): ?><div class="alert"><?=htmlspecialchars($error)?></div><?php endif; ?><form method="post"><input type="password" name="password" placeholder="Admin password" autocomplete="current-password" required autofocus><button type="submit">Open Dashboard</button></form></main></body></html>
