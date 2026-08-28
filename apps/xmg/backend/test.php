<?php
/**
 * XIMG - Server Diagnostic Script
 * Visit xmg.xstreamflex.com/test.php to verify server environment capabilities
 */

error_reporting(E_ALL);
ini_set('display_errors', 1);

require_once __DIR__ . '/config.php';

?>
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <title>XIMG Diagnostics — Server Capability Test</title>
    <style>
        body { font-family: monospace; background: #090a0f; color: #34d399; padding: 30px; line-height: 1.6; }
        .card { background: #11131e; border: 1px solid #1e293b; padding: 20px; border-radius: 12px; max-width: 650px; margin: 0 auto; }
        h1 { color: #fff; border-bottom: 1px solid #1e293b; padding-bottom: 10px; margin-top: 0; }
        .ok { color: #22c55e; font-weight: bold; }
        .warn { color: #f59e0b; font-weight: bold; }
        .err { color: #ef4444; font-weight: bold; }
    </style>
</head>
<body>
    <div class="card">
        <h1>⚡ XIMG Server Diagnostics</h1>
        <p><strong>PHP Version:</strong> <?= PHP_VERSION ?> (<span class="ok">Supported</span>)</p>

        <h3>Extension Checks:</h3>
        <ul>
            <li>
                GD Library: 
                <?php if (extension_loaded('gd')): ?>
                    <span class="ok">Enabled</span>
                    (WebP Support: <?= function_exists('imagewebp') ? '<span class="ok">YES</span>' : '<span class="warn">NO (JPEG Fallback)</span>' ?>)
                <?php else: ?>
                    <span class="err">DISABLED (GD is required for image optimization)</span>
                <?php endif; ?>
            </li>
            <li>
                PDO SQLite: 
                <?= extension_loaded('pdo_sqlite') ? '<span class="ok">Enabled</span>' : '<span class="warn">Disabled (JSON File Database Fallback Active)</span>' ?>
            </li>
            <li>
                EXIF Extension: 
                <?= extension_loaded('exif') ? '<span class="ok">Enabled</span>' : '<span class="warn">Disabled (Auto-Rotate Disabled)</span>' ?>
            </li>
            <li>
                cURL Extension: 
                <?= extension_loaded('curl') ? '<span class="ok">Enabled</span>' : '<span class="warn">Disabled (URL fetch fallback active)</span>' ?>
            </li>
        </ul>

        <h3>Directory Write Permissions:</h3>
        <ul>
            <?php
            $dirs = [
                'Uploads Directory' => UPLOAD_DIR,
                'Thumbs Directory'  => THUMB_DIR,
                'Database Directory' => DATA_DIR
            ];
            foreach ($dirs as $label => $path) {
                $writable = is_writable($path) || @mkdir($path, 0755, true);
                echo "<li>{$label}: " . ($writable ? '<span class="ok">Writable</span>' : '<span class="err">Not Writable</span>') . "</li>";
            }
            ?>
        </ul>

        <p><a href="index.php" style="color: #38bdf8;">&rarr; Continue to XIMG Web Application</a></p>
    </div>
</body>
</html>
