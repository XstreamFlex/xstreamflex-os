<?php
/**
 * XIMG - Direct Image Serving Endpoint
 * Serves optimized WebP images & thumbnails with cache headers
 */

require_once __DIR__ . '/config.php';

$dbFile = file_exists(__DIR__ . '/lib/Database.php') ? __DIR__ . '/lib/Database.php' : __DIR__ . '/Database.php';
require_once $dbFile;

$code = $_GET['code'] ?? $_GET['id'] ?? null;
if (!$code) {
    http_response_code(404);
    echo "Image not found";
    exit;
}

// Strip extension if passed (e.g. "aB3x9Q.webp" -> "aB3x9Q")
$shortCode = pathinfo($code, PATHINFO_FILENAME);

$img = Database::getImageByCode($shortCode);
if (!$img) {
    http_response_code(404);
    echo "Image not found";
    exit;
}

$isThumb = !empty($_GET['thumb']);
$requestedExt = strtolower(pathinfo($code, PATHINFO_EXTENSION));
$isIcoRequest = !$isThumb && ($requestedExt === 'ico' || ($_GET['format'] ?? '') === 'ico');

if ($isIcoRequest) {
    $icoPath = UPLOAD_DIR . '/' . $shortCode . '.ico';
    if (!file_exists($icoPath)) {
        $sourcePath = UPLOAD_DIR . '/' . $img['file_name'];
        if (file_exists($sourcePath)) {
            $imgProcessorFile = file_exists(__DIR__ . '/lib/ImageProcessor.php') ? __DIR__ . '/lib/ImageProcessor.php' : __DIR__ . '/ImageProcessor.php';
            require_once $imgProcessorFile;
            $gd = @imagecreatefromstring(file_get_contents($sourcePath));
            if ($gd) {
                ImageProcessor::createIcoFromGd($gd, $icoPath);
                imagedestroy($gd);
            }
        }
    }
    if (file_exists($icoPath)) {
        $filePath = $icoPath;
        $fileName = $shortCode . '.ico';
    } else {
        $fileName = $isThumb ? $img['thumb_name'] : $img['file_name'];
        $filePath = ($isThumb ? THUMB_DIR : UPLOAD_DIR) . '/' . $fileName;
    }
} else {
    $fileName = $isThumb ? $img['thumb_name'] : $img['file_name'];
    $filePath = ($isThumb ? THUMB_DIR : UPLOAD_DIR) . '/' . $fileName;
}

if (!file_exists($filePath)) {
    http_response_code(404);
    echo "File not found on server";
    exit;
}

// Track views for main image requests
if (!$isThumb) {
    Database::incrementViewCount($shortCode);
}

$ext = strtolower(pathinfo($fileName, PATHINFO_EXTENSION));
$extMimeMap = [
    'webp' => 'image/webp',
    'jpg'  => 'image/jpeg',
    'jpeg' => 'image/jpeg',
    'png'  => 'image/png',
    'gif'  => 'image/gif',
    'bmp'  => 'image/bmp',
    'ico'  => 'image/x-icon'
];
$mime = $extMimeMap[$ext] ?? $img['mime_type'] ?? 'image/webp';
$lastModified = filemtime($filePath);
$etag = md5($shortCode . '_' . $lastModified . ($isThumb ? '_thumb' : ''));

header('Content-Type: ' . $mime);
header('Content-Length: ' . filesize($filePath));
header('Cache-Control: public, max-age=31536000, immutable');
header('Last-Modified: ' . gmdate('D, d M Y H:i:s', $lastModified) . ' GMT');
header('ETag: "' . $etag . '"');
header('Access-Control-Allow-Origin: *');

// Handle 304 Not Modified
if (isset($_SERVER['HTTP_IF_NONE_MATCH']) && trim($_SERVER['HTTP_IF_NONE_MATCH'], '"') === $etag) {
    http_response_code(304);
    exit;
}

readfile($filePath);
exit;
