<?php
header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, DELETE, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, X-Site-Key, X-Ecosystem-Key, X-XMG-Key');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    exit(0);
}

require_once __DIR__ . '/../config/database.php';

$method = $_SERVER['REQUEST_METHOD'];

if ($method === 'GET') {
    try {
        $stmt = $pdo->query("
            SELECT ce.id, ce.email, ce.sender_name, ce.provider, ce.smtp_host, ce.smtp_port, ce.is_verified, 
                   ce.site_id, ce.ecosystem_identity_json, ce.is_primary, ce.created_at,
                   s.name as site_name, s.type as site_type, s.ecosystem_id as site_ecosystem_id
            FROM connected_emails ce
            LEFT JOIN sites s ON ce.site_id = s.id
            ORDER BY ce.created_at DESC
        ");
    } catch (Exception $e) {
        $stmt = $pdo->query("SELECT id, email, sender_name, smtp_host, smtp_port, is_verified, created_at FROM connected_emails ORDER BY created_at DESC");
    }
    $emails = $stmt->fetchAll();
    foreach ($emails as &$e) {
        $e['identity'] = !empty($e['ecosystem_identity_json']) ? json_decode($e['ecosystem_identity_json'], true) : [];
    }
    echo json_encode(['emails' => $emails]);
    exit;
}

if ($method === 'DELETE') {
    $pathParts = explode('/', trim($_SERVER['PATH_INFO'] ?? '', '/'));
    $id = $_GET['id'] ?? end($pathParts);
    if ($id) {
        $stmt = $pdo->prepare("DELETE FROM connected_emails WHERE id = ?");
        $stmt->execute([$id]);
        echo json_encode(['success' => true, 'message' => 'Email account unlinked successfully.']);
    } else {
        http_response_code(400);
        echo json_encode(['error' => 'Missing account ID.']);
    }
    exit;
}

if ($method === 'POST') {
    $input = json_decode(file_get_contents('php://input'), true);
    $email = $input['email'] ?? null;
    $senderName = $input['senderName'] ?? null;
    $inputProvider = $input['provider'] ?? 'custom';
    $smtpHost = $input['smtpHost'] ?? null;
    $smtpPort = $input['smtpPort'] ?? 587;
    $smtpUser = $input['smtpUser'] ?? $email;
    $smtpPass = $input['smtpPass'] ?? '';
    $smtpSecure = !empty($input['smtpSecure']) ? 1 : 0;
    $siteId = $input['siteId'] ?? null;
    $isPrimary = !empty($input['isPrimary']) ? 1 : 0;
    $identity = $input['identity'] ?? [];

    if (!$email || !$senderName) {
        http_response_code(400);
        echo json_encode(['error' => 'Email address and Sender Name are required.']);
        exit;
    }

    $domain = strtolower(explode('@', $email)[1] ?? '');
    $provider = $inputProvider;

    if ($provider === 'gmail' || (!$smtpHost && in_array($domain, ['gmail.com', 'googlemail.com']))) {
        $provider = 'gmail';
        $smtpHost = $smtpHost ?: 'smtp.gmail.com';
    } elseif ($provider === 'outlook' || (!$smtpHost && in_array($domain, ['outlook.com', 'hotmail.com', 'live.com', 'msn.com', 'office365.com', 'windowslive.com']))) {
        $provider = 'outlook';
        $smtpHost = $smtpHost ?: 'smtp.office365.com';
    } elseif ($provider === 'apple' || (!$smtpHost && in_array($domain, ['icloud.com', 'me.com', 'mac.com']))) {
        $provider = 'apple';
        $smtpHost = $smtpHost ?: 'smtp.mail.me.com';
    } elseif ($provider === 'yahoo' || (!$smtpHost && in_array($domain, ['yahoo.com', 'ymail.com', 'rocketmail.com']))) {
        $provider = 'yahoo';
        $smtpHost = $smtpHost ?: 'smtp.mail.yahoo.com';
    } elseif (!$smtpHost) {
        $smtpHost = 'smtp.' . $domain;
    }

    $id = sprintf('%04x%04x-%04x-%04x-%04x-%04x%04x%04x',
        mt_rand(0, 0xffff), mt_rand(0, 0xffff),
        mt_rand(0, 0xffff),
        mt_rand(0, 0x0fff) | 0x4000,
        mt_rand(0, 0x3fff) | 0x8000,
        mt_rand(0, 0xffff), mt_rand(0, 0xffff), mt_rand(0, 0xffff)
    );

    $ecosystemIdentity = array_merge([
        'sender_identity' => $senderName,
        'assigned_site_id' => $siteId,
        'xmg_routing' => true,
        'xsite_signature' => "Sent via XStreamFlex XMail for {$email}"
    ], is_array($identity) ? $identity : []);

    $identityJson = json_encode($ecosystemIdentity);

    try {
        $stmt = $pdo->prepare("
            INSERT INTO connected_emails 
            (id, email, sender_name, provider, smtp_host, smtp_port, smtp_user, smtp_pass, smtp_secure, is_verified, site_id, ecosystem_identity_json, is_primary) 
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?)
        ");
        $stmt->execute([$id, $email, $senderName, $provider, $smtpHost, (int)$smtpPort, $smtpUser, $smtpPass, $smtpSecure, $siteId, $identityJson, $isPrimary]);
    } catch (Exception $e) {
        $stmt = $pdo->prepare("INSERT INTO connected_emails (id, email, sender_name, smtp_host, smtp_port, smtp_user, smtp_pass, smtp_secure, is_verified) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1)");
        $stmt->execute([$id, $email, $senderName, $smtpHost, (int)$smtpPort, $smtpUser, $smtpPass, $smtpSecure]);
    }

    echo json_encode([
        'success' => true,
        'message' => 'Email account linked and identity housed successfully.',
        'connectedEmail' => [
            'id' => $id,
            'email' => $email,
            'senderName' => $senderName,
            'provider' => $provider,
            'smtpHost' => $smtpHost,
            'siteId' => $siteId,
            'isPrimary' => (bool)$isPrimary,
            'ecosystemIdentity' => $ecosystemIdentity
        ]
    ]);
    exit;
}
