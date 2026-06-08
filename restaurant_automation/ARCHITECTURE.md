# Restaurant Automation System — Architecture

## Overview
A fully integrated, event-driven automation platform for restaurants with five core subsystems
communicating over an internal message bus.

```
┌─────────────────────────────────────────────────────────────────────┐
│                     RESTAURANT AUTOMATION PLATFORM                    │
│                                                                       │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────────────┐   │
│  │  AI PHONE    │    │  ORDER       │    │  INVENTORY &         │   │
│  │  AGENT       │───▶│  PROCESSOR   │───▶│  ACCOUNTING ENGINE   │   │
│  │  (Twilio +   │    │  (validation,│    │  (real-time ledger,  │   │
│  │   OpenAI)    │    │   routing)   │    │   spreadsheets)      │   │
│  └──────────────┘    └──────┬───────┘    └──────────┬───────────┘   │
│                             │                        │               │
│                             ▼                        ▼               │
│                    ┌────────────────┐    ┌───────────────────────┐   │
│                    │  MESSAGE BUS   │    │  SYNC LAYER           │   │
│                    │  (Redis pub/   │◀──▶│  (Website + 3rd Party │   │
│                    │   sub / async) │    │   DoorDash, UberEats) │   │
│                    └────────────────┘    └───────────────────────┘   │
│                             │                                         │
│                             ▼                                         │
│                    ┌────────────────┐                                 │
│                    │  ORCHESTRATOR  │                                 │
│                    │  (FastAPI app, │                                 │
│                    │   scheduler,   │                                 │
│                    │   dashboard)   │                                 │
│                    └────────────────┘                                 │
└─────────────────────────────────────────────────────────────────────┘
```

## Module Breakdown

### 1. phone_agent/
- `agent.py`         — Main call handler, Twilio webhook receiver
- `conversation.py`  — GPT-4o conversation manager, prompt templates
- `order_parser.py`  — Extract structured order from transcript
- `hours.py`         — Business hours gating, after-hours voicemail

### 2. inventory/
- `inventory_db.py`  — SQLite-backed inventory store (swap to Postgres in prod)
- `ledger.py`        — Double-entry accounting ledger
- `spreadsheet.py`   — Excel/XLSX auto-generation with openpyxl
- `purchase_order.py`— PO creation, supplier tracking

### 3. accounting/
- `cash_flow.py`     — Operating/investing/financing cash flow statements
- `pnl.py`           — Profit & loss: revenue, COGS, gross margin
- `loss_gain.py`     — Inventory valuation changes (FIFO/weighted avg)
- `reports.py`       — Scheduled report generation

### 4. sync/
- `website_sync.py`  — Push menu/inventory to restaurant website via REST
- `doordash_sync.py` — DoorDash Drive API integration
- `ubereats_sync.py` — Uber Eats Orders API integration
- `webhook_router.py`— Inbound webhooks from third-party platforms

### 5. orchestrator/
- `main.py`          — FastAPI app, lifespan, router registration
- `bus.py`           — Internal async event bus (asyncio queues + Redis)
- `scheduler.py`     — APScheduler jobs (nightly reports, sync checks)
- `config.py`        — Pydantic settings, env var loading

### 6. dashboard/
- `dashboard.html`   — Single-page ops dashboard (deployed via generate_app)

## Data Flow — Order Lifecycle
1. Customer calls → Twilio forwards to `/phone/incoming`
2. Phone agent answers, converses via GPT-4o, captures order
3. Order sent to Order Processor → validated, priced, confirmed
4. Inventory Engine deducts items atomically
5. Message Bus broadcasts `order.confirmed` event
6. Accounting Ledger records revenue entry
7. Sync Layer pushes updated inventory to website + 3rd party platforms
8. If order fails/cancelled → rollback inventory, reverse ledger entry
9. Nightly scheduler generates XLSX accounting reports

## Tech Stack
| Layer | Technology |
|---|---|
| Phone | Twilio Voice + Media Streams |
| AI/NLP | OpenAI GPT-4o (chat completions) |
| API | FastAPI (Python 3.11+) |
| Database | SQLite (dev) / PostgreSQL (prod) |
| Cache/Bus | Redis (pub/sub + caching) |
| Scheduler | APScheduler |
| Spreadsheets | openpyxl |
| 3rd Party | DoorDash Drive API, Uber Eats Orders API |
| Deploy | Docker + docker-compose |

## Environment Variables Required
```
OPENAI_API_KEY=
TWILIO_ACCOUNT_SID=
TWILIO_AUTH_TOKEN=
TWILIO_PHONE_NUMBER=
REDIS_URL=redis://localhost:6379
DATABASE_URL=sqlite:///./restaurant.db
WEBSITE_API_URL=
WEBSITE_API_KEY=
DOORDASH_DEVELOPER_ID=
DOORDASH_KEY_ID=
DOORDASH_SIGNING_SECRET=
UBEREATS_CLIENT_ID=
UBEREATS_CLIENT_SECRET=
RESTAURANT_NAME=
RESTAURANT_TIMEZONE=America/New_York
BUSINESS_OPEN_TIME=11:00
BUSINESS_CLOSE_TIME=22:00
```
