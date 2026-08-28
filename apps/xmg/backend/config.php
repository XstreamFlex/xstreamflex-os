<?php
/**
 * XIMG - Configuration File
 * Media Vault & Web-Optimized Image Hosting Service
 */

// Enable error reporting to surface any configuration issues clearly
@ini_set('display_errors', 1);
@ini_set('display_startup_errors', 1);
@error_reporting(E_ALL);

if (!defined('XIMG_INIT')) {
    define('XIMG_INIT', true);
}

// Runtime environment tweaks
@ini_set('memory_limit', '128M');
@ini_set('max_execution_time', '60');

// Base application configuration
define('ROOT_DIR', __DIR__);
define('APP_NAME', 'XIMG Media Vault');
define('APP_VERSION', '1.0.0');
define('APP_SLOGAN', 'Web-Optimized Image Hosting for XSTREAM FLEX');

// Dynamic base URL detection
$protocol = (isset($_SERVER['HTTPS']) && ($_SERVER['HTTPS'] === 'on' || $_SERVER['HTTPS'] === '1')) || 
            (isset($_SERVER['HTTP_X_FORWARDED_PROTO']) && $_SERVER['HTTP_X_FORWARDED_PROTO'] === 'https') ? 'https://' : 'http://';
$host = $_SERVER['HTTP_HOST'] ?? 'localhost';
$scriptDir = rtrim(str_replace('\\', '/', dirname($_SERVER['SCRIPT_NAME'] ?? '')), '/');

// Adjust scriptDir if executed from a subfolder (e.g. /api/) relative to ROOT_DIR
$rootDir = str_replace('\\', '/', realpath(ROOT_DIR) ?: ROOT_DIR);
$scriptFile = str_replace('\\', '/', realpath($_SERVER['SCRIPT_FILENAME'] ?? '') ?: ($_SERVER['SCRIPT_FILENAME'] ?? ''));

if ($rootDir && $scriptFile && strpos($scriptFile, $rootDir) === 0) {
    $relDir = trim(substr(dirname($scriptFile), strlen($rootDir)), '/');
    if ($relDir !== '') {
        $relLen = strlen($relDir);
        if (substr($scriptDir, -$relLen) === $relDir) {
            $scriptDir = rtrim(substr($scriptDir, 0, -$relLen), '/');
        }
    }
}

// Additional fail-safe: strip trailing /api if present
if (preg_match('#/api$#i', $scriptDir)) {
    $scriptDir = preg_replace('#/api$#i', '', $scriptDir);
}

define('BASE_URL', $protocol . $host . ($scriptDir ? $scriptDir : ''));

// Directory paths
define('UPLOAD_DIR', ROOT_DIR . '/uploads');
define('THUMB_DIR', ROOT_DIR . '/uploads/thumbs');
define('DATA_DIR', ROOT_DIR . '/database');

// Ensure required directories exist safely
foreach ([UPLOAD_DIR, THUMB_DIR, DATA_DIR] as $dir) {
    if (!file_exists($dir)) {
        @mkdir($dir, 0755, true);
    }
}

// Upload & Image Optimization limits
define('MAX_FILE_SIZE', 25 * 1024 * 1024); // 25 MB max upload
define('WEBP_QUALITY', 82);                 // Target WebP compression quality (0-100)
define('THUMB_WIDTH', 400);                // Thumbnail max width
define('THUMB_HEIGHT', 400);               // Thumbnail max height
define('MAX_IMAGE_DIMENSION', 3840);       // Downscale images larger than 4K UHD

// Allowed upload MIME types
$ALLOWED_MIME_TYPES = [
    'image/jpeg',
    'image/jpg',
    'image/png',
    'image/gif',
    'image/webp',
    'image/bmp',
    'image/avif',
    'image/tiff',
    'image/x-icon',
    'image/vnd.microsoft.icon',
    'image/ico',
    'image/icon'
];

// Polyfill getallheaders() if missing in FastCGI/Nginx
if (!function_exists('getallheaders')) {
    function getallheaders() {
        $headers = [];
        foreach ($_SERVER as $name => $value) {
            if (substr($name, 0, 5) == 'HTTP_') {
                $headers[str_replace(' ', '-', ucwords(strtolower(str_replace('_', ' ', substr($name, 5)))))] = $value;
            }
        }
        return $headers;
    }
}

// CORS headers configuration
function set_cors_headers() {
    header("Access-Control-Allow-Origin: *");
    header("Access-Control-Allow-Methods: GET, POST, OPTIONS, DELETE");
    header("Access-Control-Allow-Headers: Content-Type, Authorization, X-API-Key, X-Requested-With");
    
    if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
        http_response_code(200);
        exit(0);
    }
}
