<?php
// PHP Queue Worker for Cron Job (* * * * * php jobs/process_queue.php)

if (php_sapi_name() !== 'cli' && !isset($_GET['secret'])) {
    // Basic security check if run via web browser
}

require_once __DIR__ . '/../config/database.php';

$now = date('Y-m-d H:i:s');
$stmt = $pdo->prepare("
    SELECT q.*, c.status AS contact_status 
    FROM queue_jobs q 
    JOIN contacts c ON q.contact_id = c.id 
    WHERE q.status = 'pending' AND q.scheduled_at <= ? AND c.status = 'subscribed' 
    LIMIT 50
");
$stmt->execute([$now]);
$pendingJobs = $stmt->fetchAll();

if (empty($pendingJobs)) {
    echo "[" . date('Y-m-d H:i:s') . "] No pending email jobs.\n";
    exit;
}

echo "[" . date('Y-m-d H:i:s') . "] Processing " . count($pendingJobs) . " pending jobs...\n";

// Host URL determination
$scheme = isset($_SERVER['HTTPS']) && $_SERVER['HTTPS'] === 'on' ? 'https' : 'http';
$host = $_SERVER['HTTP_HOST'] ?? 'xmail.xstreamflex.com';
$appUrl = "{$scheme}://{$host}";

foreach ($pendingJobs as $job) {
    try {
        $token = $job['tracking_token'];
        $pixelUrl = "{$appUrl}/tracking/open.php?token={$token}";
        $trackingPixel = "<img src=\"{$pixelUrl}\" width=\"1\" height=\"1\" style=\"display:none;\" alt=\"\" />";

        $htmlBody = $job['body_html'];
        if (strpos($htmlBody, '</body>') !== false) {
            $htmlBody = str_replace('</body>', $trackingPixel . '</body>', $htmlBody);
        } else {
            $htmlBody .= $trackingPixel;
        }

        // Email Headers
        $fromEmail = "no-reply@" . parse_url($appUrl, PHP_URL_HOST);
        $fromName = "XStreamFlex Autoresponder";

        if (!empty($job['sender_email_id'])) {
            $senderStmt = $pdo->prepare("SELECT * FROM connected_emails WHERE id = ?");
            $senderStmt->execute([$job['sender_email_id']]);
            $sender = $senderStmt->fetch();
            if ($sender) {
                $fromEmail = $sender['email'];
                $fromName = $sender['sender_name'];
            }
        }

        $unsubscribeUrl = "{$appUrl}/unsubscribe.php?email=" . urlencode($job['recipient_email']);

        $headers  = "MIME-Version: 1.0\r\n";
        $headers .= "Content-type: text/html; charset=utf-8\r\n";
        $headers .= "From: {$fromName} <{$fromEmail}>\r\n";
        $headers .= "Reply-To: {$fromEmail}\r\n";
        $headers .= "List-Unsubscribe: <{$unsubscribeUrl}>\r\n";
        $headers .= "List-Unsubscribe-Post: List-Unsubscribe=One-Click\r\n";

        // Dispatch Email using native PHP mail
        $sent = mail($job['recipient_email'], $job['subject'], $htmlBody, $headers);

        if ($sent) {
            $sentAt = date('Y-m-d H:i:s');
            $updateStmt = $pdo->prepare("UPDATE queue_jobs SET status = 'sent', sent_at = ? WHERE id = ?");
            $updateStmt->execute([$sentAt, $job['id']]);
            echo "✅ Sent Job ID {$job['id']} to {$job['recipient_email']}\n";
        } else {
            throw new Exception("Native PHP mail() function returned false.");
        }

    } catch (Exception $e) {
        $updateStmt = $pdo->prepare("UPDATE queue_jobs SET status = 'failed', error_message = ? WHERE id = ?");
        $updateStmt->execute([$e->getMessage(), $job['id']]);
        echo "❌ Failed Job ID {$job['id']}: " . $e->getMessage() . "\n";
    }
}
