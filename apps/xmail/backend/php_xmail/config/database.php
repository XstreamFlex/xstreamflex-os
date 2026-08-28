<?php
// XMail PHP MySQL Database Connection

$db_host = 'localhost';
$db_port = '3306';
$db_user = 'xstreamf_db_b3d83828';
$db_pass = '8c96390e17f58537225f4f53';
$db_name = 'xstreamf_db_b3d83828';

// Allow environment variable overrides if available
if (file_exists(__DIR__ . '/../.env')) {
    $env = parse_ini_file(__DIR__ . '/../.env');
    if (!empty($env['MYSQL_HOST'])) $db_host = $env['MYSQL_HOST'];
    if (!empty($env['MYSQL_USER'])) $db_user = $env['MYSQL_USER'];
    if (!empty($env['MYSQL_PASSWORD'])) $db_pass = $env['MYSQL_PASSWORD'];
    if (!empty($env['MYSQL_DATABASE'])) $db_name = $env['MYSQL_DATABASE'];
}

try {
    $pdo = new PDO("mysql:host={$db_host};port={$db_port};dbname={$db_name};charset=utf8mb4", $db_user, $db_pass, [
        PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
    ]);
} catch (PDOException $e) {
    die(json_encode(['error' => 'Database Connection Failed: ' . $e->getMessage()]));
}

function init_schema($pdo) {
    $sql = "
    CREATE TABLE IF NOT EXISTS sites (
      id VARCHAR(64) PRIMARY KEY,
      name VARCHAR(255) NOT NULL,
      type VARCHAR(50) DEFAULT 'xsite',
      domain VARCHAR(255),
      api_key VARCHAR(128) UNIQUE NOT NULL,
      webhook_secret VARCHAR(128) NOT NULL,
      ecosystem_id VARCHAR(128),
      site_metadata_json TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS connected_emails (
      id VARCHAR(64) PRIMARY KEY,
      email VARCHAR(255) UNIQUE NOT NULL,
      sender_name VARCHAR(255) NOT NULL,
      provider VARCHAR(50) DEFAULT 'custom',
      smtp_host VARCHAR(255) NOT NULL,
      smtp_port INT DEFAULT 587,
      smtp_user VARCHAR(255),
      smtp_pass VARCHAR(255),
      smtp_secure TINYINT DEFAULT 0,
      is_verified TINYINT DEFAULT 1,
      site_id VARCHAR(64),
      ecosystem_identity_json TEXT,
      is_primary TINYINT DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS contacts (
      id VARCHAR(64) PRIMARY KEY,
      site_id VARCHAR(64),
      email VARCHAR(255) NOT NULL,
      first_name VARCHAR(255),
      last_name VARCHAR(255),
      phone VARCHAR(50),
      status VARCHAR(50) DEFAULT 'subscribed',
      custom_fields_json TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(site_id, email)
    );

    CREATE TABLE IF NOT EXISTS sequences (
      id VARCHAR(64) PRIMARY KEY,
      site_id VARCHAR(64) NOT NULL,
      name VARCHAR(255) NOT NULL,
      event_trigger VARCHAR(100) NOT NULL,
      is_active TINYINT DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS sequence_steps (
      id VARCHAR(64) PRIMARY KEY,
      sequence_id VARCHAR(64) NOT NULL,
      step_number INT NOT NULL DEFAULT 1,
      delay_minutes INT NOT NULL DEFAULT 0,
      subject VARCHAR(255) NOT NULL,
      body_html TEXT NOT NULL,
      sender_email_id VARCHAR(64),
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS queue_jobs (
      id VARCHAR(64) PRIMARY KEY,
      contact_id VARCHAR(64) NOT NULL,
      sequence_id VARCHAR(64),
      step_id VARCHAR(64),
      sender_email_id VARCHAR(64),
      recipient_email VARCHAR(255) NOT NULL,
      subject VARCHAR(255) NOT NULL,
      body_html TEXT NOT NULL,
      scheduled_at DATETIME NOT NULL,
      status VARCHAR(50) DEFAULT 'pending',
      tracking_token VARCHAR(128) UNIQUE NOT NULL,
      sent_at DATETIME,
      error_message TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS tracking_events (
      id VARCHAR(64) PRIMARY KEY,
      queue_job_id VARCHAR(64),
      contact_id VARCHAR(64),
      event_type VARCHAR(50) NOT NULL,
      target_url TEXT,
      ip_address VARCHAR(100),
      user_agent TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    ";
    $pdo->exec($sql);

    $migrations = [
        "ALTER TABLE sites ADD COLUMN ecosystem_id VARCHAR(128)",
        "ALTER TABLE sites ADD COLUMN site_metadata_json TEXT",
        "ALTER TABLE connected_emails ADD COLUMN provider VARCHAR(50) DEFAULT 'custom'",
        "ALTER TABLE connected_emails ADD COLUMN site_id VARCHAR(64)",
        "ALTER TABLE connected_emails ADD COLUMN ecosystem_identity_json TEXT",
        "ALTER TABLE connected_emails ADD COLUMN is_primary TINYINT DEFAULT 0"
    ];

    foreach ($migrations as $migration) {
        try {
            $pdo->exec($migration);
        } catch (PDOException $e) {
            // Ignored if column exists
        }
    }
}

// Auto init tables on boot
init_schema($pdo);
