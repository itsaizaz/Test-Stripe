# Stripe Payout Dashboard

A full-stack payout dashboard built with Node.js/Express + Stripe API.

---

## 🚀 Setup (5 minutes)

### 1. Install dependencies
```bash
npm install
```

### 2. Add your Stripe keys

Open `.env` and replace the placeholder:
```
STRIPE_SECRET_KEY=sk_test_YOUR_SECRET_KEY_HERE
PORT=3001
```

Open `public/index.html` and find this line near the bottom:
```js
const stripe = Stripe('pk_test_YOUR_PUBLISHABLE_KEY_HERE');
```
Replace with your **publishable** key (starts with `pk_test_`).

> Get both keys from: https://dashboard.stripe.com/apikeys

### 3. Start the server
```bash
# Development (auto-restart on changes)
npm run dev

# Or production
npm start
```

### 4. Open the dashboard
```
http://localhost:3001
```

---

## 📁 Project Structure

```
stripe-payouts/
├── server.js          ← Express API (Stripe secret key lives here)
├── public/
│   └── index.html     ← Frontend dashboard
├── .env               ← Your Stripe secret key (never commit this!)
└── package.json
```

---

## 🔌 API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/balance` | Retrieve available & pending balance |
| GET | `/api/payouts` | List payouts (optional: `?status=paid&limit=50`) |
| POST | `/api/payouts` | Initiate a payout `{ amount, destination, description }` |
| GET | `/api/payouts/:id` | Get single payout details |
| GET | `/api/bank-accounts` | List all bank accounts |
| POST | `/api/bank-accounts` | Add bank account `{ token }` from Stripe.js |
| PATCH | `/api/bank-accounts/:id/default` | Set as default payout account |
| DELETE | `/api/bank-accounts/:id` | Remove a bank account |

---

## ⚠️ Important Notes

- **Secret key** (`sk_test_...`) stays in `.env` — the server uses it
- **Publishable key** (`pk_test_...`) goes in the frontend HTML — safe to expose
- Bank account numbers are **never sent to your server** — Stripe.js tokenizes them in the browser
- Add `.env` to `.gitignore` before pushing to GitHub

---

## 🧪 Test with Stripe test data

Use these test routing/account numbers:
- Routing: `110000000`
- Account: `000123456789` (success)
- Account: `000111111116` (will fail with account_closed error)

More test numbers: https://stripe.com/docs/connect/testing#payouts
