"""
notifications/email_alerts.py — Multi-provider email alert engine.

Supports:
  1. SendGrid (preferred — reliable deliverability, free 100/day)
  2. SMTP fallback (Gmail, Outlook, custom SMTP)

Alert types:
  - Low stock warning (per item)
  - Low stock digest (batched, hourly)
  - Order confirmed summary
  - Order failed / rollback notification
  - Nightly accounting report (with XLSX attachment)
  - Weekly P&L summary
  - Platform sync failure
  - Purchase order received confirmation

Configure via .env:
  EMAIL_PROVIDER=sendgrid|smtp
  SENDGRID_API_KEY=SG.xxx
  SMTP_HOST=smtp.gmail.com
  SMTP_PORT=587
  SMTP_USER=you@gmail.com
  SMTP_PASSWORD=app-password
  ALERT_EMAIL_FROM=noreply@myrestaurant.com
  ALERT_EMAIL_TO=owner@myrestaurant.com,manager@myrestaurant.com
  ALERT_EMAIL_CC=                         (optional)
  EMAIL_ALERTS_ENABLED=true
"""
from __future__ import annotations

import asyncio
import base64
import logging
import smtplib
import ssl
from datetime import date, datetime, timezone
from email.mime.application import MIMEApplication
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from pathlib import Path
from typing import Optional

import httpx

from orchestrator.config import settings

log = logging.getLogger(__name__)


# ── HTML email templates ─────────────────────────────────────────────────────

_BASE_HTML = """
<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<style>
  body {{ font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
          background:#f1f5f9; margin:0; padding:0; }}
  .wrapper {{ max-width:600px; margin:0 auto; background:#fff;
               border-radius:12px; overflow:hidden; margin-top:24px; }}
  .header {{ background:linear-gradient(135deg,#1e3a5f,#0f172a);
             padding:28px 32px; }}
  .header h1 {{ color:#fff; margin:0; font-size:22px; font-weight:700; }}
  .header p  {{ color:#94a3b8; margin:6px 0 0; font-size:13px; }}
  .body {{ padding:28px 32px; }}
  .kpi-row {{ display:flex; gap:12px; margin-bottom:20px; }}
  .kpi {{ flex:1; background:#f8fafc; border-radius:8px;
           padding:14px 16px; border-left:4px solid {accent}; }}
  .kpi .label {{ font-size:11px; color:#64748b; text-transform:uppercase;
                  letter-spacing:.05em; }}
  .kpi .value {{ font-size:22px; font-weight:700; color:#0f172a; margin-top:4px; }}
  table {{ width:100%; border-collapse:collapse; margin:16px 0; font-size:14px; }}
  th {{ background:#f1f5f9; padding:10px 12px; text-align:left;
        font-size:11px; color:#64748b; text-transform:uppercase; }}
  td {{ padding:10px 12px; border-bottom:1px solid #f1f5f9; color:#1e293b; }}
  tr:hover td {{ background:#fafafa; }}
  .badge {{ display:inline-block; padding:3px 10px; border-radius:99px;
             font-size:11px; font-weight:600; }}
  .badge-red    {{ background:#fee2e2; color:#dc2626; }}
  .badge-amber  {{ background:#fef3c7; color:#d97706; }}
  .badge-green  {{ background:#dcfce7; color:#16a34a; }}
  .badge-blue   {{ background:#dbeafe; color:#2563eb; }}
  .alert-box {{ background:#fef2f2; border:1px solid #fecaca;
                 border-radius:8px; padding:16px 20px; margin-bottom:18px; }}
  .alert-box.amber {{ background:#fffbeb; border-color:#fde68a; }}
  .alert-box.green {{ background:#f0fdf4; border-color:#bbf7d0; }}
  .footer {{ background:#f8fafc; padding:16px 32px; text-align:center;
              font-size:12px; color:#94a3b8; border-top:1px solid #e2e8f0; }}
  .btn {{ display:inline-block; padding:12px 24px; background:#10b981;
           color:#fff; border-radius:8px; text-decoration:none;
           font-weight:600; font-size:14px; margin-top:16px; }}
</style>
</head>
<body>
<div class="wrapper">
  <div class="header">
    <h1>🍽️ {restaurant_name}</h1>
    <p>{subtitle}</p>
  </div>
  <div class="body">
    {body}
  </div>
  <div class="footer">
    Restaurant Automation Platform · {timestamp} ·
    <a href="http://localhost:8000/docs" style="color:#64748b;">View Dashboard</a>
  </div>
</div>
</body>
</html>
"""


def _wrap(body: str, subtitle: str, accent: str = "#10b981") -> str:
    return _BASE_HTML.format(
        restaurant_name=settings.restaurant_name,
        subtitle=subtitle,
        body=body,
        accent=accent,
        timestamp=datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC"),
    )


# ── Email sending core ───────────────────────────────────────────────────────

class EmailClient:
    """Unified send interface — routes to SendGrid or SMTP."""

    def __init__(self):
        self.provider  = settings.email_provider
        self.enabled   = settings.email_alerts_enabled
        self.from_addr = settings.alert_email_from
        self.to_addrs  = [e.strip() for e in settings.alert_email_to.split(",") if e.strip()]
        self.cc_addrs  = [e.strip() for e in (settings.alert_email_cc or "").split(",") if e.strip()]

    async def send(
        self,
        subject: str,
        html_body: str,
        to_override: list[str] | None = None,
        attachments: list[dict] | None = None,
    ) -> bool:
        """
        Send an HTML email.
        attachments: [{"filename": "report.xlsx", "path": "/app/reports/..."}]
        Returns True on success.
        """
        if not self.enabled:
            log.debug("Email alerts disabled — skipping: %s", subject)
            return False

        recipients = to_override or self.to_addrs
        if not recipients:
            log.warning("No email recipients configured — skipping: %s", subject)
            return False

        try:
            if self.provider == "sendgrid":
                return await self._send_sendgrid(subject, html_body, recipients, attachments)
            else:
                return await asyncio.get_event_loop().run_in_executor(
                    None,
                    self._send_smtp,
                    subject, html_body, recipients, attachments
                )
        except Exception as e:
            log.error("EMAIL SEND ERROR | subject=%s | %s", subject, e)
            return False

    async def _send_sendgrid(
        self,
        subject: str,
        html: str,
        recipients: list[str],
        attachments: list[dict] | None,
    ) -> bool:
        if not settings.sendgrid_api_key:
            log.warning("SENDGRID_API_KEY not set — falling back to SMTP")
            return await asyncio.get_event_loop().run_in_executor(
                None, self._send_smtp, subject, html, recipients, attachments
            )

        to_list = [{"email": r} for r in recipients]
        cc_list = [{"email": c} for c in self.cc_addrs]

        payload: dict = {
            "personalizations": [{"to": to_list, **({"cc": cc_list} if cc_list else {})}],
            "from": {"email": self.from_addr, "name": settings.restaurant_name},
            "subject": subject,
            "content": [{"type": "text/html", "value": html}],
        }

        if attachments:
            sg_attachments = []
            for att in attachments:
                p = Path(att["path"])
                if p.exists():
                    encoded = base64.b64encode(p.read_bytes()).decode()
                    sg_attachments.append({
                        "content":     encoded,
                        "filename":    att.get("filename", p.name),
                        "type":        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                        "disposition": "attachment",
                    })
            if sg_attachments:
                payload["attachments"] = sg_attachments

        async with httpx.AsyncClient(timeout=15) as client:
            resp = await client.post(
                "https://api.sendgrid.com/v3/mail/send",
                json=payload,
                headers={
                    "Authorization": f"Bearer {settings.sendgrid_api_key}",
                    "Content-Type":  "application/json",
                },
            )

        if resp.status_code in (200, 202):
            log.info("EMAIL SENT (SG) | subject=%r | to=%s", subject, recipients)
            return True
        log.warning("SENDGRID FAIL | %d | %s", resp.status_code, resp.text[:300])
        return False

    def _send_smtp(
        self,
        subject: str,
        html: str,
        recipients: list[str],
        attachments: list[dict] | None,
    ) -> bool:
        if not (settings.smtp_host and settings.smtp_user and settings.smtp_password):
            log.warning("SMTP not configured — cannot send: %s", subject)
            return False

        msg = MIMEMultipart("mixed")
        msg["Subject"] = subject
        msg["From"]    = f"{settings.restaurant_name} <{self.from_addr}>"
        msg["To"]      = ", ".join(recipients)
        if self.cc_addrs:
            msg["Cc"]  = ", ".join(self.cc_addrs)

        alt = MIMEMultipart("alternative")
        alt.attach(MIMEText(html, "html", "utf-8"))
        msg.attach(alt)

        if attachments:
            for att in attachments:
                p = Path(att["path"])
                if p.exists():
                    part = MIMEApplication(p.read_bytes(), Name=att.get("filename", p.name))
                    part["Content-Disposition"] = f'attachment; filename="{att.get("filename", p.name)}"'
                    msg.attach(part)

        ctx = ssl.create_default_context()
        all_recipients = recipients + self.cc_addrs
        try:
            with smtplib.SMTP(settings.smtp_host, settings.smtp_port) as s:
                s.starttls(context=ctx)
                s.login(settings.smtp_user, settings.smtp_password)
                s.sendmail(self.from_addr, all_recipients, msg.as_bytes())
            log.info("EMAIL SENT (SMTP) | subject=%r | to=%s", subject, all_recipients)
            return True
        except Exception as e:
            log.error("SMTP ERROR | %s", e)
            return False


# ── Singleton ────────────────────────────────────────────────────────────────
_client: EmailClient | None = None


def get_email_client() -> EmailClient:
    global _client
    if _client is None:
        _client = EmailClient()
    return _client


# ── Alert builders ───────────────────────────────────────────────────────────

async def send_low_stock_alert(item: dict) -> bool:
    """Single-item low stock warning email."""
    client = get_email_client()
    qty    = item.get("qty_on_hand", 0)
    reorder = item.get("reorder_level", 0)
    severity = "⛔ OUT OF STOCK" if qty <= 0 else "⚠️ LOW STOCK"
    color = "#dc2626" if qty <= 0 else "#d97706"

    body = f"""
    <div class="alert-box amber">
      <strong>{severity}: {item.get("name", item.get("sku", "Unknown Item"))}</strong>
    </div>
    <div class="kpi-row">
      <div class="kpi" style="border-left-color:{color}">
        <div class="label">Current Qty</div>
        <div class="value" style="color:{color}">{qty:.1f} {item.get("unit","")}</div>
      </div>
      <div class="kpi" style="border-left-color:#64748b">
        <div class="label">Reorder Level</div>
        <div class="value">{reorder:.1f} {item.get("unit","")}</div>
      </div>
      <div class="kpi" style="border-left-color:#64748b">
        <div class="label">Cost/Unit</div>
        <div class="value">${item.get("cost_per_unit", 0):.2f}</div>
      </div>
    </div>
    <table>
      <tr><th>Field</th><th>Value</th></tr>
      <tr><td>SKU</td><td><code>{item.get("sku","")}</code></td></tr>
      <tr><td>Category</td><td>{item.get("category","")}</td></tr>
      <tr><td>Last Updated</td><td>{item.get("updated_at","")}</td></tr>
    </table>
    <p style="color:#64748b;font-size:14px;">
      Create a purchase order via the API or dashboard to restock this item.
    </p>
    """

    return await client.send(
        subject=f"[{settings.restaurant_name}] {severity} — {item.get('name', item.get('sku'))}",
        html_body=_wrap(body, f"Inventory Alert · {date.today().isoformat()}", accent=color),
    )


async def send_low_stock_digest(items: list[dict]) -> bool:
    """Batched digest of all low-stock items (sent hourly by scheduler)."""
    if not items:
        return False
    client = get_email_client()

    rows = "".join(
        f"""<tr>
          <td><code>{i.get("sku","")}</code></td>
          <td>{i.get("name","")}</td>
          <td>{i.get("category","")}</td>
          <td style="color:{'#dc2626' if i.get('qty_on_hand',0)<=0 else '#d97706'};font-weight:700">
            {i.get("qty_on_hand",0):.1f}
          </td>
          <td>{i.get("reorder_level",0):.1f}</td>
          <td>{'<span class="badge badge-red">OUT</span>' if i.get("qty_on_hand",0)<=0
               else '<span class="badge badge-amber">LOW</span>'}
          </td>
        </tr>"""
        for i in items
    )

    body = f"""
    <div class="alert-box amber">
      <strong>⚠️ {len(items)} item{"s" if len(items)!=1 else ""} need restocking</strong><br>
      <span style="font-size:13px;color:#78350f;">Review and create purchase orders as needed.</span>
    </div>
    <table>
      <thead>
        <tr>
          <th>SKU</th><th>Item</th><th>Category</th>
          <th>Qty On Hand</th><th>Reorder Level</th><th>Status</th>
        </tr>
      </thead>
      <tbody>{rows}</tbody>
    </table>
    <a class="btn" href="http://localhost:8000/inventory/low-stock">View in Dashboard →</a>
    """

    return await client.send(
        subject=f"[{settings.restaurant_name}] Low Stock Digest — {len(items)} items need attention",
        html_body=_wrap(body, f"Inventory Digest · {datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M UTC')}", accent="#d97706"),
    )


async def send_order_confirmed(order: dict) -> bool:
    """Email confirmation for a new order."""
    client  = get_email_client()
    items   = order.get("items", [])
    total   = order.get("total", 0)
    channel = order.get("channel", "unknown").title()
    oid     = order.get("order_id", "?")

    rows = "".join(
        f"<tr><td>{i.get('name','')}</td><td>{i.get('qty',1)}</td>"
        f"<td>${float(i.get('price',0)):.2f}</td>"
        f"<td>${float(i.get('qty',1))*float(i.get('price',0)):.2f}</td></tr>"
        for i in items
    )

    body = f"""
    <div class="alert-box green">
      <strong>✅ Order #{oid} confirmed via {channel}</strong>
    </div>
    <div class="kpi-row">
      <div class="kpi">
        <div class="label">Order Total</div>
        <div class="value">${total:.2f}</div>
      </div>
      <div class="kpi">
        <div class="label">Customer</div>
        <div class="value" style="font-size:16px">{order.get("customer_name","Guest")}</div>
      </div>
      <div class="kpi">
        <div class="label">Type</div>
        <div class="value" style="font-size:16px">{order.get("order_type","pickup").title()}</div>
      </div>
    </div>
    <table>
      <thead><tr><th>Item</th><th>Qty</th><th>Price</th><th>Subtotal</th></tr></thead>
      <tbody>{rows}</tbody>
      <tfoot>
        <tr style="font-weight:700">
          <td colspan="3" style="text-align:right">Total</td>
          <td>${total:.2f}</td>
        </tr>
      </tfoot>
    </table>
    """

    return await client.send(
        subject=f"[{settings.restaurant_name}] Order #{oid} Confirmed — ${total:.2f}",
        html_body=_wrap(body, f"Order Confirmation · {channel}", accent="#10b981"),
    )


async def send_order_failed(order_id: str, reason: str, channel: str) -> bool:
    """Alert owner when an order fails (e.g., out-of-stock rollback)."""
    client = get_email_client()
    body = f"""
    <div class="alert-box">
      <strong>❌ Order #{order_id} FAILED — inventory rolled back</strong>
    </div>
    <table>
      <tr><th>Order ID</th><td>#{order_id}</td></tr>
      <tr><th>Channel</th><td>{channel.title()}</td></tr>
      <tr><th>Failure Reason</th><td style="color:#dc2626">{reason}</td></tr>
      <tr><th>Time</th><td>{datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC")}</td></tr>
    </table>
    <p style="color:#64748b;font-size:14px;">
      All inventory deductions for this order have been automatically reversed.
      The customer was not charged.
    </p>
    """
    return await client.send(
        subject=f"[{settings.restaurant_name}] ❌ Order #{order_id} Failed — Action Required",
        html_body=_wrap(body, "Order Failure Alert", accent="#dc2626"),
    )


async def send_nightly_report(report_path: Path, start: date, end: date) -> bool:
    """Send nightly accounting report with XLSX attachment."""
    client = get_email_client()
    body = f"""
    <div class="alert-box green">
      <strong>📊 Nightly accounting report is ready</strong>
    </div>
    <table>
      <tr><th>Period</th><td>{start.isoformat()} → {end.isoformat()}</td></tr>
      <tr><th>Report File</th><td>{report_path.name}</td></tr>
      <tr><th>Generated At</th><td>{datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC")}</td></tr>
    </table>
    <p style="color:#64748b;font-size:14px;">
      The full accounting workbook is attached. It includes:
      P&L, Cash Flow Statement, Inventory Snapshot, Transaction Log,
      Purchase Orders, and the Summary Dashboard.
    </p>
    """
    return await client.send(
        subject=f"[{settings.restaurant_name}] 📊 Nightly Report — {end.isoformat()}",
        html_body=_wrap(body, f"Accounting Report · {end.isoformat()}", accent="#2563eb"),
        attachments=[{"path": str(report_path), "filename": report_path.name}],
    )


async def send_weekly_pnl(report_path: Path, start: date, end: date, pnl: dict) -> bool:
    """Send weekly P&L summary with workbook attached."""
    client  = get_email_client()
    revenue = pnl.get("total_revenue", 0)
    net     = pnl.get("net_income", 0)
    margin  = pnl.get("gross_margin", 0)
    color   = "#10b981" if net >= 0 else "#dc2626"
    sign    = "+" if net >= 0 else ""

    body = f"""
    <div class="kpi-row">
      <div class="kpi">
        <div class="label">Revenue</div>
        <div class="value">${revenue:,.2f}</div>
      </div>
      <div class="kpi">
        <div class="label">Gross Margin</div>
        <div class="value">{margin*100:.1f}%</div>
      </div>
      <div class="kpi" style="border-left-color:{color}">
        <div class="label">Net Income</div>
        <div class="value" style="color:{color}">{sign}${abs(net):,.2f}</div>
      </div>
    </div>
    <p style="color:#64748b;font-size:14px;">
      Full P&L workbook attached — covers {start.isoformat()} through {end.isoformat()}.
    </p>
    """
    return await client.send(
        subject=f"[{settings.restaurant_name}] 📈 Weekly P&L — {start.isoformat()} to {end.isoformat()}",
        html_body=_wrap(body, f"Weekly Financial Summary", accent=color),
        attachments=[{"path": str(report_path), "filename": report_path.name}],
    )


async def send_platform_sync_failure(platform: str, error: str) -> bool:
    """Alert when a platform sync (DoorDash/UberEats/Website) fails."""
    client = get_email_client()
    body = f"""
    <div class="alert-box">
      <strong>🔗 Sync failure on {platform.title()}</strong>
    </div>
    <table>
      <tr><th>Platform</th><td>{platform.title()}</td></tr>
      <tr><th>Error</th><td style="color:#dc2626;font-family:monospace">{error}</td></tr>
      <tr><th>Time</th><td>{datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC")}</td></tr>
    </table>
    <p style="color:#64748b;font-size:14px;">
      Menu and inventory updates may not be reflected on {platform.title()} until the issue is resolved.
      Check API credentials and network connectivity.
    </p>
    """
    return await client.send(
        subject=f"[{settings.restaurant_name}] ⚠️ {platform.title()} Sync Failed",
        html_body=_wrap(body, "Platform Sync Alert", accent="#d97706"),
    )


async def send_po_received(po: dict) -> bool:
    """Notify when a purchase order is marked received and inventory is restocked."""
    client = get_email_client()
    body = f"""
    <div class="alert-box green">
      <strong>✅ Purchase Order {po.get("po_number","")} received — inventory restocked</strong>
    </div>
    <table>
      <tr><th>PO Number</th><td>{po.get("po_number","")}</td></tr>
      <tr><th>Supplier</th><td>{po.get("supplier","")}</td></tr>
      <tr><th>Total Cost</th><td>${po.get("total_cost",0):.2f}</td></tr>
      <tr><th>Received At</th><td>{po.get("received_at","")}</td></tr>
    </table>
    """
    return await client.send(
        subject=f"[{settings.restaurant_name}] 📦 PO {po.get('po_number','')} Received — Inventory Updated",
        html_body=_wrap(body, "Purchase Order Received", accent="#10b981"),
    )


async def send_voicemail_alert(from_number: str, recording_url: str, duration: int) -> bool:
    """Alert when after-hours voicemail is left."""
    client = get_email_client()
    body = f"""
    <div class="alert-box amber">
      <strong>📞 After-hours voicemail received</strong>
    </div>
    <table>
      <tr><th>From</th><td>{from_number}</td></tr>
      <tr><th>Duration</th><td>{duration} seconds</td></tr>
      <tr><th>Recording</th>
          <td><a href="{recording_url}">Listen to recording →</a></td></tr>
      <tr><th>Time</th><td>{datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC")}</td></tr>
    </table>
    <p style="color:#64748b;font-size:14px;">
      This caller left a voicemail during closed hours. Follow up when you're open.
    </p>
    """
    return await client.send(
        subject=f"[{settings.restaurant_name}] 📞 Voicemail from {from_number}",
        html_body=_wrap(body, "After-Hours Voicemail", accent="#f59e0b"),
    )
