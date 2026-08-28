<?php
header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    exit(0);
}

require_once __DIR__ . '/../config/database.php';

$method = $_SERVER['REQUEST_METHOD'];

if ($method === 'GET') {
    $stmt = $pdo->query("SELECT s.*, st.name as site_name FROM sequences s LEFT JOIN sites st ON s.site_id = st.id ORDER BY s.created_at DESC");
    $sequences = $stmt->fetchAll();

    foreach ($sequences as &$seq) {
        $stepStmt = $pdo->prepare("SELECT * FROM sequence_steps WHERE sequence_id = ? ORDER BY step_number ASC");
        $stepStmt->execute([$seq['id']]);
        $seq['steps'] = $stepStmt->fetchAll();
    }

    echo json_encode(['sequences' => $sequences]);
    exit;
}

if ($method === 'POST') {
    $input = json_decode(file_get_contents('php://input'), true);
    $action = $_GET['action'] ?? 'create_sequence';

    if ($action === 'create_step') {
        $sequenceId = $input['sequenceId'] ?? null;
        $subject = $input['subject'] ?? null;
        $bodyHtml = $input['bodyHtml'] ?? null;
        $delayMinutes = (int)($input['delayMinutes'] ?? 0);
        $stepNumber = (int)($input['stepNumber'] ?? 1);

        if (!$sequenceId || !$subject || !$bodyHtml) {
            http_response_code(400);
            echo json_encode(['error' => 'sequenceId, subject, and bodyHtml are required.']);
            exit;
        }

        $stepId = sprintf('%04x%04x-%04x-%04x-%04x-%04x%04x%04x',
            mt_rand(0, 0xffff), mt_rand(0, 0xffff),
            mt_rand(0, 0xffff),
            mt_rand(0, 0x0fff) | 0x4000,
            mt_rand(0, 0x3fff) | 0x8000,
            mt_rand(0, 0xffff), mt_rand(0, 0xffff), mt_rand(0, 0xffff)
        );

        $stmt = $pdo->prepare("INSERT INTO sequence_steps (id, sequence_id, step_number, delay_minutes, subject, body_html) VALUES (?, ?, ?, ?, ?, ?)");
        $stmt->execute([$stepId, $sequenceId, $stepNumber, $delayMinutes, $subject, $bodyHtml]);

        echo json_encode(['success' => true, 'step' => ['id' => $stepId, 'sequenceId' => $sequenceId, 'subject' => $subject]]);
        exit;
    } else {
        $siteId = $input['siteId'] ?? null;
        $name = $input['name'] ?? null;
        $eventTrigger = $input['eventTrigger'] ?? null;

        if (!$siteId || !$name || !$eventTrigger) {
            http_response_code(400);
            echo json_encode(['error' => 'siteId, name, and eventTrigger are required.']);
            exit;
        }

        $id = sprintf('%04x%04x-%04x-%04x-%04x-%04x%04x%04x',
            mt_rand(0, 0xffff), mt_rand(0, 0xffff),
            mt_rand(0, 0xffff),
            mt_rand(0, 0x0fff) | 0x4000,
            mt_rand(0, 0x3fff) | 0x8000,
            mt_rand(0, 0xffff), mt_rand(0, 0xffff), mt_rand(0, 0xffff)
        );

        $stmt = $pdo->prepare("INSERT INTO sequences (id, site_id, name, event_trigger) VALUES (?, ?, ?, ?)");
        $stmt->execute([$id, $siteId, $name, $eventTrigger]);

        echo json_encode(['success' => true, 'sequence' => ['id' => $id, 'siteId' => $siteId, 'name' => $name, 'eventTrigger' => $eventTrigger]]);
        exit;
    }
}
