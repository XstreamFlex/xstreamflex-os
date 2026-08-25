const crypto = require('crypto');
const db = require('../config/database');
const { renderTemplate } = require('./templateEngine');

/**
 * Triggers sequence drip emails for a specific site & event
 */
async function triggerEventSequences({ siteId, contactId, recipientEmail, eventTrigger, payload = {} }) {
  // Find active sequences for this site matching the event trigger
  const sequences = await db.query(
    'SELECT * FROM sequences WHERE site_id = ? AND event_trigger = ? AND is_active = 1',
    [siteId, eventTrigger]
  );

  if (!sequences || sequences.length === 0) {
    return { queued: 0, message: `No active sequence found for event: ${eventTrigger}` };
  }

  let totalJobsQueued = 0;

  for (const seq of sequences) {
    const steps = await db.query(
      'SELECT * FROM sequence_steps WHERE sequence_id = ? ORDER BY step_number ASC',
      [seq.id]
    );

    for (const step of steps) {
      const delayMinutes = step.delay_minutes || 0;
      const scheduledDate = new Date(Date.now() + delayMinutes * 60 * 1000);
      const scheduledAtStr = scheduledDate.toISOString().slice(0, 19).replace('T', ' ');

      const trackingToken = crypto.randomUUID();
      const jobId = crypto.randomUUID();

      // Render templates
      const renderedSubject = renderTemplate(step.subject, payload);
      const renderedBody = renderTemplate(step.body_html, payload);

      await db.query(
        `INSERT INTO queue_jobs (id, contact_id, sequence_id, step_id, sender_email_id, recipient_email, subject, body_html, scheduled_at, status, tracking_token)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?)`,
        [
          jobId,
          contactId,
          seq.id,
          step.id,
          step.sender_email_id || null,
          recipientEmail,
          renderedSubject,
          renderedBody,
          scheduledAtStr,
          trackingToken
        ]
      );

      totalJobsQueued++;
    }
  }

  return { queued: totalJobsQueued };
}

module.exports = {
  triggerEventSequences
};
