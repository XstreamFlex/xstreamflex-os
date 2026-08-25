<?php
require_once __DIR__ . '/../config/database.php';

$token = $_GET['token'] ?? null;
$url = $_GET['url'] ?? '/';

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

        $insertStmt = $pdo->prepare("INSERT INTO tracking_events (id, queue_job_id, contact_id, event_type, target_url, ip_address, user_agent) VALUES (?, ?, ?, 'click', ?, ?, ?)");
        $insertStmt->execute([$id, $job['id'], $job['contact_id'], $url, $ip, $ua]);
    }
}

header("Location: " . $url);
exit;
