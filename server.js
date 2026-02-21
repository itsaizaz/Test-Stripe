require('dotenv').config();
const express  = require('express');
const cors     = require('cors');
const Stripe   = require('stripe');
const path     = require('path');
const fs       = require('fs');
const email    = require('./emailservice');

const app    = express();
const stripe = Stripe(process.env.STRIPE_SECRET_KEY);

app.use(cors());
app.use(express.json());

// Serve frontend with injected publishable key
app.get('/', (req, res) => {
  let html = fs.readFileSync(path.join(__dirname, 'public', 'index.html'), 'utf8');
  html = html.replace('__STRIPE_PK__', process.env.STRIPE_PUBLISHABLE_KEY || '');
  res.send(html);
});
app.use(express.static(path.join(__dirname, 'public')));

const isLive = () => process.env.STRIPE_SECRET_KEY?.startsWith('sk_live');

// ── Supported countries / currencies / bank formats ───────────
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
};

// ── Local stores ───────────────────────────────────────────────
const RFILE = path.join(__dirname, 'recipients.json');
const TFILE = path.join(__dirname, 'transfers.json');
const readR  = () => { try { return JSON.parse(fs.readFileSync(RFILE,'utf8')); } catch { return []; } };
const writeR = d => fs.writeFileSync(RFILE, JSON.stringify(d, null, 2));
const readT  = () => { try { return JSON.parse(fs.readFileSync(TFILE,'utf8')); } catch { return []; } };
const writeT = d => fs.writeFileSync(TFILE, JSON.stringify(d, null, 2));

// ── Health ────────────────────────────────────────────────────
app.get('/api/health', async (req, res) => {
  try {
    const b = await stripe.balance.retrieve();
    res.json({ ok:true, mode:isLive()?'live':'test', balance:b.available?.[0]??{amount:0,currency:'usd'} });
  } catch(e) { res.status(401).json({ ok:false, error:e.message }); }
});

// ── Supported metadata ────────────────────────────────────────
app.get('/api/supported', (req, res) => {
  res.json({ countries:Array.from(SUPPORTED_COUNTRIES), currencies:COUNTRY_CURRENCIES, bankFormats:BANK_FORMATS });
});

// ── Balance ───────────────────────────────────────────────────
app.get('/api/balance', async (req, res) => {
  try { res.json(await stripe.balance.retrieve()); }
  catch(e) { res.status(400).json({ error:e.message }); }
});

// ── List transfers ────────────────────────────────────────────
app.get('/api/transfers', async (req, res) => {
  if (!isLive()) return res.json({ data:readT().reverse() });
  try { res.json(await stripe.transfers.list({ limit:100 })); }
  catch(e) { res.status(400).json({ error:e.message }); }
});

// ── Create transfer + send emails ─────────────────────────────
app.post('/api/transfers', async (req, res) => {
  const { recipient_id, amount, currency='usd', description } = req.body;
  if (!recipient_id) return res.status(400).json({ error:'recipient_id is required' });
  if (!amount || parseFloat(amount)<0.5) return res.status(400).json({ error:'Invalid amount' });

  const amountCents = Math.round(parseFloat(amount)*100);

  if (!isLive() || recipient_id.startsWith('acct_test_')) {
    const recipients = readR();
    const r = recipients.find(x=>x.id===recipient_id);
    if (!r) return res.status(404).json({ error:'Recipient not found' });

    const t = {
      id:              'tr_test_'+Date.now(),
      amount:          amountCents, currency:currency.toLowerCase(),
      destination:     recipient_id,
      recipient_name:  r.name, recipient_email:r.email,
      bank_name:       r.bank_name, last4:r.last4, country:r.country,
      description:     description||'Transfer', status:'paid',
      created:         Math.floor(Date.now()/1000),
      arrival_date:    Math.floor(Date.now()/1000)+86400*5,
      sender_name:     process.env.PLATFORM_NAME||'PayGlobal Platform',
    };

    const transfers = readT(); transfers.push(t); writeT(transfers);
    const ri = recipients.findIndex(x=>x.id===recipient_id);
    if (ri!==-1) { recipients[ri].total_paid=(recipients[ri].total_paid||0)+amountCents; writeR(recipients); }

    // ── Send emails (non-blocking) ─────────────────────────
    Promise.allSettled([
      email.sendPaymentInitiated(t),
      email.sendPaymentReceived(t),
    ]).then(results => {
      results.forEach((r,i) => {
        if (r.status==='fulfilled' && r.value?.previewUrl) {
          console.log(`📧 Email ${i+1} preview:`, r.value.previewUrl);
        }
      });
    });

    return res.json(t);
  }

  // Live mode
  try {
    const t = await stripe.transfers.create({
      amount:amountCents, currency:currency.toLowerCase(),
      destination:recipient_id, description:description||'Transfer',
    });

    // Enrich with recipient info for email
    const recipients = readR();
    const r = recipients.find(x=>x.id===recipient_id);
    const enriched = { ...t, recipient_name:r?.name, recipient_email:r?.email, bank_name:r?.bank_name, last4:r?.last4, country:r?.country, sender_name:process.env.PLATFORM_NAME||'PayGlobal Platform' };

    Promise.allSettled([
      email.sendPaymentInitiated(enriched),
      email.sendPaymentReceived(enriched),
    ]);

    res.json(enriched);
  } catch(e) { res.status(400).json({ error:e.message }); }
});

// ── List recipients ───────────────────────────────────────────
app.get('/api/recipients', async (req, res) => {
  if (!isLive()) return res.json({ data:readR() });
  try { res.json(await stripe.accounts.list({ limit:100 })); }
  catch(e) { res.status(400).json({ error:e.message }); }
});

// ── Create recipient ──────────────────────────────────────────
app.post('/api/recipients', async (req, res) => {
  const { name, email:recipEmail, country, bank_name, account_number,
          routing_number, sort_code, bsb_number, ifsc, iban, swift, currency, type='vendor' } = req.body;

  if (!name||!recipEmail) return res.status(400).json({ error:'name and email are required' });
  if (!country)           return res.status(400).json({ error:'country is required' });
  if (!SUPPORTED_COUNTRIES.has(country.toUpperCase())) {
    return res.status(400).json({
      error:`Stripe does not support payouts to ${country}. See /coverage for supported countries.`,
      unsupported_country:true,
    });
  }

  if (!isLive()) {
    const existing = readR();
    if (existing.find(r=>r.email===recipEmail)) return res.status(400).json({ error:'Recipient with this email already exists' });
    const acctNum = iban||account_number||'';
    const entry = {
      id:'acct_test_'+Date.now(), name, email:recipEmail,
      country:country.toUpperCase(), bank_name:bank_name||'—',
      account_number, routing_number, sort_code, bsb_number, ifsc, iban, swift,
      last4:acctNum.replace(/\s/g,'').slice(-4),
      currency:currency||(COUNTRY_CURRENCIES[country.toUpperCase()]?.[0]??'usd'),
      type, status:'active', created:Math.floor(Date.now()/1000), total_paid:0, _local:true,
    };
    existing.push(entry); writeR(existing);
    return res.json(entry);
  }

  try {
    const acct = await stripe.accounts.create({
      type:'express', country:country.toUpperCase(), email:recipEmail,
      capabilities:{ card_payments:{ requested:true }, transfers:{ requested:true } },
      metadata:{ display_name:name, bank_name, recipient_type:type },
    });
    const link = await stripe.accountLinks.create({
      account:acct.id,
      refresh_url:`http://localhost:${process.env.PORT||3001}/?refresh=1`,
      return_url:`http://localhost:${process.env.PORT||3001}/?onboarded=1`,
      type:'account_onboarding',
    });
    res.json({ ...acct, onboarding_url:link.url });
  } catch(e) { res.status(400).json({ error:e.message }); }
});

// ── Delete recipient ──────────────────────────────────────────
app.delete('/api/recipients/:id', async (req, res) => {
  if (!isLive()||req.params.id.startsWith('acct_test_')) {
    writeR(readR().filter(r=>r.id!==req.params.id));
    return res.json({ deleted:true });
  }
  try { res.json(await stripe.accounts.del(req.params.id)); }
  catch(e) { res.status(400).json({ error:e.message }); }
});

// ── Send invoice email ────────────────────────────────────────
// POST /api/invoice
// Body: { transfer_id, to (email), items[], sender{}, recipient{}, tax_rate, notes }
app.post('/api/invoice', async (req, res) => {
  const { transfer_id, to, items, sender, recipient, tax_rate=0, notes, currency='usd', invoice_number } = req.body;

  if (!to)    return res.status(400).json({ error:'to (email address) is required' });
  if (!items?.length) return res.status(400).json({ error:'items array is required' });

  // Find transfer for reference
  const transfers = readT();
  const transfer  = transfers.find(t=>t.id===transfer_id);
  const total     = items.reduce((s,i)=>s+(i.quantity*(i.unit_price||0)),0);

  const result = await email.sendInvoice(to, {
    invoice_number,
    transfer_id:   transfer_id||transfer?.id,
    issued_date:   Math.floor(Date.now()/1000),
    sender:        sender  || { name:process.env.PLATFORM_NAME||'PayGlobal Platform', email:process.env.EMAIL_USER },
    recipient:     recipient || { name:transfer?.recipient_name, email:transfer?.recipient_email },
    items,
    currency,
    tax_rate,
    notes,
    total,
  });

  res.json(result);
});

// ── Test email endpoint (dev only) ────────────────────────────
app.post('/api/email/test', async (req, res) => {
  const { type='initiated' } = req.body;
  const mockTransfer = {
    id:'tr_test_demo', amount:250000, currency:'usd',
    description:'Invoice #1042 — Web Development', status:'paid',
    created:Math.floor(Date.now()/1000), arrival_date:Math.floor(Date.now()/1000)+432000,
    recipient_name:'Ahmad Al Rashidi', recipient_email:req.body.to||process.env.OWNER_EMAIL||process.env.EMAIL_USER,
    bank_name:'Emirates NBD', last4:'4242', country:'US',
    sender_name:process.env.PLATFORM_NAME||'PayGlobal Platform',
  };

  let result;
  if (type==='initiated') result = await email.sendPaymentInitiated(mockTransfer, req.body.to);
  else if (type==='received') result = await email.sendPaymentReceived({ ...mockTransfer, recipient_email:req.body.to||process.env.OWNER_EMAIL });
  else if (type==='invoice') {
    result = await email.sendInvoice(req.body.to||process.env.OWNER_EMAIL, {
      transfer_id:'tr_test_demo', currency:'usd', tax_rate:5,
      sender:{ name:'PayGlobal Platform', email:process.env.EMAIL_USER, address:'Dubai, UAE', tax_id:'TRN-123456' },
      recipient:{ name:'Ahmad Al Rashidi', email:req.body.to, address:'Abu Dhabi, UAE' },
      items:[
        { description:'Web Development Services', quantity:1, unit_price:200000 },
        { description:'UI/UX Design',             quantity:2, unit_price:75000  },
        { description:'API Integration',          quantity:3, unit_price:50000  },
      ],
      notes:'Payment due within 30 days. Bank transfer reference: TR-2025-1042.',
    });
  }

  res.json(result||{ error:'Unknown type' });
});

// ── Catch-all ─────────────────────────────────────────────────
app.get('*', (req, res) => {
  let html = fs.readFileSync(path.join(__dirname, 'public', 'index.html'), 'utf8');
  html = html.replace('__STRIPE_PK__', process.env.STRIPE_PUBLISHABLE_KEY||'');
  res.send(html);
});

const PORT = process.env.PORT||3001;
app.listen(PORT, async () => {
  console.log(`\n✅  Stripe Connect Payouts → http://localhost:${PORT}`);
  console.log(`   Mode: ${isLive()?'🟢 LIVE':'🟡 TEST'} | Countries: ${SUPPORTED_COUNTRIES.size}`);
  await email.verifyConnection();
  console.log('');
});