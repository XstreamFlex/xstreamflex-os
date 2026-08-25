const express = require('express');
const crypto = require('crypto');
const db = require('../config/database');

const router = express.Router();

// Transparent 1x1 GIF Pixel buffer
const PIXEL_BUFFER = Buffer.from(
  'R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7',
  'base64'
);

// 1. OPEN TRACKING PIXEL
router.get('/t/o/:token.png', async (req, res) => {
  const token = req.params.token;
  
  // Always return the GIF pixel immediately
  res.writeHead(200, {
    'Content-Type': 'image/gif',
    'Content-Length': PIXEL_BUFFER.length,
    'Cache-Control': 'no-store, no-cache, must-revalidate, private',
    'Pragma': 'no-cache',
    'Expires': '0'
  });
  res.end(PIXEL_BUFFER);

  // Record open event asynchronously
  try {
    const jobs = await db.query('SELECT * FROM queue_jobs WHERE tracking_token = ?', [token]);
    if (jobs && jobs.length > 0) {
      const job = jobs[0];
      const eventId = crypto.randomUUID();
      const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
      const ua = req.headers['user-agent'] || '';

      await db.query(
        `INSERT INTO tracking_events (id, queue_job_id, contact_id, event_type, ip_address, user_agent)
         VALUES (?, ?, ?, 'open', ?, ?)`,
        [eventId, job.id, job.contact_id, ip, ua]
      );
    }
  } catch (err) {
    console.error('Open tracking log error:', err.message);
  }
});

// 2. LINK CLICK TRACKING
router.get('/t/c/:token', async (req, res) => {
  const token = req.params.token;
  const targetUrl = req.query.url;

  if (!targetUrl) {
    return res.redirect('/');
  }

  // Redirect user to original URL
  res.redirect(targetUrl);

  // Record click event asynchronously
  try {
    const jobs = await db.query('SELECT * FROM queue_jobs WHERE tracking_token = ?', [token]);
    if (jobs && jobs.length > 0) {
      const job = jobs[0];
      const eventId = crypto.randomUUID();
      const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
      const ua = req.headers['user-agent'] || '';

      await db.query(
        `INSERT INTO tracking_events (id, queue_job_id, contact_id, event_type, target_url, ip_address, user_agent)
         VALUES (?, ?, ?, 'click', ?, ?, ?)`,
        [eventId, job.id, job.contact_id, targetUrl, ip, ua]
      );
    }
  } catch (err) {
    console.error('Click tracking log error:', err.message);
  }
});

// 3. UNSUBSCRIBE HANDLER
router.get('/unsubscribe', async (req, res) => {
  const email = req.query.email;

  if (!email) {
    return res.status(400).send('Invalid unsubscribe request. Email parameter missing.');
  }

  try {
    await db.query(`UPDATE contacts SET status = 'unsubscribed' WHERE email = ?`, [email]);
    res.send(`
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
          <p>The email address <strong>${email}</strong> has been successfully unsubscribed and will no longer receive automated messages.</p>
        </div>
      </body>
      </html>
    `);
  } catch (err) {
    res.status(500).send('Error updating subscription status.');
  }
});

module.exports = router;
