# 🚀 Deployment Guide — Restaurant Automation Platform

Full step-by-step instructions for Railway, Render, and Fly.io.

---

## 🚂 OPTION A — Railway (Recommended for beginners)

Railway offers the easiest deploy experience with built-in Redis and PostgreSQL.

### Steps

1. **Install Railway CLI**
   ```bash
   npm install -g @railway/cli
   railway login
   ```

2. **Create a new project**
   ```bash
   cd restaurant_automation
   railway init
   # Choose "Empty Project"
   ```

3. **Add Redis service**
   In the Railway dashboard → New Service → Database → Redis

4. **Add PostgreSQL service** (optional — defaults to SQLite)
   In the Railway dashboard → New Service → Database → PostgreSQL

5. **Set environment variables**
   ```bash
   railway variables set --file deploy/railway/.env.railway
   # Then fill in secrets individually:
   railway variables set OPENAI_API_KEY=sk-...
   railway variables set TWILIO_ACCOUNT_SID=AC...
   railway variables set TWILIO_AUTH_TOKEN=...
   railway variables set TWILIO_PHONE_NUMBER=+1...
   railway variables set SENDGRID_API_KEY=SG...
   railway variables set ALERT_EMAIL_TO=you@yourdomain.com
   railway variables set ALERT_EMAIL_FROM=noreply@yourdomain.com
   ```

6. **Deploy**
   ```bash
   railway up
   ```

7. **Get your public URL**
   ```bash
   railway domain
   # → https://restaurant-automation-production.up.railway.app
   ```

8. **Configure Twilio webhook**
   Set Voice webhook to: `https://<your-railway-url>/phone/incoming`

### Railway Pricing
- Starter: $5/month — covers a small restaurant
- Pro: $20/month — for higher volume

---

## 🎨 OPTION B — Render

Render has a generous free tier and supports background workers natively.

### Steps

1. **Push your code to GitHub**
   ```bash
   git init && git add . && git commit -m "Initial commit"
   git remote add origin https://github.com/YOUR_USERNAME/restaurant-automation
   git push -u origin main
   ```

2. **Create services on Render**
   Go to https://dashboard.render.com → New → Blueprint
   Upload `deploy/render/render.yaml` as the blueprint file.

   **OR create manually:**
   - New → Web Service → Connect your GitHub repo
   - Build Command: `pip install -r requirements.txt`
   - Start Command: `uvicorn orchestrator.main:app --host 0.0.0.0 --port $PORT`
   - New → Redis → (free tier available)

3. **Set environment variables**
   In Render dashboard → Environment → Add from the variables in `deploy/render/.env.render`

4. **Set secret vars** (use Render's Secret Files or Environment section)
   ```
   OPENAI_API_KEY = sk-...
   TWILIO_ACCOUNT_SID = AC...
   TWILIO_AUTH_TOKEN = ...
   SENDGRID_API_KEY = SG...
   ALERT_EMAIL_TO = you@yourdomain.com
   ```

5. **Deploy** — Render auto-deploys on every push to main.

6. **Configure Twilio webhook**
   Set Voice webhook to: `https://<your-render-url>.onrender.com/phone/incoming`

### Render Pricing
- Free tier: available (spins down after 15 min inactivity — not ideal for phone agent)
- Starter: $7/month/service — recommended

---

## 🪰 OPTION C — Fly.io

Fly.io is the most powerful option — globally distributed, persistent volumes, no cold starts.

### Steps

1. **Install flyctl**
   ```bash
   curl -L https://fly.io/install.sh | sh
   fly auth login
   ```

2. **Initialize the app**
   ```bash
   cd restaurant_automation
   fly launch --config deploy/flyio/fly.toml --no-deploy
   # Accept suggested app name or enter your own
   ```

3. **Create a persistent volume** (for SQLite + reports)
   ```bash
   fly volumes create restaurant_data --size 5 --region iad
   fly volumes create restaurant_reports --size 10 --region iad
   ```

4. **Create a Redis instance** (Upstash Redis — free tier)
   ```bash
   fly redis create
   # Note the redis URL it gives you
   ```

5. **Set secrets**
   ```bash
   fly secrets set \
     OPENAI_API_KEY=sk-... \
     TWILIO_ACCOUNT_SID=AC... \
     TWILIO_AUTH_TOKEN=... \
     TWILIO_PHONE_NUMBER=+1... \
     SENDGRID_API_KEY=SG... \
     ALERT_EMAIL_TO=you@yourdomain.com \
     ALERT_EMAIL_FROM=noreply@yourdomain.com \
     REDIS_URL=redis://... \
     RESTAURANT_NAME="My Restaurant"
   ```

6. **Deploy**
   ```bash
   fly deploy
   ```

7. **Get your public hostname**
   ```bash
   fly status
   # → your-app-name.fly.dev
   ```

8. **Configure Twilio webhook**
   Set Voice webhook to: `https://your-app-name.fly.dev/phone/incoming`

### Fly.io Pricing
- Free tier: 3 shared VMs — sufficient for a single restaurant
- Pay-as-you-go after free allowance

---

## 📧 Email Alerts Setup (all platforms)

### Option 1: SendGrid (Recommended)
1. Sign up at https://sendgrid.com (free tier: 100 emails/day)
2. Go to Settings → API Keys → Create API Key (Full Access)
3. Verify a sender email in Settings → Sender Authentication
4. Set: `SENDGRID_API_KEY=SG.xxxxx` and `ALERT_EMAIL_FROM=verified@yourdomain.com`

### Option 2: SMTP (Gmail, Outlook, etc.)
1. For Gmail: enable 2FA → App Passwords → generate password
2. Set:
   ```
   SMTP_HOST=smtp.gmail.com
   SMTP_PORT=587
   SMTP_USER=you@gmail.com
   SMTP_PASSWORD=xxxx-xxxx-xxxx-xxxx   ← App Password
   ```

---

## 🔄 Post-Deploy Checklist

- [ ] Health check passes: `GET /health`
- [ ] API docs load: `GET /docs`
- [ ] Twilio webhook configured and verified (test with a real call)
- [ ] SendGrid sender verified
- [ ] Menu items seeded: `POST /inventory/` or `python setup.py`
- [ ] Test a low-stock alert email by calling `POST /inventory/{sku}/adjust` with a negative delta
- [ ] Verify nightly report runs (or trigger manually via `GET /accounting/report/download`)
- [ ] DoorDash/UberEats webhook URLs registered in their developer portals

---

## 🌐 Webhook URLs to Register

After deployment, register these in each platform's developer portal:

| Platform | Webhook URL |
|---|---|
| Twilio Voice | `https://YOUR_DOMAIN/phone/incoming` |
| DoorDash | `https://YOUR_DOMAIN/webhooks/doordash` |
| Uber Eats | `https://YOUR_DOMAIN/webhooks/ubereats` |
| Your Website | `https://YOUR_DOMAIN/webhooks/website` |
