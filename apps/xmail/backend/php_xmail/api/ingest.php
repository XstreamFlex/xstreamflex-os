<?php
header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, X-Site-Key');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    exit(0);
}

require_once __DIR__ . '/../config/database.php';

$headers = getallheaders();
$apiKey = $headers['X-Site-Key'] ?? $headers['x-site-key'] ?? $_REQUEST['site_key'] ?? null;

$input = json_decode(file_get_contents('php://input'), true) ?? $_POST;

$eventType = $input['event_type'] ?? null;
$email = $input['email'] ?? null;
$firstName = $input['first_name'] ?? null;
$lastName = $input['last_name'] ?? null;
$phone = $input['phone'] ?? null;

if (!$apiKey) {
    http_response_code(401);
    echo json_encode(['error' => 'Missing Site API Key in X-Site-Key header or site_key parameter.']);
    exit;
}

if (!$email || !$eventType) {
    http_response_code(400);
    echo json_encode(['error' => 'Both "email" and "event_type" parameters are required.']);
    exit;
}

// Authenticate Site API Key
$siteStmt = $pdo->prepare("SELECT * FROM sites WHERE api_key = ?");
$siteStmt->execute([$apiKey]);
$site = $siteStmt->fetch();

if (!$site) {
    http_response_code(403);
    echo json_encode(['error' => 'Invalid Site API Key.']);
    exit;
}

// Find or Create Contact
$contactStmt = $pdo->prepare("SELECT * FROM contacts WHERE site_id = ? AND email = ?");
$contactStmt->execute([$site['id'], $email]);
$contact = $contactStmt->fetch();

if ($contact) {
    $contactId = $contact['id'];
    $updateStmt = $pdo->prepare("UPDATE contacts SET first_name = COALESCE(?, first_name), last_name = COALESCE(?, last_name), phone = COALESCE(?, phone) WHERE id = ?");
    $updateStmt->execute([$firstName, $lastName, $phone, $contactId]);
} else {
    $contactId = sprintf('%04x%04x-%04x-%04x-%04x-%04x%04x%04x',
        mt_rand(0, 0xffff), mt_rand(0, 0xffff),
        mt_rand(0, 0xffff),
        mt_rand(0, 0x0fff) | 0x4000,
        mt_rand(0, 0x3fff) | 0x8000,
        mt_rand(0, 0xffff), mt_rand(0, 0xffff), mt_rand(0, 0xffff)
    );

    $insertStmt = $pdo->prepare("INSERT INTO contacts (id, site_id, email, first_name, last_name, phone, status) VALUES (?, ?, ?, ?, ?, ?, 'subscribed')");
    $insertStmt->execute([$contactId, $site['id'], $email, $firstName, $lastName, $phone]);
}

// Trigger Active Autoresponder Sequences for Event
$seqStmt = $pdo->prepare("SELECT * FROM sequences WHERE site_id = ? AND event_trigger = ? AND is_active = 1");
$seqStmt->execute([$site['id'], $eventType]);
$sequences = $seqStmt->fetchAll();

$jobsQueued = 0;

foreach ($sequences as $seq) {
    $stepStmt = $pdo->prepare("SELECT * FROM sequence_steps WHERE sequence_id = ? ORDER BY step_number ASC");
    $stepStmt->execute([$seq['id']]);
    $steps = $stepStmt->fetchAll();

    foreach ($steps as $step) {
        $delay = (int)($step['delay_minutes'] ?? 0);
        $scheduledAt = date('Y-m-d H:i:s', strtotime("+{$delay} minutes"));

        $jobId = sprintf('%04x%04x-%04x-%04x-%04x-%04x%04x%04x',
            mt_rand(0, 0xffff), mt_rand(0, 0xffff), mt_rand(0, 0xffff),
            mt_rand(0, 0x0fff) | 0x4000, mt_rand(0, 0x3fff) | 0x8000,
            mt_rand(0, 0xffff), mt_rand(0, 0xffff), mt_rand(0, 0xffff)
        );

        $trackingToken = bin2hex(random_bytes(24));

        // Personalization replacements
        $subject = str_replace(['{{first_name}}', '{{site_name}}'], [$firstName ?? 'there', $site['name']], $step['subject']);
        $body = str_replace(['{{first_name}}', '{{site_name}}'], [$firstName ?? 'there', $site['name']], $step['body_html']);

        $queueStmt = $pdo->prepare("INSERT INTO queue_jobs (id, contact_id, sequence_id, step_id, recipient_email, subject, body_html, scheduled_at, status, tracking_token) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?)");
        $queueStmt->execute([$jobId, $contactId, $seq['id'], $step['id'], $email, $subject, $body, $scheduledAt, $trackingToken]);

        $jobsQueued++;
    }
}

echo json_encode([
    'success' => true,
    'message' => "Event '{$eventType}' ingested successfully for {$email}.",
    'site' => $site['name'],
    'jobsQueued' => $jobsQueued
]);
