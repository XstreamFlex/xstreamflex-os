<?php
// Transparent 1x1 GIF Pixel
header('Content-Type: image/gif');
header('Cache-Control: no-store, no-cache, must-revalidate, private');
header('Pragma: no-cache');
header('Expires: 0');

echo base64_decode('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7');

require_once __DIR__ . '/../config/database.php';

$token = $_GET['token'] ?? null;

if ($token) {
    $stmt = $pdo->prepare("SELECT * FROM queue_jobs WHERE tracking_token = ?");
    $stmt->execute([$token]);
    $job = $stmt->fetch();

    if ($job) {
        $id = sprintf('%04x%04x-%04x-%04x-%04x-%04x%04x%04x',
            mt_rand(0, 0xffff), mt_rand(0, 0xffff), mt_rand(0, 0xffff),
            mt_rand(0, 0x0fff) | 0x4000, mt_rand(0, 0x3fff) | 0x8000,
            mt_rand(0, 0xffff), mt_rand(0, 0xffff), mt_rand(0, 0xffff)
        );
        $ip = $_SERVER['REMOTE_ADDR'] ?? '';
        $ua = $_SERVER['HTTP_USER_AGENT'] ?? '';

        $insertStmt = $pdo->prepare("INSERT INTO tracking_events (id, queue_job_id, contact_id, event_type, ip_address, user_agent) VALUES (?, ?, ?, 'open', ?, ?)");
        $insertStmt->execute([$id, $job['id'], $job['contact_id'], $ip, $ua]);
    }
}
