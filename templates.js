// emails/templates.js
// Three pixel-perfect HTML email templates:
// 1. paymentInitiated  — sent to YOU (sender) when a transfer is created
// 2. paymentReceived   — sent to RECIPIENT when money arrives
// 3. invoice           — full invoice email with itemised breakdown

const fmt = (cents, cur = 'USD') =>
  new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: cur.toUpperCase(),
    minimumFractionDigits: 2,
  }).format(cents / 100);

const fmtDate = (ts) =>
  new Date(ts * 1000).toLocaleDateString('en-US', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
  });

// ── Shared base layout ─────────────────────────────────────────
const base = (content) => `
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1.0"/>
<meta http-equiv="X-UA-Compatible" content="IE=edge"/>
<title>PayGlobal</title>
<!--[if mso]><noscript><xml><o:OfficeDocumentSettings><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml></noscript><![endif]-->
<style>
  body,html{margin:0;padding:0;background:#f0f2f7;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif}
  *{box-sizing:border-box}
  a{color:#5b8af0;text-decoration:none}
  @media(max-width:600px){
    .email-body{padding:20px 12px!important}
    .card{padding:28px 20px!important}
    .split{display:block!important;width:100%!important}
  }
</style>
</head>
<body style="margin:0;padding:0;background:#f0f2f7">
<table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f0f2f7">
<tr><td align="center" class="email-body" style="padding:40px 16px">
<table width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:580px">

  <!-- Logo / Header -->
  <tr><td align="center" style="padding-bottom:24px">
    <table cellpadding="0" cellspacing="0" border="0">
      <tr>
        <td style="background:linear-gradient(135deg,#5b8af0,#8b5cf6);border-radius:12px;padding:10px 14px;vertical-align:middle">
          <span style="font-size:20px;line-height:1">🌍</span>
        </td>
        <td style="padding-left:10px;vertical-align:middle">
          <div style="font-size:20px;font-weight:800;color:#1a1f36;letter-spacing:-.4px">PayGlobal</div>
          <div style="font-size:11px;color:#8a94a6;font-weight:500;letter-spacing:.5px;text-transform:uppercase">Stripe Connect Payouts</div>
        </td>
      </tr>
    </table>
  </td></tr>

  <!-- Main Card -->
  <tr><td class="card" style="background:#ffffff;border-radius:18px;padding:40px;box-shadow:0 4px 24px rgba(0,0,0,.07)">
    ${content}
  </td></tr>

  <!-- Footer -->
  <tr><td style="padding:24px 0;text-align:center">
    <div style="font-size:12px;color:#8a94a6;line-height:1.6">
      Powered by <strong>PayGlobal</strong> · Stripe Connect<br/>
      <span style="opacity:.7">This is an automated email — please do not reply directly.</span>
    </div>
  </td></tr>

</table>
</td></tr>
</table>
</body>
</html>`;

// ── Shared UI components ───────────────────────────────────────
const statusPill = (label, color, bg) =>
  `<span style="display:inline-block;background:${bg};color:${color};border:1px solid ${color}30;border-radius:20px;padding:4px 14px;font-size:12px;font-weight:700;letter-spacing:.3px">${label}</span>`;

const dataRow = (label, value, mono = false) =>
  `<tr>
    <td style="padding:11px 0;border-bottom:1px solid #f0f2f7;font-size:13px;color:#8a94a6;font-weight:500;width:45%">${label}</td>
    <td style="padding:11px 0;border-bottom:1px solid #f0f2f7;font-size:13px;color:#1a1f36;font-weight:600;text-align:right${mono ? ';font-family:Courier New,monospace' : ''}">${value}</td>
  </tr>`;

const divider = () =>
  `<tr><td colspan="2" style="padding:4px 0"><hr style="border:none;border-top:2px solid #f0f2f7;margin:0"/></td></tr>`;

const amountBadge = (amount, currency) =>
  `<div style="background:linear-gradient(135deg,#eef3ff,#f3eeff);border-radius:12px;padding:24px;text-align:center;margin:24px 0">
    <div style="font-size:11px;color:#8a94a6;font-weight:700;letter-spacing:1px;text-transform:uppercase;margin-bottom:8px">Transfer Amount</div>
    <div style="font-size:40px;font-weight:800;color:#1a1f36;letter-spacing:-1.5px;font-family:Courier New,monospace">${fmt(amount, currency)}</div>
    <div style="font-size:12px;color:#8a94a6;margin-top:4px">${currency.toUpperCase()}</div>
  </div>`;


// ══════════════════════════════════════════════════════════════
// 1. PAYMENT INITIATED  →  sent to the platform owner (YOU)
// ══════════════════════════════════════════════════════════════
function paymentInitiated(transfer) {
  const {
    id, amount, currency = 'usd', description, created,
    recipient_name, recipient_email, bank_name, last4, country,
    arrival_date,
  } = transfer;

  const content = `
    <!-- Status pill -->
    <div style="margin-bottom:24px">
      ${statusPill('⚡ Transfer Initiated', '#5b8af0', '#eef3ff')}
    </div>

    <h1 style="margin:0 0 8px;font-size:24px;font-weight:800;color:#1a1f36;letter-spacing:-.5px">
      Payment Initiated
    </h1>
    <p style="margin:0 0 24px;color:#8a94a6;font-size:15px;line-height:1.6">
      Your transfer has been submitted to Stripe and is now being processed.
    </p>

    ${amountBadge(amount, currency)}

    <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 24px">
      ${dataRow('Transfer ID', `<span style="font-family:Courier New,monospace;font-size:11px">${id}</span>`)}
      ${dataRow('Recipient', recipient_name || '—')}
      ${dataRow('Recipient Email', recipient_email || '—')}
      ${dataRow('Bank', bank_name ? `${bank_name} ···${last4}` : '—')}
      ${dataRow('Country', country || '—')}
      ${dataRow('Reference', description || '—')}
      ${dataRow('Initiated', fmtDate(created))}
      ${dataRow('Est. Arrival', arrival_date ? fmtDate(arrival_date) : 'T+5 business days')}
      ${divider()}
      ${dataRow('Status', statusPill('Processing', '#f5a623', '#fff8eb'), false)}
    </table>

    <div style="background:#f8f9fc;border-radius:10px;padding:16px;font-size:13px;color:#8a94a6;line-height:1.6">
      💡 <strong style="color:#1a1f36">What happens next?</strong><br/>
      Stripe will process the transfer and deposit funds into the recipient's bank account. 
      You'll receive another email when the payment is confirmed received.
    </div>`;

  return base(content);
}


// ══════════════════════════════════════════════════════════════
// 2. PAYMENT RECEIVED  →  sent to the RECIPIENT
// ══════════════════════════════════════════════════════════════
function paymentReceived(transfer) {
  const {
    id, amount, currency = 'usd', description, created,
    recipient_name, bank_name, last4, sender_name = 'PayGlobal Platform',
    arrival_date,
  } = transfer;

  const content = `
    <!-- Hero check -->
    <div style="text-align:center;margin-bottom:28px">
      <div style="display:inline-block;width:64px;height:64px;background:linear-gradient(135deg,#d1fae5,#a7f3d0);border-radius:50%;line-height:64px;font-size:32px">✅</div>
    </div>

    <h1 style="margin:0 0 8px;font-size:24px;font-weight:800;color:#1a1f36;letter-spacing:-.5px;text-align:center">
      You've received a payment!
    </h1>
    <p style="margin:0 0 24px;color:#8a94a6;font-size:15px;line-height:1.6;text-align:center">
      Hi ${recipient_name ? `<strong>${recipient_name}</strong>` : 'there'}, a payment has been sent to your bank account.
    </p>

    ${amountBadge(amount, currency).replace('linear-gradient(135deg,#eef3ff,#f3eeff)', 'linear-gradient(135deg,#ecfdf5,#d1fae5)')}

    <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 24px">
      ${dataRow('From', sender_name)}
      ${dataRow('Your Bank', bank_name ? `${bank_name} ···${last4}` : '—')}
      ${dataRow('Reference', description || '—')}
      ${dataRow('Transfer ID', `<span style="font-family:Courier New,monospace;font-size:11px">${id}</span>`)}
      ${dataRow('Expected By', arrival_date ? fmtDate(arrival_date) : 'T+5 business days')}
      ${divider()}
      ${dataRow('Status', statusPill('✓ Funds Sent', '#0ec97f', '#ecfdf5'))}
    </table>

    <div style="background:#ecfdf5;border:1px solid #a7f3d0;border-radius:10px;padding:16px;font-size:13px;color:#065f46;line-height:1.6">
      🏦 <strong>When will I see the money?</strong><br/>
      Funds are on their way to your bank. Depending on your country and bank, it typically 
      takes <strong>1–5 business days</strong> for the money to appear in your account.
    </div>`;

  return base(content);
}


// ══════════════════════════════════════════════════════════════
// 3. INVOICE EMAIL  →  professional itemised invoice
// ══════════════════════════════════════════════════════════════
function invoice(data) {
  const {
    invoice_number, transfer_id, issued_date, due_date,
    sender = {}, recipient = {}, items = [], currency = 'usd',
    notes, tax_rate = 0,
  } = data;

  const subtotal = items.reduce((s, item) => s + (item.quantity * item.unit_price), 0);
  const tax      = Math.round(subtotal * (tax_rate / 100));
  const total    = subtotal + tax;

  const itemRows = items.map(item => {
    const lineTotal = item.quantity * item.unit_price;
    return `
    <tr>
      <td style="padding:14px 0;border-bottom:1px solid #f0f2f7;font-size:13px;color:#1a1f36;font-weight:500">${item.description}</td>
      <td style="padding:14px 0;border-bottom:1px solid #f0f2f7;font-size:13px;color:#8a94a6;text-align:center">${item.quantity}</td>
      <td style="padding:14px 0;border-bottom:1px solid #f0f2f7;font-size:13px;color:#8a94a6;text-align:right;font-family:Courier New,monospace">${fmt(item.unit_price, currency)}</td>
      <td style="padding:14px 0;border-bottom:1px solid #f0f2f7;font-size:13px;color:#1a1f36;font-weight:700;text-align:right;font-family:Courier New,monospace">${fmt(lineTotal, currency)}</td>
    </tr>`;
  }).join('');

  const content = `
    <!-- Invoice header -->
    <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:32px">
      <tr>
        <td style="vertical-align:top">
          <div style="font-size:28px;font-weight:800;color:#1a1f36;letter-spacing:-.6px">INVOICE</div>
          <div style="font-size:13px;color:#8a94a6;margin-top:4px;font-family:Courier New,monospace">#${invoice_number || transfer_id?.slice(-8)?.toUpperCase() || 'INV-001'}</div>
        </td>
        <td style="vertical-align:top;text-align:right">
          ${statusPill('✓ PAID', '#0ec97f', '#ecfdf5')}
        </td>
      </tr>
    </table>

    <!-- From / To -->
    <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:32px">
      <tr>
        <td class="split" style="vertical-align:top;width:50%;padding-right:20px">
          <div style="font-size:10px;font-weight:700;color:#8a94a6;letter-spacing:1px;text-transform:uppercase;margin-bottom:10px">FROM</div>
          <div style="font-size:14px;font-weight:700;color:#1a1f36">${sender.name || 'PayGlobal Platform'}</div>
          ${sender.email    ? `<div style="font-size:13px;color:#8a94a6;margin-top:3px">${sender.email}</div>` : ''}
          ${sender.address  ? `<div style="font-size:13px;color:#8a94a6;margin-top:3px;white-space:pre-line">${sender.address}</div>` : ''}
          ${sender.tax_id   ? `<div style="font-size:12px;color:#8a94a6;margin-top:6px">Tax ID: ${sender.tax_id}</div>` : ''}
        </td>
        <td class="split" style="vertical-align:top;width:50%">
          <div style="font-size:10px;font-weight:700;color:#8a94a6;letter-spacing:1px;text-transform:uppercase;margin-bottom:10px">BILLED TO</div>
          <div style="font-size:14px;font-weight:700;color:#1a1f36">${recipient.name || '—'}</div>
          ${recipient.email   ? `<div style="font-size:13px;color:#8a94a6;margin-top:3px">${recipient.email}</div>` : ''}
          ${recipient.address ? `<div style="font-size:13px;color:#8a94a6;margin-top:3px;white-space:pre-line">${recipient.address}</div>` : ''}
        </td>
      </tr>
    </table>

    <!-- Dates -->
    <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f8f9fc;border-radius:10px;padding:16px 20px;margin-bottom:28px">
      <tr>
        <td style="font-size:12px;color:#8a94a6;font-weight:600">Issue Date<br/><span style="font-size:13px;color:#1a1f36;font-weight:700">${issued_date ? fmtDate(issued_date) : fmtDate(Math.floor(Date.now()/1000))}</span></td>
        ${due_date ? `<td style="font-size:12px;color:#8a94a6;font-weight:600;text-align:center">Due Date<br/><span style="font-size:13px;color:#1a1f36;font-weight:700">${fmtDate(due_date)}</span></td>` : ''}
        <td style="font-size:12px;color:#8a94a6;font-weight:600;text-align:right">Transfer Ref<br/><span style="font-size:11px;color:#5b8af0;font-weight:700;font-family:Courier New,monospace">${transfer_id || '—'}</span></td>
      </tr>
    </table>

    <!-- Line items -->
    <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:8px">
      <thead>
        <tr style="border-bottom:2px solid #1a1f36">
          <th style="padding:10px 0;font-size:11px;font-weight:700;color:#8a94a6;letter-spacing:.7px;text-transform:uppercase;text-align:left">Description</th>
          <th style="padding:10px 0;font-size:11px;font-weight:700;color:#8a94a6;letter-spacing:.7px;text-transform:uppercase;text-align:center">Qty</th>
          <th style="padding:10px 0;font-size:11px;font-weight:700;color:#8a94a6;letter-spacing:.7px;text-transform:uppercase;text-align:right">Unit Price</th>
          <th style="padding:10px 0;font-size:11px;font-weight:700;color:#8a94a6;letter-spacing:.7px;text-transform:uppercase;text-align:right">Total</th>
        </tr>
      </thead>
      <tbody>${itemRows}</tbody>
    </table>

    <!-- Totals -->
    <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:28px">
      <tr>
        <td colspan="2" style="width:55%"></td>
        <td style="width:45%">
          <table width="100%" cellpadding="0" cellspacing="0" border="0">
            <tr>
              <td style="padding:8px 0;font-size:13px;color:#8a94a6">Subtotal</td>
              <td style="padding:8px 0;font-size:13px;color:#1a1f36;font-weight:600;text-align:right;font-family:Courier New,monospace">${fmt(subtotal, currency)}</td>
            </tr>
            ${tax_rate > 0 ? `<tr>
              <td style="padding:8px 0;font-size:13px;color:#8a94a6">Tax (${tax_rate}%)</td>
              <td style="padding:8px 0;font-size:13px;color:#1a1f36;font-weight:600;text-align:right;font-family:Courier New,monospace">${fmt(tax, currency)}</td>
            </tr>` : ''}
            <tr>
              <td colspan="2"><hr style="border:none;border-top:2px solid #1a1f36;margin:8px 0"/></td>
            </tr>
            <tr>
              <td style="padding:4px 0;font-size:16px;font-weight:800;color:#1a1f36">TOTAL</td>
              <td style="padding:4px 0;font-size:20px;font-weight:800;color:#5b8af0;text-align:right;font-family:Courier New,monospace;letter-spacing:-.5px">${fmt(total, currency)}</td>
            </tr>
          </table>
        </td>
      </tr>
    </table>

    ${notes ? `
    <div style="background:#f8f9fc;border-left:3px solid #5b8af0;border-radius:0 8px 8px 0;padding:14px 16px;font-size:13px;color:#8a94a6;line-height:1.6">
      <strong style="color:#1a1f36">Notes:</strong><br/>${notes}
    </div>` : ''}`;

  return base(content);
}

module.exports = { paymentInitiated, paymentReceived, invoice };
