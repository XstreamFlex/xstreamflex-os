<?php
require_once __DIR__ . '/config/database.php';

$email = $_GET['email'] ?? null;

if ($email) {
    $stmt = $pdo->prepare("UPDATE contacts SET status = 'unsubscribed' WHERE email = ?");
    $stmt->execute([$email]);
}
?>
<!DOCTYPE html>
<html>
<head>
  <title>Unsubscribed</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; display: flex; justify-content: center; align-items: center; min-height: 100vh; background: #f4f6f8; margin: 0; }
    .card { background: white; padding: 40px; border-radius: 12px; box-shadow: 0 4px 12px rgba(0,0,0,0.08); text-align: center; max-width: 420px; }
    h2 { color: #1e293b; margin-top: 0; }
    p { color: #64748b; line-height: 1.5; }
    .badge { display: inline-block; background: #fee2e2; color: #991b1b; padding: 6px 12px; border-radius: 20px; font-weight: 600; font-size: 14px; margin-bottom: 16px; }
  </style>
</head>
<body>
  <div class="card">
    <div class="badge">Unsubscribed</div>
    <h2>Subscription Updated</h2>
    <p>The email address <strong><?php echo htmlspecialchars($email ?? ''); ?></strong> has been unsubscribed from future automated messages.</p>
  </div>
</body>
</html>
