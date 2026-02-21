// emails/emailService.js
require('dotenv').config();
const nodemailer = require('nodemailer');
const templates  = require('./templates');

// ── Build transporter ─────────────────────────────────────────
function createTransporter() {
  const provider = (process.env.EMAIL_PROVIDER || 'gmail').toLowerCase();

  if (provider === 'ethereal' || process.env.NODE_ENV === 'test') {
    return nodemailer.createTransport({
      host: 'smtp.ethereal.email', port: 587, secure: false,
      auth: { user: process.env.ETHEREAL_USER || '', pass: process.env.ETHEREAL_PASS || '' },
    });
  }

  // ── Resend SMTP ──────────────────────────────────────────────
  // user must always be the literal string "resend"
  // pass is your Resend API key (re_xxxxxxxxxxxx)
  // EMAIL_FROM must be from your verified Resend domain, e.g:
  //   EMAIL_FROM="PayGlobal <noreply@yourdomain.com>"
  if (provider === 'resend') {
    return nodemailer.createTransport({
      host: 'smtp.resend.com', port: 465, secure: true,
      auth: { user: 'resend', pass: process.env.RESEND_API_KEY },
    });
  }

  if (provider === 'gmail') {
    return nodemailer.createTransport({
      service: 'gmail',
      auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASS },
    });
  }

  if (provider === 'outlook' || provider === 'hotmail') {
    return nodemailer.createTransport({
      host: 'smtp-mail.outlook.com', port: 587, secure: false,
      auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASS },
    });
  }

  // Custom SMTP (SendGrid, Mailgun, AWS SES, etc.)
  return nodemailer.createTransport({
    host:   process.env.SMTP_HOST,
    port:   parseInt(process.env.SMTP_PORT || '587'),
    secure: process.env.SMTP_SECURE === 'true',
    auth:   { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASS },
  });
}

const transporter = createTransporter();

// ── Verify connection on startup ──────────────────────────────
async function verifyConnection() {
  try {
    await transporter.verify();
    console.log('✉️  Email service ready (' + (process.env.EMAIL_PROVIDER || 'gmail') + ')');
    return true;
  } catch (err) {
    console.warn('⚠️  Email service not configured:', err.message);
    return false;
  }
}

// ── Core send ─────────────────────────────────────────────────
async function sendEmail({ to, subject, html, replyTo }) {
  // EMAIL_FROM must be a verified sender/domain for Resend
  const from = process.env.EMAIL_FROM ||
    `"PayGlobal Payouts" <${process.env.EMAIL_USER || 'noreply@payglobal.com'}>`;

  try {
    const info = await transporter.sendMail({
      from, to, subject, html,
      replyTo: replyTo || from,
      text: html.replace(/<[^>]+>/g, '').replace(/\s{2,}/g, ' ').trim(),
    });
    const previewUrl = nodemailer.getTestMessageUrl(info);
    if (previewUrl) console.log(`📧 Preview: ${previewUrl}`);
    console.log(`✉️  Sent "${subject}" → ${to}`);
    return { success: true, messageId: info.messageId, previewUrl: previewUrl || null };
  } catch (err) {
    // Surface the full error — Resend gives useful messages like
    // "The gmail.com domain is not verified" or "Invalid API Key"
    console.error(`❌ Email failed → ${to}:`, err.message);
    return { success: false, error: err.message };
  }
}

// ══════════════════════════════════════════════════════════════
// Public send functions
// ══════════════════════════════════════════════════════════════

/**
 * Sent to YOU (platform owner) when a transfer is created.
 * toOverride lets the test endpoint send to a specific address.
 */
async function sendPaymentInitiated(transfer, toOverride) {
  const to = toOverride || process.env.OWNER_EMAIL || process.env.EMAIL_USER;
  if (!to) return { success: false, error: 'OWNER_EMAIL is not set in .env' };

  return sendEmail({
    to,
    subject: `⚡ Transfer Initiated — ${formatAmount(transfer.amount, transfer.currency)} to ${transfer.recipient_name || 'recipient'}`,
    html:    templates.paymentInitiated(transfer),
  });
}

/**
 * Sent to the RECIPIENT when funds are confirmed sent.
 */
async function sendPaymentReceived(transfer, toOverride) {
  const to = toOverride || transfer.recipient_email;
  if (!to) return { success: false, error: 'No recipient email on transfer' };

  return sendEmail({
    to,
    subject: `💸 Payment Received — ${formatAmount(transfer.amount, transfer.currency)}`,
    html:    templates.paymentReceived(transfer),
  });
}

/**
 * Sends an invoice email.
 */
async function sendInvoice(to, data) {
  const invoiceNumber = data.invoice_number ||
    (data.transfer_id?.slice(-8)?.toUpperCase()) || 'INV-001';

  return sendEmail({
    to,
    subject: `📄 Invoice #${invoiceNumber} — ${formatAmount(data.total || 0, data.currency)}`,
    html:    templates.invoice(data),
  });
}

function formatAmount(cents, cur = 'usd') {
  return new Intl.NumberFormat('en-US', {
    style: 'currency', currency: cur.toUpperCase(), minimumFractionDigits: 2,
  }).format(cents / 100);
}

module.exports = { verifyConnection, sendPaymentInitiated, sendPaymentReceived, sendInvoice };