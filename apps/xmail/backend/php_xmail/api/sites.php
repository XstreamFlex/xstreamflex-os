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

if ($method === 'GET') {
    try {
        $stmt = $pdo->query("
            SELECT s.*, 
                   (SELECT COUNT(*) FROM connected_emails ce WHERE ce.site_id = s.id) as linked_emails_count
            FROM sites s 
            ORDER BY s.created_at DESC
        ");
    } catch (Exception $e) {
        $stmt = $pdo->query("SELECT * FROM sites ORDER BY created_at DESC");
    }
    $sites = $stmt->fetchAll();
    foreach ($sites as &$site) {
        $site['metadata'] = !empty($site['site_metadata_json']) ? json_decode($site['site_metadata_json'], true) : [];
        if (empty($site['ecosystem_id'])) {
            $site['ecosystem_id'] = 'xsflex_eco_' . ($site['type'] ?? 'xsite') . '_legacy';
        }
    }
    echo json_encode(['sites' => $sites]);
    exit;
}

if ($method === 'POST') {
    $input = json_decode(file_get_contents('php://input'), true);
    $name = $input['name'] ?? null;
    $type = $input['type'] ?? 'xsite';
    $domain = $input['domain'] ?? null;
    $ecosystemId = $input['ecosystemId'] ?? null;
    $metadata = $input['metadata'] ?? [];

    if (!$name) {
        http_response_code(400);
        echo json_encode(['error' => 'Site name is required.']);
        exit;
    }

    $id = sprintf('%04x%04x-%04x-%04x-%04x-%04x%04x%04x',
        mt_rand(0, 0xffff), mt_rand(0, 0xffff),
        mt_rand(0, 0xffff),
        mt_rand(0, 0x0fff) | 0x4000,
        mt_rand(0, 0x3fff) | 0x8000,
        mt_rand(0, 0xffff), mt_rand(0, 0xffff), mt_rand(0, 0xffff)
    );

    $apiKey = 'xmail_' . $type . '_' . bin2hex(random_bytes(20));
    $webhookSecret = bin2hex(random_bytes(24));
    $finalEcosystemId = $ecosystemId ?: ('xsflex_eco_' . $type . '_' . bin2hex(random_bytes(12)));

    $siteMetadata = array_merge([
        'platform' => $type,
        'xmg_enabled' => ($type === 'xmg' || !empty($metadata['xmg_enabled'])),
        'xsite_sync' => true,
        'created_by' => 'XStreamFlex PHP Ecosystem Gateway'
    ], is_array($metadata) ? $metadata : []);

    $metadataJson = json_encode($siteMetadata);

    try {
        $stmt = $pdo->prepare("
            INSERT INTO sites (id, name, type, domain, api_key, webhook_secret, ecosystem_id, site_metadata_json) 
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        ");
        $stmt->execute([$id, $name, $type, $domain, $apiKey, $webhookSecret, $finalEcosystemId, $metadataJson]);
    } catch (Exception $e) {
        $stmt = $pdo->prepare("INSERT INTO sites (id, name, type, domain, api_key, webhook_secret) VALUES (?, ?, ?, ?, ?, ?)");
        $stmt->execute([$id, $name, $type, $domain, $apiKey, $webhookSecret]);
    }

    echo json_encode([
        'success' => true,
        'site' => [
            'id' => $id,
            'name' => $name,
            'type' => $type,
            'domain' => $domain,
            'apiKey' => $apiKey,
            'webhookSecret' => $webhookSecret,
            'ecosystemId' => $finalEcosystemId,
            'metadata' => $siteMetadata
        ]
    ]);
    exit;
}
