-- XMail Database Schema for MySQL & SQLite

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
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (site_id) REFERENCES sites(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS sequence_steps (
  id VARCHAR(64) PRIMARY KEY,
  sequence_id VARCHAR(64) NOT NULL,
  step_number INT NOT NULL DEFAULT 1,
  delay_minutes INT NOT NULL DEFAULT 0,
  subject VARCHAR(255) NOT NULL,
  body_html TEXT NOT NULL,
  sender_email_id VARCHAR(64),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (sequence_id) REFERENCES sequences(id) ON DELETE CASCADE
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
