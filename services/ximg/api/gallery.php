<?php
/**
 * XIMG - User Gallery API Endpoint
 * Returns array of user's uploaded images
 */

require_once __DIR__ . '/../config.php';

$libDir = file_exists(__DIR__ . '/../lib/Database.php') ? __DIR__ . '/../lib' : __DIR__ . '/..';
require_once $libDir . '/Database.php';
require_once $libDir . '/Auth.php';

set_cors_headers();
header('Content-Type: application/json; charset=utf-8');

$userKey = Auth::getUserKey();
$limit = isset($_GET['limit']) ? min((int)$_GET['limit'], 100) : 50;
$offset = isset($_GET['offset']) ? max((int)$_GET['offset'], 0) : 0;

$records = Database::getUserImages($userKey, $limit, $offset);

$images = array_map(function($img) {
    $directUrl = BASE_URL . '/i/' . $img['short_code'];
    $thumbUrl = BASE_URL . '/i/' . $img['short_code'] . '?thumb=1';
    $icoUrl = BASE_URL . '/i/' . $img['short_code'] . '.ico';
    $viewUrl = BASE_URL . '/v/' . $img['short_code'];
    
    $orig = (int)$img['orig_size'];
    $web = (int)$img['web_size'];
    $savings = round((1 - ($web / max(1, $orig))) * 100, 1);
    if ($savings < 0) $savings = 0;

    return [
        'id'              => $img['short_code'],
        'short_code'      => $img['short_code'],
        'original_name'   => $img['original_name'],
        'direct_url'      => $directUrl,
        'ico_url'         => $icoUrl,
        'view_url'        => $viewUrl,
        'thumb_url'       => $thumbUrl,
        'orig_size'       => $orig,
        'web_size'        => $web,
        'savings_percent' => $savings,
        'view_count'      => (int)($img['view_count'] ?? 0),
        'created_at'      => (int)$img['created_at'],
        'created_at_fmt'  => date('Y-m-d H:i:s', $img['created_at'])
    ];
}, $records);

echo json_encode([
    'success'  => true,
    'user_key' => $userKey,
    'count'    => count($images),
    'images'   => $images
], JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES);
