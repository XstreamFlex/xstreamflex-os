<?php
header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, X-Site-Key, X-Ecosystem-Key, X-XMG-Key');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    exit(0);
}

require_once __DIR__ . '/../config/database.php';

$method = $_SERVER['REQUEST_METHOD'];
$action = $_GET['action'] ?? 'identity';

if ($method === 'GET' || $action === 'identity') {
    $keyOrEmail = $_GET['key'] ?? $_GET['email'] ?? $_GET['id'] ?? ($_SERVER['PATH_INFO'] ?? '');
    $keyOrEmail = trim($keyOrEmail, '/');

    if (!$keyOrEmail) {
        http_response_code(400);
        echo json_encode(['error' => 'Key or email parameter is required.']);
        exit;
    }

    $stmt = $pdo->prepare("SELECT * FROM sites WHERE api_key = ? OR ecosystem_id = ? OR id = ?");
    $stmt->execute([$keyOrEmail, $keyOrEmail, $keyOrEmail]);
    $site = $stmt->fetch();

    $stmtEmail = $pdo->prepare("SELECT * FROM connected_emails WHERE email = ? OR id = ?");
    $stmtEmail->execute([$keyOrEmail, $keyOrEmail]);
    $emailAccount = $stmtEmail->fetch();

    if (!$site && !$emailAccount) {
        http_response_code(404);
        echo json_encode(['error' => 'No XStreamFlex identity found matching key or email.']);
        exit;
    }

    $linkedEmails = [];
    $activeSequences = [];

    if ($site) {
        $stmtLinked = $pdo->prepare("SELECT id, email, sender_name, provider, is_verified, is_primary FROM connected_emails WHERE site_id = ? OR email = ?");
        $stmtLinked->execute([$site['id'], $site['domain'] ?? '']);
        $linkedEmails = $stmtLinked->fetchAll();

        $stmtSeq = $pdo->prepare("SELECT id, name, event_trigger, is_active FROM sequences WHERE site_id = ?");
        $stmtSeq->execute([$site['id']]);
        $activeSequences = $stmtSeq->fetchAll();
    }

    echo json_encode([
        'success' => true,
        'ecosystemIdentity' => [
            'site' => $site ? [
                'id' => $site['id'],
                'name' => $site['name'],
                'type' => $site['type'],
                'domain' => $site['domain'],
                'apiKey' => $site['api_key'],
                'ecosystemId' => $site['ecosystem_id'] ?? null,
                'metadata' => !empty($site['site_metadata_json']) ? json_decode($site['site_metadata_json'], true) : []
            ] : null,
            'emailAccount' => $emailAccount ? [
                'id' => $emailAccount['id'],
                'email' => $emailAccount['email'],
                'senderName' => $emailAccount['sender_name'],
                'provider' => $emailAccount['provider'] ?? 'custom',
                'isVerified' => (bool)$emailAccount['is_verified'],
                'siteId' => $emailAccount['site_id'] ?? null
            ] : null,
            'linkedEmails' => $linkedEmails,
            'activeSequences' => $activeSequences,
            'xmgIntegration' => [
                'enabled' => true,
                'supportedEvents' => ['lead.signup', 'order.completed', 'xmg.lead', 'xmg.media_event', 'xmg.conversion']
            ]
        ]
    ]);
    exit;
}

if ($method === 'POST') {
    $input = json_decode(file_get_contents('php://input'), true);
    $site = $input['site'] ?? null;
    $emailAccount = $input['emailAccount'] ?? null;

    if (!$site || empty($site['name'])) {
        http_response_code(400);
        echo json_encode(['error' => 'Site payload with name is required for ecosystem sync.']);
        exit;
    }

    $type = $site['type'] ?? 'xsite';
    $siteId = $site['id'] ?? sprintf('%04x%04x-%04x-%04x-%04x-%04x%04x%04x', mt_rand(0, 0xffff), mt_rand(0, 0xffff), mt_rand(0, 0xffff), mt_rand(0, 0x0fff) | 0x4000, mt_rand(0, 0x3fff) | 0x8000, mt_rand(0, 0xffff), mt_rand(0, 0xffff), mt_rand(0, 0xffff));
    $apiKey = $site['apiKey'] ?? ('xmail_' . $type . '_' . bin2hex(random_bytes(20)));
    $webhookSecret = $site['webhookSecret'] ?? bin2hex(random_bytes(24));
    $ecosystemId = $site['ecosystemId'] ?? ('xsflex_eco_' . $type . '_' . bin2hex(random_bytes(12)));
    $metadataJson = json_encode($site['metadata'] ?? ['platform' => $type, 'synced_at' => date('Y-m-d H:i:s')]);

    $stmtCheck = $pdo->prepare("SELECT * FROM sites WHERE api_key = ? OR ecosystem_id = ? OR id = ?");
    $stmtCheck->execute([$apiKey, $ecosystemId, $siteId]);
    $existing = $stmtCheck->fetch();

    if ($existing) {
        $stmtUp = $pdo->prepare("UPDATE sites SET name = ?, type = ?, domain = ?, site_metadata_json = ? WHERE id = ?");
        $stmtUp->execute([$site['name'], $type, $site['domain'] ?? null, $metadataJson, $existing['id']]);
        $siteId = $existing['id'];
    } else {
        $stmtIns = $pdo->prepare("INSERT INTO sites (id, name, type, domain, api_key, webhook_secret, ecosystem_id, site_metadata_json) VALUES (?, ?, ?, ?, ?, ?, ?, ?)");
        $stmtIns->execute([$siteId, $site['name'], $type, $site['domain'] ?? null, $apiKey, $webhookSecret, $ecosystemId, $metadataJson]);
    }

    $syncedEmailId = null;
    if (!empty($emailAccount['email'])) {
        $stmtEmCheck = $pdo->prepare("SELECT * FROM connected_emails WHERE email = ?");
        $stmtEmCheck->execute([$emailAccount['email']]);
        $existingEm = $stmtEmCheck->fetch();

        if ($existingEm) {
            $syncedEmailId = $existingEm['id'];
            $stmtEmUp = $pdo->prepare("UPDATE connected_emails SET site_id = ? WHERE id = ?");
            $stmtEmUp->execute([$siteId, $syncedEmailId]);
        } else {
            $syncedEmailId = sprintf('%04x%04x-%04x-%04x-%04x-%04x%04x%04x', mt_rand(0, 0xffff), mt_rand(0, 0xffff), mt_rand(0, 0xffff), mt_rand(0, 0x0fff) | 0x4000, mt_rand(0, 0x3fff) | 0x8000, mt_rand(0, 0xffff), mt_rand(0, 0xffff), mt_rand(0, 0xffff));
            $stmtEmIns = $pdo->prepare("INSERT INTO connected_emails (id, email, sender_name, provider, smtp_host, smtp_port, smtp_user, smtp_pass, smtp_secure, is_verified, site_id, is_primary) VALUES (?, ?, ?, 'custom', 'smtp.domain.com', 587, ?, '', 0, 1, ?, 1)");
            $stmtEmIns->execute([$syncedEmailId, $emailAccount['email'], $emailAccount['senderName'] ?? $site['name'], $emailAccount['email'], $siteId]);
        }
    }

    echo json_encode([
        'success' => true,
        'message' => 'XStreamFlex Ecosystem Identity housing and sync completed in PHP backend.',
        'identity' => [
            'siteId' => $siteId,
            'siteName' => $site['name'],
            'type' => $type,
            'apiKey' => $apiKey,
            'ecosystemId' => $ecosystemId,
            'syncedEmailId' => $syncedEmailId
        ]
    ]);
    exit;
}
