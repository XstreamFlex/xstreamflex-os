const express = require('express');
const crypto = require('crypto');
const db = require('../config/database');
const { verifyConnection } = require('../services/mailer');
const { triggerEventSequences } = require('../services/queue');
const { requireUnifiedAuth } = require('../services/jwtAuth');

const router = express.Router();
router.use(requireUnifiedAuth);

// Helper: Ensure ecosystem ID format
function generateEcosystemId(type = 'xsite') {
  return `xsflex_eco_${type}_` + crypto.randomBytes(16).toString('hex');
}

// Helper: Generate structured API key
function generateApiKey(type = 'xsite') {
  return `xmail_${type}_` + crypto.randomBytes(24).toString('hex');
}

// ==========================================
// 1. XSITE, EZSITE & XMG IDENTITY & SITES MANAGEMENT
// ==========================================

// Register or update a saved site with Ecosystem Identity (Xsite, EZsite, XMG)
router.post('/sites', async (req, res) => {
  try {
    const { name, type = 'xsite', domain, ecosystemId, metadata = {} } = req.body;
    if (!name) {
      return res.status(400).json({ error: 'Site name is required.' });
    }

    const id = crypto.randomUUID();
    const apiKey = generateApiKey(type);
    const webhookSecret = crypto.randomBytes(32).toString('hex');
    const finalEcosystemId = ecosystemId || generateEcosystemId(type);

    const siteMetadata = {
      platform: type,
      xmg_enabled: type === 'xmg' || metadata.xmg_enabled === true,
      xsite_sync: true,
      created_by: 'XStreamFlex Ecosystem Gateway',
      ...metadata
    };

    const metadataJson = JSON.stringify(siteMetadata);

    try {
      await db.query(
        `INSERT INTO sites (id, name, type, domain, api_key, webhook_secret, ecosystem_id, site_metadata_json)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [id, name, type, domain || null, apiKey, webhookSecret, finalEcosystemId, metadataJson]
      );
    } catch (dbErr) {
      // Fallback query if column missing during edge case
      await db.query(
        `INSERT INTO sites (id, name, type, domain, api_key, webhook_secret) VALUES (?, ?, ?, ?, ?, ?)`,
        [id, name, type, domain || null, apiKey, webhookSecret]
      );
    }

    res.status(201).json({
      success: true,
      message: `Site identity for "${name}" synced with XStreamFlex ecosystem.`,
      site: {
        id,
        name,
        type,
        domain,
        apiKey,
        webhookSecret,
        ecosystemId: finalEcosystemId,
        metadata: siteMetadata
      }
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// List all registered sites with Ecosystem & XMG identity status
router.get('/sites', async (req, res) => {
  try {
    let sites = [];
    try {
      sites = await db.query(`
        SELECT s.*, 
               (SELECT COUNT(*) FROM connected_emails ce WHERE ce.site_id = s.id) as linked_emails_count
        FROM sites s 
        ORDER BY s.created_at DESC
      `);
    } catch (e) {
      sites = await db.query('SELECT * FROM sites ORDER BY created_at DESC');
    }

    const enrichedSites = sites.map(s => {
      let parsedMetadata = {};
      try {
        parsedMetadata = s.site_metadata_json ? JSON.parse(s.site_metadata_json) : {};
      } catch (err) {
        parsedMetadata = {};
      }
      return {
        ...s,
        ecosystem_id: s.ecosystem_id || `xsflex_eco_${s.type || 'xsite'}_legacy`,
        metadata: parsedMetadata
      };
    });

    res.json({ sites: enrichedSites });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ==========================================
// 2. EMAIL LINKING & ECOSYSTEM IDENTITY HOUSE
// ==========================================

function detectProviderAndHost(email, explicitProvider, explicitHost) {
  let provider = explicitProvider || 'custom';
  let host = explicitHost;
  let defaultPort = 587;

  const domain = (email.split('@')[1] || '').toLowerCase();

  if (provider === 'gmail' || (!explicitHost && (domain === 'gmail.com' || domain === 'googlemail.com'))) {
    provider = 'gmail';
    host = host || 'smtp.gmail.com';
  } else if (provider === 'outlook' || (!explicitHost && ['outlook.com', 'hotmail.com', 'live.com', 'msn.com', 'office365.com', 'windowslive.com'].includes(domain))) {
    provider = 'outlook';
    host = host || 'smtp.office365.com';
  } else if (provider === 'apple' || (!explicitHost && ['icloud.com', 'me.com', 'mac.com'].includes(domain))) {
    provider = 'apple';
    host = host || 'smtp.mail.me.com';
  } else if (provider === 'yahoo' || (!explicitHost && ['yahoo.com', 'ymail.com', 'rocketmail.com'].includes(domain))) {
    provider = 'yahoo';
    host = host || 'smtp.mail.yahoo.com';
  } else if (!host) {
    host = `smtp.${domain}`;
  }

  return { provider, host, defaultPort };
}

// Connect a new Email address & house site/XMG identity
router.post('/emails/connect', async (req, res) => {
  try {
    const {
      email,
      senderName,
      provider: inputProvider,
      smtpHost,
      smtpPort = 587,
      smtpUser,
      smtpPass,
      smtpSecure = false,
      siteId = null,
      isPrimary = false,
      identity = {}
    } = req.body;

    if (!email || !senderName) {
      return res.status(400).json({ error: 'Email address and Sender Name are required.' });
    }

    const { provider, host } = detectProviderAndHost(email, inputProvider, smtpHost);

    const emailConfig = {
      email,
      sender_name: senderName,
      provider,
      smtp_host: host,
      smtp_port: parseInt(smtpPort, 10),
      smtp_user: smtpUser || email,
      smtp_pass: smtpPass || '',
      smtp_secure: smtpSecure ? 1 : 0
    };

    let verification = { success: true };
    if (smtpPass) {
      verification = await verifyConnection(emailConfig);
    }

    const id = crypto.randomUUID();
    const ecosystemIdentity = {
      sender_identity: senderName,
      assigned_site_id: siteId || null,
      xmg_routing: true,
      xsite_signature: `Sent via XStreamFlex XMail for ${email}`,
      ...identity
    };
    const identityJson = JSON.stringify(ecosystemIdentity);

    try {
      await db.query(
        `INSERT INTO connected_emails (id, email, sender_name, provider, smtp_host, smtp_port, smtp_user, smtp_pass, smtp_secure, is_verified, site_id, ecosystem_identity_json, is_primary)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          id,
          emailConfig.email,
          emailConfig.sender_name,
          emailConfig.provider,
          emailConfig.smtp_host,
          emailConfig.smtp_port,
          emailConfig.smtp_user,
          emailConfig.smtp_pass,
          emailConfig.smtp_secure,
          verification.success ? 1 : 0,
          siteId || null,
          identityJson,
          isPrimary ? 1 : 0
        ]
      );
    } catch (dbErr) {
      // Fallback for missing column compatibility
      await db.query(
        `INSERT INTO connected_emails (id, email, sender_name, smtp_host, smtp_port, smtp_user, smtp_pass, smtp_secure, is_verified)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          id,
          emailConfig.email,
          emailConfig.sender_name,
          emailConfig.smtp_host,
          emailConfig.smtp_port,
          emailConfig.smtp_user,
          emailConfig.smtp_pass,
          emailConfig.smtp_secure,
          verification.success ? 1 : 0
        ]
      );
    }

    res.status(201).json({
      success: true,
      message: verification.success ? 'Email identity housing completed and connected.' : `Email saved, but connection check failed: ${verification.error || 'Check credentials.'}`,
      verification,
      connectedEmail: {
        id,
        email: emailConfig.email,
        senderName: emailConfig.sender_name,
        provider: emailConfig.provider,
        smtpHost: emailConfig.smtp_host,
        siteId: siteId || null,
        isPrimary: !!isPrimary,
        ecosystemIdentity
      }
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// List connected email identities with linked saved site names
router.get('/emails', async (req, res) => {
  try {
    let emails = [];
    try {
      emails = await db.query(`
        SELECT ce.id, ce.email, ce.sender_name, ce.provider, ce.smtp_host, ce.smtp_port, ce.is_verified, 
               ce.site_id, ce.ecosystem_identity_json, ce.is_primary, ce.created_at,
               s.name as site_name, s.type as site_type, s.ecosystem_id as site_ecosystem_id
        FROM connected_emails ce
        LEFT JOIN sites s ON ce.site_id = s.id
        ORDER BY ce.created_at DESC
      `);
    } catch (err) {
      emails = await db.query('SELECT id, email, sender_name, smtp_host, smtp_port, is_verified, created_at FROM connected_emails ORDER BY created_at DESC');
    }

    const enrichedEmails = emails.map(e => {
      let parsedIdentity = {};
      try {
        parsedIdentity = e.ecosystem_identity_json ? JSON.parse(e.ecosystem_identity_json) : {};
      } catch (err) {
        parsedIdentity = {};
      }
      return {
        ...e,
        identity: parsedIdentity
      };
    });

    res.json({ emails: enrichedEmails });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Test existing linked email connection
router.post('/emails/:id/test', async (req, res) => {
  try {
    const { id } = req.params;
    const rows = await db.query('SELECT * FROM connected_emails WHERE id = ?', [id]);
    if (!rows || rows.length === 0) {
      return res.status(404).json({ error: 'Linked email not found.' });
    }
    const emailConfig = rows[0];
    const verification = await verifyConnection(emailConfig);

    await db.query('UPDATE connected_emails SET is_verified = ? WHERE id = ?', [verification.success ? 1 : 0, id]);

    res.json({
      success: verification.success,
      message: verification.success ? 'SMTP Connection re-verified successfully!' : `Verification failed: ${verification.error}`,
      verification
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Unlink/Delete connected email
router.delete('/emails/:id', async (req, res) => {
  try {
    const { id } = req.params;
    await db.query('DELETE FROM connected_emails WHERE id = ?', [id]);
    res.json({ success: true, message: 'Email account unlinked successfully.' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ==========================================
// 3. UNIFIED ECOSYSTEM IDENTITY SYNC & GATEWAY
// ==========================================

// Endpoint to resolve complete identity of a key or email
router.get('/ecosystem/identity/:keyOrEmail', async (req, res) => {
  try {
    const { keyOrEmail } = req.params;
    
    // Check if keyOrEmail matches site API Key or Ecosystem ID
    const siteRows = await db.query(
      'SELECT * FROM sites WHERE api_key = ? OR ecosystem_id = ? OR id = ?',
      [keyOrEmail, keyOrEmail, keyOrEmail]
    );

    // Check if keyOrEmail matches connected email
    const emailRows = await db.query(
      'SELECT * FROM connected_emails WHERE email = ? OR id = ?',
      [keyOrEmail, keyOrEmail]
    );

    if ((!siteRows || siteRows.length === 0) && (!emailRows || emailRows.length === 0)) {
      return res.status(404).json({ error: 'No XStreamFlex identity found matching key or email.' });
    }

    const site = siteRows && siteRows.length > 0 ? siteRows[0] : null;
    const emailAccount = emailRows && emailRows.length > 0 ? emailRows[0] : null;

    let linkedEmails = [];
    if (site) {
      linkedEmails = await db.query(
        'SELECT id, email, sender_name, provider, is_verified, is_primary FROM connected_emails WHERE site_id = ? OR email = ?',
        [site.id, site.domain || '']
      );
    }

    let activeSequences = [];
    if (site) {
      activeSequences = await db.query(
        'SELECT id, name, event_trigger, is_active FROM sequences WHERE site_id = ?',
        [site.id]
      );
    }

    let parsedMetadata = {};
    if (site && site.site_metadata_json) {
      try { parsedMetadata = JSON.parse(site.site_metadata_json); } catch (e) {}
    }

    res.json({
      success: true,
      ecosystemIdentity: {
        site: site ? {
          id: site.id,
          name: site.name,
          type: site.type,
          domain: site.domain,
          apiKey: site.api_key,
          ecosystemId: site.ecosystem_id,
          metadata: parsedMetadata
        } : null,
        emailAccount: emailAccount ? {
          id: emailAccount.id,
          email: emailAccount.email,
          senderName: emailAccount.sender_name,
          provider: emailAccount.provider,
          isVerified: !!emailAccount.is_verified,
          siteId: emailAccount.site_id
        } : null,
        linkedEmails,
        activeSequences,
        xmgIntegration: {
          enabled: true,
          supportedEvents: ['lead.signup', 'order.completed', 'xmg.lead', 'xmg.media_event', 'xmg.conversion']
        }
      }
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Full Ecosystem Synchronization Gateway
router.post('/ecosystem/sync', async (req, res) => {
  try {
    const { site, emailAccount, sequences = [] } = req.body;

    if (!site || !site.name) {
      return res.status(400).json({ error: 'Site payload with name is required for ecosystem sync.' });
    }

    const type = site.type || 'xsite';
    const siteId = site.id || crypto.randomUUID();
    const apiKey = site.apiKey || generateApiKey(type);
    const webhookSecret = site.webhookSecret || crypto.randomBytes(32).toString('hex');
    const ecosystemId = site.ecosystemId || generateEcosystemId(type);
    const metadataJson = JSON.stringify(site.metadata || { platform: type, synced_at: new Date().toISOString() });

    // Upsert Site Identity
    const existingSites = await db.query('SELECT * FROM sites WHERE api_key = ? OR ecosystem_id = ? OR id = ?', [apiKey, ecosystemId, siteId]);
    if (existingSites && existingSites.length > 0) {
      await db.query(
        `UPDATE sites SET name = ?, type = ?, domain = ?, site_metadata_json = ? WHERE id = ?`,
        [site.name, type, site.domain || null, metadataJson, existingSites[0].id]
      );
    } else {
      await db.query(
        `INSERT INTO sites (id, name, type, domain, api_key, webhook_secret, ecosystem_id, site_metadata_json)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [siteId, site.name, type, site.domain || null, apiKey, webhookSecret, ecosystemId, metadataJson]
      );
    }

    // Sync Connected Email Identity if provided
    let syncedEmailId = null;
    if (emailAccount && emailAccount.email) {
      const { provider, host } = detectProviderAndHost(emailAccount.email, emailAccount.provider, emailAccount.smtpHost);
      const existingEmail = await db.query('SELECT * FROM connected_emails WHERE email = ?', [emailAccount.email]);
      
      if (existingEmail && existingEmail.length > 0) {
        syncedEmailId = existingEmail[0].id;
        await db.query(
          `UPDATE connected_emails SET site_id = ?, sender_name = COALESCE(?, sender_name) WHERE id = ?`,
          [siteId, emailAccount.senderName || null, syncedEmailId]
        );
      } else {
        syncedEmailId = crypto.randomUUID();
        await db.query(
          `INSERT INTO connected_emails (id, email, sender_name, provider, smtp_host, smtp_port, smtp_user, smtp_pass, smtp_secure, is_verified, site_id, is_primary)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)`,
          [
            syncedEmailId,
            emailAccount.email,
            emailAccount.senderName || site.name,
            provider,
            host,
            parseInt(emailAccount.smtpPort || 587, 10),
            emailAccount.smtpUser || emailAccount.email,
            emailAccount.smtpPass || '',
            emailAccount.smtpSecure ? 1 : 0,
            1,
            siteId
          ]
        );
      }
    }

    res.json({
      success: true,
      message: 'XStreamFlex Ecosystem Identity housing and sync completed.',
      identity: {
        siteId,
        siteName: site.name,
        type,
        apiKey,
        ecosystemId,
        syncedEmailId
      }
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ==========================================
// 4. EVENT INGESTION GATEWAY (Xsites, EZsites, XMG)
// ==========================================

const handleEventIngest = async (req, res) => {
  try {
    const apiKey = req.headers['x-site-key'] || req.headers['x-ecosystem-key'] || req.headers['x-xmg-key'] || req.body.site_key || req.body.ecosystem_key || req.query.site_key;
    const { event_type, email, first_name, last_name, phone, metadata = {} } = req.body;

    if (!apiKey) {
      return res.status(401).json({ error: 'Missing Site/Ecosystem API Key in request headers or body.' });
    }

    if (!email || !event_type) {
      return res.status(400).json({ error: 'Both "email" and "event_type" are required.' });
    }

    // Authenticate Site / Ecosystem Key
    const siteRows = await db.query('SELECT * FROM sites WHERE api_key = ? OR ecosystem_id = ?', [apiKey, apiKey]);
    if (!siteRows || siteRows.length === 0) {
      return res.status(403).json({ error: 'Invalid XStreamFlex / Xsite / XMG API Key.' });
    }
    const site = siteRows[0];

    // Find or create Contact
    const contactRows = await db.query(
      'SELECT * FROM contacts WHERE site_id = ? AND email = ?',
      [site.id, email]
    );

    let contactId = null;
    const customFieldsJson = JSON.stringify(metadata);

    if (contactRows && contactRows.length > 0) {
      contactId = contactRows[0].id;
      await db.query(
        `UPDATE contacts SET first_name = COALESCE(?, first_name), last_name = COALESCE(?, last_name), phone = COALESCE(?, phone), custom_fields_json = ?
         WHERE id = ?`,
        [first_name || null, last_name || null, phone || null, customFieldsJson, contactId]
      );
    } else {
      contactId = crypto.randomUUID();
      await db.query(
        `INSERT INTO contacts (id, site_id, email, first_name, last_name, phone, status, custom_fields_json)
         VALUES (?, ?, ?, ?, ?, ?, 'subscribed', ?)`,
        [contactId, site.id, email, first_name || null, last_name || null, phone || null, customFieldsJson]
      );
    }

    const payload = {
      email,
      first_name: first_name || 'there',
      last_name: last_name || '',
      phone: phone || '',
      site_name: site.name,
      ecosystem_id: site.ecosystem_id,
      ...metadata
    };

    const triggerResult = await triggerEventSequences({
      siteId: site.id,
      contactId,
      recipientEmail: email,
      eventTrigger: event_type,
      payload
    });

    res.json({
      success: true,
      message: `Event "${event_type}" ingested successfully for ${email}.`,
      site: site.name,
      ecosystemId: site.ecosystem_id,
      jobsQueued: triggerResult.queued
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

router.post('/events/ingest', handleEventIngest);
router.post('/xmg/ingest', handleEventIngest);

// ==========================================
// 5. SEQUENCES & DRIP WORKFLOWS
// ==========================================

router.post('/sequences', async (req, res) => {
  try {
    const { siteId, name, eventTrigger } = req.body;
    if (!siteId || !name || !eventTrigger) {
      return res.status(400).json({ error: 'siteId, name, and eventTrigger are required.' });
    }

    const id = crypto.randomUUID();
    await db.query(
      `INSERT INTO sequences (id, site_id, name, event_trigger) VALUES (?, ?, ?, ?)`,
      [id, siteId, name, eventTrigger]
    );

    res.status(201).json({ success: true, sequence: { id, siteId, name, eventTrigger } });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/sequences/:id/steps', async (req, res) => {
  try {
    const sequenceId = req.params.id;
    const { stepNumber = 1, delayMinutes = 0, subject, bodyHtml, senderEmailId } = req.body;

    if (!subject || !bodyHtml) {
      return res.status(400).json({ error: 'subject and bodyHtml are required.' });
    }

    const stepId = crypto.randomUUID();
    await db.query(
      `INSERT INTO sequence_steps (id, sequence_id, step_number, delay_minutes, subject, body_html, sender_email_id)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [stepId, sequenceId, stepNumber, delayMinutes, subject, bodyHtml, senderEmailId || null]
    );

    res.status(201).json({ success: true, step: { id: stepId, sequenceId, stepNumber, delayMinutes, subject } });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/sequences', async (req, res) => {
  try {
    const sequences = await db.query('SELECT s.*, st.name as site_name FROM sequences s LEFT JOIN sites st ON s.site_id = st.id');
    for (const seq of sequences) {
      seq.steps = await db.query('SELECT * FROM sequence_steps WHERE sequence_id = ? ORDER BY step_number ASC', [seq.id]);
    }
    res.json({ sequences });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ==========================================
// 6. CONTACTS & ANALYTICS STATS
// ==========================================

router.get('/contacts', async (req, res) => {
  try {
    const contacts = await db.query(
      'SELECT c.*, s.name as site_name FROM contacts c LEFT JOIN sites s ON c.site_id = s.id ORDER BY c.created_at DESC'
    );
    res.json({ contacts });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/stats', async (req, res) => {
  try {
    const [sitesCount] = await db.query('SELECT COUNT(*) as count FROM sites');
    const [contactsCount] = await db.query('SELECT COUNT(*) as count FROM contacts');
    const [sentJobsCount] = await db.query('SELECT COUNT(*) as count FROM queue_jobs WHERE status = "sent"');
    const [pendingJobsCount] = await db.query('SELECT COUNT(*) as count FROM queue_jobs WHERE status = "pending"');
    const [opensCount] = await db.query('SELECT COUNT(*) as count FROM tracking_events WHERE event_type = "open"');
    const [clicksCount] = await db.query('SELECT COUNT(*) as count FROM tracking_events WHERE event_type = "click"');

    res.json({
      stats: {
        totalSites: sitesCount.count || sitesCount['COUNT(*)'] || 0,
        totalContacts: contactsCount.count || contactsCount['COUNT(*)'] || 0,
        emailsSent: sentJobsCount.count || sentJobsCount['COUNT(*)'] || 0,
        emailsPending: pendingJobsCount.count || pendingJobsCount['COUNT(*)'] || 0,
        totalOpens: opensCount.count || opensCount['COUNT(*)'] || 0,
        totalClicks: clicksCount.count || clicksCount['COUNT(*)'] || 0
      }
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
