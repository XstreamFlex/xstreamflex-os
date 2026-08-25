<?php
header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');

require_once __DIR__ . '/../config/database.php';

$sitesCount = $pdo->query("SELECT COUNT(*) FROM sites")->fetchColumn();
$contactsCount = $pdo->query("SELECT COUNT(*) FROM contacts")->fetchColumn();
$sentJobs = $pdo->query("SELECT COUNT(*) FROM queue_jobs WHERE status = 'sent'")->fetchColumn();
$pendingJobs = $pdo->query("SELECT COUNT(*) FROM queue_jobs WHERE status = 'pending'")->fetchColumn();
$opensCount = $pdo->query("SELECT COUNT(*) FROM tracking_events WHERE event_type = 'open'")->fetchColumn();
$clicksCount = $pdo->query("SELECT COUNT(*) FROM tracking_events WHERE event_type = 'click'")->fetchColumn();

echo json_encode([
    'stats' => [
        'totalSites' => (int)$sitesCount,
        'totalContacts' => (int)$contactsCount,
        'emailsSent' => (int)$sentJobs,
        'emailsPending' => (int)$pendingJobs,
        'totalOpens' => (int)$opensCount,
        'totalClicks' => (int)$clicksCount
    ]
]);
