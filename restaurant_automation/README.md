# 🍽️ Restaurant Automation Platform

A fully integrated, event-driven automation platform combining an **AI phone agent**, **real-time inventory management**, **automated accounting**, and **multi-platform sync** (DoorDash, Uber Eats, your website).

---

## 🚀 Quick Start (Local)

### 1. Clone & configure
```bash
git clone <your-repo>
cd restaurant_automation
cp .env.example .env
# Edit .env with your API keys
```

### 2. Install dependencies
```bash
python -m venv venv
source venv/bin/activate        # Windows: venv\Scripts\activate
pip install -r requirements.txt
```

### 3. Run setup (creates DB tables, seeds menu items)
```bash
python setup.py
```

### 4. Start the server
```bash
uvicorn orchestrator.main:app --reload --port 8000
```

### 5. Explore the API
Open http://localhost:8000/docs for the interactive Swagger UI.

---

## 🐳 Docker Deployment

```bash
# Production
docker-compose up -d

# Development (with Ngrok tunnel for Twilio webhooks)
docker-compose --profile dev up -d
```

---

## 📞 Twilio Phone Agent Setup

1. Buy a Twilio phone number at https://console.twilio.com
2. Set the **Voice webhook** URL to: `https://yourdomain.com/phone/incoming`
3. Method: **HTTP POST**
4. Fill in `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_PHONE_NUMBER` in `.env`

**Local dev with Ngrok:**
```bash
docker-compose --profile dev up ngrok
# Check http://localhost:4040 for your public URL
# Set Twilio webhook to: https://<ngrok-id>.ngrok.io/phone/incoming
```

---

## 📦 Menu Management

Edit `menu.json` to add/update menu items. Format:
```json
{
  "sku": "ITEM-001",
  "name": "My Item",
  "category": "mains",
  "unit": "each",
  "qty_on_hand": 50,
  "reorder_level": 10,
  "cost_per_unit": 3.50,
  "sell_price": 12.99
}
```

Re-run `python setup.py` or call `POST /inventory/` to add items live.

---

## 📊 Accounting Reports

Reports are auto-generated nightly at 2:00 AM (restaurant timezone) into the `reports/` folder.

**Manual download via API:**
```
GET /accounting/report/download?start=2026-06-01&end=2026-06-06
```

**Workbook sheets:**
| Sheet | Contents |
|---|---|
| 📊 Summary | Key metrics dashboard |
| 💰 P&L | Revenue, COGS, expenses, net income |
| 💵 Cash Flow | Operating/investing/financing cash flows |
| 📦 Inventory | All items with valuation and status |
| 📋 Transactions | Inventory debit/credit log |
| 🛒 Purchase Orders | PO tracking with supplier and status |

---

## 🔗 API Endpoints

| Method | Path | Description |
|---|---|---|
| GET | `/health` | Health check |
| POST | `/phone/incoming` | Twilio call entry (webhook) |
| POST | `/phone/gather` | Speech-to-order processing |
| GET | `/inventory/` | List all items |
| POST | `/inventory/` | Create/update item |
| POST | `/inventory/{sku}/adjust` | Manual quantity adjustment |
| GET | `/inventory/low-stock` | Items below reorder level |
| POST | `/inventory/purchase-orders/` | Create purchase order |
| POST | `/inventory/purchase-orders/{po}/receive` | Receive PO (restocks inventory) |
| GET | `/accounting/pnl` | P&L for date range |
| GET | `/accounting/cash-flow` | Cash flow statement |
| GET | `/accounting/balances` | Chart of accounts balances |
| GET | `/accounting/report/download` | Download XLSX workbook |
| POST | `/webhooks/doordash` | DoorDash status webhook |
| POST | `/webhooks/ubereats` | Uber Eats order webhook |
| POST | `/webhooks/website` | Website order webhook |

---

## 🏗️ Architecture

```
Phone Call → AI Agent (GPT-4o) → Order Parser
                                        ↓
                              Order Processor (validation)
                                        ↓
                    ┌───────────────────┴───────────────────┐
              Inventory Engine                    Accounting Ledger
              (atomic deduct)                  (revenue + COGS entry)
                    ↓                                        ↓
              Event Bus (order.confirmed)          Report Generator
                    ↓                                (nightly XLSX)
         Sync Layer (website + DoorDash + Uber Eats)
```

---

## 📅 Scheduled Jobs

| Job | Schedule | Description |
|---|---|---|
| Nightly Report | Daily @ 2:00 AM | Full XLSX accounting workbook |
| Low Stock Check | Every 15 min | Alert on items below reorder level |
| Platform Sync | Every hour | Full menu sync to all platforms |
| Weekly P&L | Monday @ 3:00 AM | 7-day rolling P&L workbook |

---

## 🔌 Third-Party Integrations

### DoorDash Drive API
- Real-time item availability sync
- Delivery quote and dispatch requests
- Webhook receiver for delivery status updates
- Docs: https://developer.doordash.com/en-US/docs/drive/

### Uber Eats Orders API  
- OAuth2 authentication (auto-refreshed tokens)
- Item availability toggle
- Inbound order webhook handling
- Docs: https://developer.uber.com/docs/eats/introduction

### Website Sync
- Generic REST API push (works with WooCommerce, Squarespace, custom CMS)
- Sends: SKU, name, price, stock qty, in_stock flag
- Configure `WEBSITE_API_URL` to match your CMS endpoint format

---

## 🛠️ Extending the System

**Add a new event handler:**
```python
# orchestrator/event_handlers.py
@bus.on("my.custom.event")
async def handle_my_event(payload: dict) -> None:
    ...
```

**Add a new scheduled job:**
```python
# orchestrator/scheduler.py
_scheduler.add_job(my_job_fn, CronTrigger(hour=6), id="my_job")
```

**Add a new sync platform:**
```python
# sync/grubhub_sync.py — follow doordash_sync.py as template
```

**Switch to PostgreSQL:**
```
DATABASE_URL=postgresql+asyncpg://user:pass@host:5432/restaurant
```
