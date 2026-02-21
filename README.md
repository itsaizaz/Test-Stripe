# PayGlobal — Vercel Deployment Guide

## Prerequisites
- Node.js 18+ installed
- A [Vercel account](https://vercel.com) (free)
- Your Stripe live keys
- Resend API key + verified domain

---

## Step-by-step deploy

### 1. Install Vercel CLI
```bash
npm install -g vercel
```

### 2. Login to Vercel
```bash
vercel login
```

### 3. Install dependencies
```bash
npm install
```

### 4. Create Vercel KV (Redis database)
This replaces the local JSON files — stores recipients and transfers permanently.
```bash
vercel kv create payglobal-db
```
When prompted, link to your project. Then pull the credentials:
```bash
vercel env pull .env.local
```
This auto-fills `KV_REST_API_URL` and `KV_REST_API_TOKEN` in your `.env.local`.

### 5. Add your environment variables
Edit `.env.local` and fill in:
```
STRIPE_SECRET_KEY=sk_live_...
STRIPE_PUBLISHABLE_KEY=pk_live_...
RESEND_API_KEY=re_...
EMAIL_FROM="PayGlobal Payouts <noreply@yourdomain.com>"
OWNER_EMAIL=you@yourdomain.com
PLATFORM_NAME=PayGlobal Platform
```

### 6. First deploy
```bash
vercel
```
Copy the preview URL it gives you (e.g. `https://payglobal-xyz.vercel.app`).

### 7. Set APP_URL
Add the URL from step 6 to your `.env.local`:
```
APP_URL=https://payglobal-xyz.vercel.app
```

### 8. Push all env vars to Vercel
```bash
vercel env add STRIPE_SECRET_KEY
vercel env add STRIPE_PUBLISHABLE_KEY
vercel env add RESEND_API_KEY
vercel env add EMAIL_FROM
vercel env add OWNER_EMAIL
vercel env add PLATFORM_NAME
vercel env add APP_URL
```
For each command, paste the value when prompted and select "Production, Preview, Development".

### 9. Deploy to production
```bash
vercel --prod
```

Your app is live at `https://payglobal-xyz.vercel.app` 🚀

---

## Updating after deploy

Any code change:
```bash
vercel --prod
```

To update an env variable:
```bash
vercel env rm VARIABLE_NAME
vercel env add VARIABLE_NAME
vercel --prod
```

---

## Project structure

```
payglobal-vercel/
├── api/
│   └── index.js          ← All API routes (Express, runs as Vercel serverless)
├── emails/
│   ├── emailService.js   ← Nodemailer / Resend sender
│   └── templates.js      ← HTML email templates
├── public/
│   └── index.html        ← Frontend dashboard (served as static)
├── vercel.json           ← Routes /api/* → serverless, /* → static
├── package.json
└── .env.local            ← Local dev env vars (never commit this)
```

---

## Local development

```bash
vercel dev
```
This runs everything locally with the same routing as production.
Open http://localhost:3000

---

## Notes

- **KV storage**: Recipients and transfers are stored in Vercel KV (Redis).
  Free tier: 30,000 requests/month — more than enough.
- **HTTPS**: Vercel always serves over HTTPS — the Stripe live mode redirect issue is automatically solved.
- **Serverless limits**: Each API request has a 10s timeout on the free Hobby plan.
  Vercel Pro extends this to 60s.