const nodemailer = require('nodemailer');
const db = require('../config/database');
require('dotenv').config();

/**
 * Creates a Nodemailer transport from a linked email database row or fallback SMTP settings
 */
function createTransport(emailConfig) {
  if (emailConfig && emailConfig.smtp_host) {
    return nodemailer.createTransport({
      host: emailConfig.smtp_host,
      port: parseInt(emailConfig.smtp_port || '587', 10),
      secure: emailConfig.smtp_secure === 1 || emailConfig.smtp_port === 465,
      auth: {
        user: emailConfig.smtp_user,
        pass: emailConfig.smtp_pass
      },
      tls: {
        rejectUnauthorized: false
      }
    });
  }

  // Fallback to default environment variables
  return nodemailer.createTransport({
    host: process.env.DEFAULT_SMTP_HOST || 'smtp.gmail.com',
    port: parseInt(process.env.DEFAULT_SMTP_PORT || '587', 10),
    secure: false,
    auth: process.env.DEFAULT_SMTP_USER ? {
      user: process.env.DEFAULT_SMTP_USER,
      pass: process.env.DEFAULT_SMTP_PASS
    } : undefined,
    tls: {
      rejectUnauthorized: false
    }
  });
}

/**
 * Verifies an SMTP connection config
 */
async function verifyConnection(emailConfig) {
  try {
    const transporter = createTransport(emailConfig);
    await transporter.verify();
    return { success: true, message: 'SMTP connection verified successfully.' };
  } catch (error) {
    let diagnostic = error.message;
    const host = (emailConfig.smtp_host || '').toLowerCase();
    
    if (error.message.includes('535') || error.message.includes('Username and Password not accepted') || error.message.includes('Invalid login') || error.message.includes('Authentication failed')) {
      if (host.includes('gmail')) {
        diagnostic += ' -> Tip: Gmail requires an App Password if 2-Step Verification is active. Generate one at https://myaccount.google.com/apppasswords';
      } else if (host.includes('me.com') || host.includes('icloud')) {
        diagnostic += ' -> Tip: Apple iCloud Mail requires an App-Specific Password. Generate one at https://appleid.apple.com';
      } else if (host.includes('office365') || host.includes('outlook')) {
        diagnostic += ' -> Tip: Outlook requires your account credentials or an App Password if 2-Step Verification is active on your Microsoft Account.';
      }
    }
    return { success: false, error: diagnostic };
  }
}

/**
 * Sends an email using specified connected email config
 */
async function sendMail({ senderEmailId, to, subject, htmlBody }) {
  let senderConfig = null;

  if (senderEmailId) {
    const rows = await db.query('SELECT * FROM connected_emails WHERE id = ?', [senderEmailId]);
    if (rows && rows.length > 0) {
      senderConfig = rows[0];
    }
  }

  const transporter = createTransport(senderConfig);
  const fromName = senderConfig ? senderConfig.sender_name : (process.env.DEFAULT_FROM_NAME || 'XStreamFlex Autoresponder');
  const fromAddress = senderConfig ? senderConfig.email : (process.env.DEFAULT_FROM_EMAIL || 'no-reply@xstreamflex.io');

  const appUrl = process.env.APP_URL || 'http://localhost:3000';
  const unsubscribeUrl = `${appUrl}/unsubscribe?email=${encodeURIComponent(to)}`;

  const mailOptions = {
    from: `"${fromName}" <${fromAddress}>`,
    to: to,
    subject: subject,
    html: htmlBody,
    headers: {
      'List-Unsubscribe': `<${unsubscribeUrl}>`,
      'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click'
    }
  };

  const info = await transporter.sendMail(mailOptions);
  return info;
}

module.exports = {
  verifyConnection,
  sendMail
};
