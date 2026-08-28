<?php
header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');

require_once __DIR__ . '/../config/database.php';

$stmt = $pdo->query("SELECT c.*, s.name as site_name FROM contacts c LEFT JOIN sites s ON c.site_id = s.id ORDER BY c.created_at DESC");
$contacts = $stmt->fetchAll();

echo json_encode(['contacts' => $contacts]);
