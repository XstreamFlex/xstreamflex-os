const db = require('../config/database');
const { sendMail } = require('../services/mailer');
const { injectTracking } = require('../services/templateEngine');
require('dotenv').config();

async function processQueue() {
  console.log(`[Queue Worker] Processing pending autoresponder jobs at ${new Date().toISOString()}...`);
  
  const appUrl = process.env.APP_URL || 'http://localhost:3000';
  const nowStr = new Date().toISOString().slice(0, 19).replace('T', ' ');

  try {
    // Select pending jobs due for dispatch
    const pendingJobs = await db.query(
      `SELECT q.*, c.status AS contact_status 
       FROM queue_jobs q 
       JOIN contacts c ON q.contact_id = c.id 
       WHERE q.status = 'pending' AND q.scheduled_at <= ? AND c.status = 'subscribed' 
       LIMIT 50`,
      [nowStr]
    );

    if (!pendingJobs || pendingJobs.length === 0) {
      console.log('[Queue Worker] No pending jobs to process.');
      return;
    }

    console.log(`[Queue Worker] Found ${pendingJobs.length} job(s) ready to send.`);

    for (const job of pendingJobs) {
      try {
        // Inject tracking pixel & click links into HTML
        const trackedBody = injectTracking(job.body_html, job.tracking_token, appUrl);

        console.log(`[Queue Worker] Dispatching email to ${job.recipient_email} (Job ID: ${job.id})...`);

        await sendMail({
          senderEmailId: job.sender_email_id,
          to: job.recipient_email,
          subject: job.subject,
          htmlBody: trackedBody
        });

        const sentAtStr = new Date().toISOString().slice(0, 19).replace('T', ' ');
        await db.query(
          `UPDATE queue_jobs SET status = 'sent', sent_at = ? WHERE id = ?`,
          [sentAtStr, job.id]
        );

        console.log(`[Queue Worker] ✅ Successfully sent Job ID: ${job.id}`);
      } catch (sendError) {
        console.error(`[Queue Worker] ❌ Error sending Job ID ${job.id}:`, sendError.message);
        await db.query(
          `UPDATE queue_jobs SET status = 'failed', error_message = ? WHERE id = ?`,
          [sendError.message, job.id]
        );
      }
    }
  } catch (error) {
    console.error('[Queue Worker] Fatal error processing queue:', error);
  }
}

// If script executed directly from CLI / Cron
if (require.main === module) {
  processQueue().then(() => {
    process.exit(0);
  });
}

module.exports = processQueue;
