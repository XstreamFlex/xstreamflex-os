<?php
/**
 * XIMG - Key Verification API Endpoint
 * Validates user identity and key status
 */

require_once __DIR__ . '/../config.php';

$libDir = file_exists(__DIR__ . '/../lib/Auth.php') ? __DIR__ . '/../lib' : __DIR__ . '/..';
require_once $libDir . '/Auth.php';

set_cors_headers();
header('Content-Type: application/json; charset=utf-8');

$userKey = Auth::getUserKey();
$info = Auth::validateKey($userKey);

echo json_encode([
    'success' => true,
    'user_key' => $info['key'],
    'type'     => $info['type'],
    'valid'    => $info['valid'],
    'app'      => APP_NAME,
    'version'  => APP_VERSION
], JSON_PRETTY_PRINT);
