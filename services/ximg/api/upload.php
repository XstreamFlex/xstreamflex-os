<?php
/**
 * XIMG - Upload API Endpoint
 * Handles multipart file, base64 data, or remote URL uploads
 */

require_once __DIR__ . '/../config.php';

$libDir = file_exists(__DIR__ . '/../lib/Database.php') ? __DIR__ . '/../lib' : __DIR__ . '/..';
require_once $libDir . '/Database.php';
require_once $libDir . '/Auth.php';
require_once $libDir . '/ImageProcessor.php';

set_cors_headers();
header('Content-Type: application/json; charset=utf-8');

try {
    $userKey = Auth::getUserKey();
    $deleteToken = Auth::generateRandomHex(16);

    $processedData = null;

    // Check 1: Multipart File Upload
    if (!empty($_FILES['file']) && $_FILES['file']['error'] === UPLOAD_ERR_OK) {
        $file = $_FILES['file'];
        $originalName = $file['name'] ?? 'image.png';
        $processedData = ImageProcessor::processImage($file['tmp_name'], $originalName, false);
    }
    // Check 2: Raw JSON Input (base64 or URL)
    else {
        $rawJson = file_get_contents('php://input');
        $json = json_decode($rawJson, true);

        if (!empty($json['base64'])) {
            $name = $json['filename'] ?? 'pasted_image.png';
            $processedData = ImageProcessor::processImage($json['base64'], $name, true);
        } else if (!empty($json['url'])) {
            $url = trim($json['url']);
            $name = basename(parse_url($url, PHP_URL_PATH)) ?: 'url_image.png';
            $processedData = ImageProcessor::processImage($url, $name, true);
        } else if (!empty($_POST['url'])) {
            $url = trim($_POST['url']);
            $name = basename(parse_url($url, PHP_URL_PATH)) ?: 'url_image.png';
            $processedData = ImageProcessor::processImage($url, $name, true);
        }
    }

    if (!$processedData) {
        throw new Exception('No valid image file, base64 payload, or URL provided for upload.');
    }

    // Attach User Key & Delete Token
    $processedData['user_key'] = $userKey;
    $processedData['delete_token'] = $deleteToken;

    // Save to Database
    $record = Database::saveImageRecord($processedData);

    // Build Public URLs
    $directUrl = BASE_URL . '/i/' . $record['short_code'];
    $thumbUrl = BASE_URL . '/i/' . $record['short_code'] . '?thumb=1';
    $icoUrl = BASE_URL . '/i/' . $record['short_code'] . '.ico';
    $viewUrl = BASE_URL . '/v/' . $record['short_code'];
    $deleteUrl = BASE_URL . '/api/delete.php?code=' . $record['short_code'] . '&token=' . $deleteToken;

    echo json_encode([
        'success'         => true,
        'id'              => $record['short_code'],
        'short_code'      => $record['short_code'],
        'original_name'   => $record['original_name'],
        'direct_url'      => $directUrl,
        'ico_url'         => $icoUrl,
        'view_url'        => $viewUrl,
        'thumb_url'       => $thumbUrl,
        'delete_url'      => $deleteUrl,
        'mime_type'       => $record['mime_type'],
        'orig_size'       => $record['orig_size'],
        'web_size'        => $record['web_size'],
        'orig_size_fmt'   => formatBytes($record['orig_size']),
        'web_size_fmt'    => formatBytes($record['web_size']),
        'savings_percent' => $processedData['savings'],
        'width'           => $record['width'],
        'height'          => $record['height'],
        'user_key'        => $userKey,
        'embeds'          => [
            'direct'       => $directUrl,
            'ico'          => $icoUrl,
            'viewer'       => $viewUrl,
            'html'         => '<img src="' . htmlspecialchars($directUrl) . '" alt="' . htmlspecialchars($record['original_name']) . '" />',
            'markdown'     => '![' . htmlspecialchars($record['original_name']) . '](' . $directUrl . ')',
            'bbcode'       => '[img]' . $directUrl . '[/img]',
            'favicon_html' => '<link rel="icon" type="image/x-icon" href="' . htmlspecialchars($icoUrl) . '">'
        ]
    ], JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES);

} catch (Throwable $e) {
    http_response_code(400);
    echo json_encode([
        'success' => false,
        'error'   => $e->getMessage()
    ]);
}

function formatBytes($bytes, $precision = 2) {
    $units = ['B', 'KB', 'MB', 'GB'];
    $bytes = max($bytes, 0);
    $pow = floor(($bytes ? log($bytes) : 0) / log(1024));
    $pow = min($pow, count($units) - 1);
    $bytes /= pow(1024, $pow);
    return round($bytes, $precision) . ' ' . $units[$pow];
}
