<?php
/**
 * XIMG - Delete Image API Endpoint
 * Handles image deletion by delete token or owner user key
 */

require_once __DIR__ . '/../config.php';

$libDir = file_exists(__DIR__ . '/../lib/Database.php') ? __DIR__ . '/../lib' : __DIR__ . '/..';
require_once $libDir . '/Database.php';
require_once $libDir . '/Auth.php';

set_cors_headers();
header('Content-Type: application/json; charset=utf-8');

$shortCode = $_REQUEST['code'] ?? $_REQUEST['id'] ?? null;
$deleteToken = $_REQUEST['token'] ?? null;
$userKey = Auth::getUserKey();

if (!$shortCode) {
    http_response_code(400);
    echo json_encode(['success' => false, 'error' => 'Missing image code.']);
    exit;
}

$deleted = Database::deleteImage($shortCode, $deleteToken, $userKey);

if ($deleted) {
    echo json_encode(['success' => true, 'message' => 'Image deleted successfully.']);
} else {
    http_response_code(403);
    echo json_encode(['success' => false, 'error' => 'Unauthorized or image not found.']);
}
