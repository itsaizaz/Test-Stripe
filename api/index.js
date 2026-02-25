require('dotenv').config({ path: '.env.local' });
const express = require('express');
const cors    = require('cors');
const Stripe  = require('stripe');
const email   = require('../emails/emailService');

const app    = express();
const stripe = Stripe(process.env.STRIPE_SECRET_KEY);

app.use(cors({ origin: '*' }));
app.use(express.json());

// ─────────────────────────────────────────────────────────────
// APPROACH: Store-your-own bank details
//
// Recipients and transfers are stored entirely in Vercel KV.
// No Stripe Connect accounts are created — no onboarding redirect.
// You record the payout here, send emails, and handle the actual
// bank transfer yourself (via your bank, Wise, etc.)
// Stripe is only used to read your platform balance.
// ─────────────────────────────────────────────────────────────

// ── KV Storage ───────────────────────────────────────────────
let _kv = null;
const _mem = { recipients:[], transfers:[] }; // fallback for local dev

async function getKV() {
  if (_kv) return _kv;
  try {
    if (process.env.KV_REST_API_URL) {
      const { createClient } = await import('@vercel/kv');
      _kv = createClient({ url:process.env.KV_REST_API_URL, token:process.env.KV_REST_API_TOKEN });
      return _kv;
    }
  } catch(e) { console.warn('KV unavailable, using memory:', e.message); }
  return null;
}

async function dbGet(key) {
  const kv = await getKV();
  if (kv) { const v = await kv.get(key); return v ?? []; }
  return _mem[key] ?? [];
}

async function dbSet(key, value) {
  const kv = await getKV();
  if (kv) await kv.set(key, value);
  else _mem[key] = value;
}

// ── Country / currency data ───────────────────────────────────
const SUPPORTED_COUNTRIES = new Set([
  'AU','AT','BE','BR','BG','CA','HR','CY','CZ','DK','EE','FI',
  'FR','DE','GH','GI','GR','HK','HU','IN','IE','IT','JP','KE',
  'LV','LI','LT','LU','MY','MT','MX','NL','NZ','NG','NO','PL',
  'PT','RO','SG','SK','SI','ZA','ES','SE','CH','TH','TT','GB',
  'US','UY',
]);

const BANK_FORMATS = {
  US:{fields:['routing_number','account_number'],label:'Routing + Account Number'},
  GB:{fields:['sort_code','account_number'],label:'Sort Code + Account Number'},
  AU:{fields:['bsb_number','account_number'],label:'BSB + Account Number'},
  CA:{fields:['transit_number','institution_number','account_number'],label:'Transit + Institution + Account'},
  IN:{fields:['ifsc','account_number'],label:'IFSC + Account Number'},
  JP:{fields:['bank_code','branch_code','account_number'],label:'Bank Code + Branch + Account'},
  DE:{fields:['iban'],label:'IBAN'}, FR:{fields:['iban'],label:'IBAN'},
  IT:{fields:['iban'],label:'IBAN'}, ES:{fields:['iban'],label:'IBAN'},
  NL:{fields:['iban'],label:'IBAN'}, BE:{fields:['iban'],label:'IBAN'},
  AT:{fields:['iban'],label:'IBAN'}, CH:{fields:['iban'],label:'IBAN'},
  SE:{fields:['iban'],label:'IBAN'}, NO:{fields:['iban'],label:'IBAN'},
  DK:{fields:['iban'],label:'IBAN'}, FI:{fields:['iban'],label:'IBAN'},
  IE:{fields:['iban'],label:'IBAN'}, PT:{fields:['iban'],label:'IBAN'},
  GR:{fields:['iban'],label:'IBAN'}, PL:{fields:['iban'],label:'IBAN'},
  HU:{fields:['iban'],label:'IBAN'}, CZ:{fields:['iban'],label:'IBAN'},
  SK:{fields:['iban'],label:'IBAN'}, HR:{fields:['iban'],label:'IBAN'},
  SI:{fields:['iban'],label:'IBAN'}, EE:{fields:['iban'],label:'IBAN'},
  LV:{fields:['iban'],label:'IBAN'}, LT:{fields:['iban'],label:'IBAN'},
  LU:{fields:['iban'],label:'IBAN'}, MT:{fields:['iban'],label:'IBAN'},
  CY:{fields:['iban'],label:'IBAN'}, BG:{fields:['iban'],label:'IBAN'},
  RO:{fields:['iban'],label:'IBAN'}, LI:{fields:['iban'],label:'IBAN'},
  GI:{fields:['iban'],label:'IBAN'},
  _default:{fields:['account_number'],label:'Account Number'},
};

const COUNTRY_CURRENCIES = {
  US:['usd'],GB:['gbp','usd'],AU:['aud'],CA:['cad'],JP:['jpy'],
  SG:['sgd'],HK:['hkd'],IN:['inr'],MX:['mxn'],BR:['brl'],
  ZA:['zar'],NG:['ngn'],GH:['ghs'],KE:['kes'],
  DE:['eur'],FR:['eur'],IT:['eur'],ES:['eur'],NL:['eur'],
  BE:['eur'],AT:['eur'],PT:['eur'],GR:['eur'],IE:['eur'],
  FI:['eur'],SK:['eur'],SI:['eur'],EE:['eur'],LV:['eur'],
  LT:['eur'],LU:['eur'],MT:['eur'],CY:['eur'],
  CH:['chf','eur'],SE:['sek','eur'],NO:['nok','eur'],
  DK:['dkk','eur'],PL:['pln','eur'],HU:['huf','eur'],
  CZ:['czk','eur'],HR:['eur'],BG:['bgn','eur'],
  RO:['ron','eur'],LI:['chf','eur'],GI:['gbp','eur'],
  MY:['myr'],NZ:['nzd'],TH:['thb'],TT:['ttd'],UY:['uyu'],
  // Non-Stripe countries — stored fine, just note payout is manual
  AE:['aed'],SA:['sar'],PK:['pkr'],BD:['bdt'],PH:['php'],
  VN:['vnd'],TR:['try'],EG:['egp'],MA:['mad'],KR:['krw'],
};

const isLive = () => process.env.STRIPE_SECRET_KEY?.startsWith('sk_live');

// ── Config ────────────────────────────────────────────────────
app.get('/api/config', (req, res) => {
  res.json({ pk: process.env.STRIPE_PUBLISHABLE_KEY || '' });
});

// ── Health ────────────────────────────────────────────────────
app.get('/api/health', async (req, res) => {
  try {
    const b = await stripe.balance.retrieve();
    res.json({
      ok:   true,
      mode: isLive() ? 'live' : 'test',
      balance: b.available?.[0] ?? { amount:0, currency:'usd' },
    });
  } catch(e) { res.status(401).json({ ok:false, error:e.message }); }
});

// ── Supported metadata ────────────────────────────────────────
app.get('/api/supported', (req, res) => {
  // Return ALL countries — we no longer restrict to Stripe-supported only
  // since recipients are stored locally and payouts are manual
  res.json({
    countries:   Object.keys(COUNTRY_CURRENCIES),
    currencies:  COUNTRY_CURRENCIES,
    bankFormats: BANK_FORMATS,
  });
});

// ── Balance (from Stripe — your platform balance) ─────────────
app.get('/api/balance', async (req, res) => {
  try { res.json(await stripe.balance.retrieve()); }
  catch(e) { res.status(400).json({ error:e.message }); }
});


// ══════════════════════════════════════════════════════════════
// RECIPIENTS — stored entirely in KV, no Stripe accounts
// ══════════════════════════════════════════════════════════════

app.get('/api/recipients', async (req, res) => {
  const recipients = await dbGet('recipients');
  res.json({ data: recipients });
});

app.post('/api/recipients', async (req, res) => {
  const {
    name, email:recipEmail, country, bank_name,
    account_number, routing_number, sort_code, bsb_number,
    ifsc, iban, swift, currency, type = 'vendor', holder,
  } = req.body;

  if (!name || !recipEmail) return res.status(400).json({ error:'name and email are required' });
  if (!country)             return res.status(400).json({ error:'country is required' });

  const existing = await dbGet('recipients');
  if (existing.find(r => r.email === recipEmail))
    return res.status(400).json({ error:'A recipient with this email already exists' });

  const acctNum = iban || account_number || '';
  const countryUp = country.toUpperCase();

  const entry = {
    id:             'recip_' + Date.now(),
    name,
    email:          recipEmail,
    holder:         holder || name,
    country:        countryUp,
    bank_name:      bank_name || '—',
    // Bank fields — store all, use whichever apply for this country
    iban:           iban    || null,
    account_number: account_number  || null,
    routing_number: routing_number  || null,
    sort_code:      sort_code       || null,
    bsb_number:     bsb_number      || null,
    ifsc:           ifsc            || null,
    swift:          swift           || null,
    last4:          acctNum.replace(/[\s-]/g,'').slice(-4) || '—',
    currency:       currency || (COUNTRY_CURRENCIES[countryUp]?.[0] ?? 'usd'),
    type,
    status:         'active',
    created:        Math.floor(Date.now() / 1000),
    total_paid:     0,
  };

  existing.push(entry);
  await dbSet('recipients', existing);
  res.json(entry);
});

app.delete('/api/recipients/:id', async (req, res) => {
  const list = await dbGet('recipients');
  await dbSet('recipients', list.filter(r => r.id !== req.params.id));
  res.json({ deleted: true });
});


// ══════════════════════════════════════════════════════════════
// TRANSFERS — recorded in KV, emails sent, actual payout is manual
// ══════════════════════════════════════════════════════════════

app.get('/api/transfers', async (req, res) => {
  const transfers = await dbGet('transfers');
  res.json({ data: [...transfers].reverse() });
});

app.post('/api/transfers', async (req, res) => {
  const { recipient_id, amount, currency = 'usd', description } = req.body;
  if (!recipient_id)                    return res.status(400).json({ error:'recipient_id is required' });
  const numericAmount = Number(amount);
  if (!Number.isFinite(numericAmount) || numericAmount < 0.01)
    return res.status(400).json({ error:'Invalid amount' });

  const recipients = await dbGet('recipients');
  const r = recipients.find(x => x.id === recipient_id);
  if (!r) return res.status(404).json({ error:'Recipient not found' });

  const amountCents = Math.round(numericAmount * 100);

  const t = {
    id:             'tr_' + Date.now(),
    amount:         amountCents,
    currency:       currency.toLowerCase(),
    destination:    recipient_id,
    recipient_name: r.name,
    recipient_email:r.email,
    bank_name:      r.bank_name,
    last4:          r.last4,
    country:        r.country,
    iban:           r.iban,
    account_number: r.account_number,
    routing_number: r.routing_number,
    sort_code:      r.sort_code,
    swift:          r.swift,
    description:    description || 'Transfer',
    // Status is 'pending' — you mark it 'paid' once you actually send the money
    status:         'pending',
    created:        Math.floor(Date.now() / 1000),
    arrival_date:   Math.floor(Date.now() / 1000) + 86400 * 5,
    sender_name:    process.env.PLATFORM_NAME || 'PayGlobal Platform',
  };

  const transfers = await dbGet('transfers');
  transfers.push(t);
  await dbSet('transfers', transfers);

  // Update recipient total
  const ri = recipients.findIndex(x => x.id === recipient_id);
  if (ri !== -1) {
    recipients[ri].total_paid = (recipients[ri].total_paid || 0) + amountCents;
    await dbSet('recipients', recipients);
  }

  // Send notification emails (non-blocking)
  Promise.allSettled([
    email.sendPaymentInitiated(t),
    email.sendPaymentReceived(t),
  ]);

  res.json(t);
});

// ── Mark transfer as paid ─────────────────────────────────────
// Call this once you've actually sent the money via your bank/Wise
app.patch('/api/transfers/:id/mark-paid', async (req, res) => {
  const transfers = await dbGet('transfers');
  const idx = transfers.findIndex(t => t.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error:'Transfer not found' });

  transfers[idx].status    = 'paid';
  transfers[idx].paid_at   = Math.floor(Date.now() / 1000);
  transfers[idx].paid_note = req.body.note || '';
  await dbSet('transfers', transfers);

  res.json(transfers[idx]);
});


// ══════════════════════════════════════════════════════════════
// INVOICE
// ══════════════════════════════════════════════════════════════

app.post('/api/invoice', async (req, res) => {
  const { transfer_id, to, items, sender, recipient, tax_rate=0, notes, currency='usd', invoice_number } = req.body;
  if (!to)            return res.status(400).json({ error:'to is required' });
  if (!items?.length) return res.status(400).json({ error:'items array is required' });

  const transfers = await dbGet('transfers');
  const transfer  = transfers.find(t => t.id === transfer_id);
  const total     = items.reduce((s,i) => s + (i.quantity * (i.unit_price||0)), 0);

  const result = await email.sendInvoice(to, {
    invoice_number,
    transfer_id:  transfer_id || transfer?.id,
    issued_date:  Math.floor(Date.now() / 1000),
    sender:       sender   || { name:process.env.PLATFORM_NAME||'PayGlobal Platform', email:process.env.EMAIL_USER },
    recipient:    recipient || { name:transfer?.recipient_name, email:transfer?.recipient_email },
    items, currency, tax_rate, notes, total,
  });
  res.json(result);
});


// ── Test emails ───────────────────────────────────────────────
app.post('/api/email/test', async (req, res) => {
  const { type = 'initiated' } = req.body;
  const mock = {
    id:'tr_demo_001', amount:250000, currency:'usd',
    description:'Invoice #1042 — Web Development', status:'pending',
    created:Math.floor(Date.now()/1000), arrival_date:Math.floor(Date.now()/1000)+432000,
    recipient_name:'Test Recipient', recipient_email:req.body.to||process.env.OWNER_EMAIL,
    bank_name:'Test Bank', last4:'4242', country:'GB', iban:'GB29NWBK60161331926819',
    sender_name:process.env.PLATFORM_NAME||'PayGlobal Platform',
  };
  let result;
  if      (type==='initiated') result = await email.sendPaymentInitiated(mock, req.body.to);
  else if (type==='received')  result = await email.sendPaymentReceived({ ...mock, recipient_email:req.body.to });
  else if (type==='invoice')   result = await email.sendInvoice(req.body.to, {
    transfer_id:'tr_demo_001', currency:'usd', tax_rate:5, total:350000,
    sender:{ name:'PayGlobal Platform', email:process.env.EMAIL_USER, address:'Dubai, UAE', tax_id:'TRN-123456' },
    recipient:{ name:'Test Recipient', email:req.body.to, address:'London, UK' },
    items:[
      { description:'Web Development Services', quantity:1, unit_price:200000 },
      { description:'UI/UX Design',             quantity:2, unit_price:75000  },
    ],
    notes:'Payment due within 30 days.',
  });
  res.json(result || { error:'Unknown type' });
});

module.exports = app;