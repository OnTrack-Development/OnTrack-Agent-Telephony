<?php
declare(strict_types=1);
/**
 * EXAMPLE ONLY. Copy OUTSIDE the website document root and chmod 0600.
 * Point the PHP environment variable ONTRACK_PUSH_CONFIG to its absolute path.
 * Generate hmac_secret with bin2hex(random_bytes(32)) per WHMCS installation.
 * Generate token_crypto_key with base64_encode(random_bytes(32)), once.
 * Never commit this file with real secrets or put your Firebase service account on GitHub.
 */
return [
 'firebase_project'=>'ontrack-whmcs-push',
 'database'=>'/home/YOUR_USER/private_ontrack_push/push.sqlite',
 'token_crypto_key'=>'REPLACE_WITH_44_CHARACTER_BASE64_OF_32_RANDOM_BYTES',
 'service_account'=>'/home/YOUR_USER/private_ontrack_push/firebase-service-account.json',
 'tenants'=>[
  'TENANT_UNIQUE_ID'=>[
   'hmac_secret'=>'REPLACE_WITH_64_OR_MORE_HEX_CHARACTERS_GENERATED_SECURELY',
   'whmcs_base'=>'https://your-whmcs.example'
  ]
 ]
];
