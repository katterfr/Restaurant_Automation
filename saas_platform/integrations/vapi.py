import httpx
from core.config import settings

VAPI_API = "https://api.vapi.ai"


def _resolve_key(api_key: str | None = None) -> str:
    return api_key or settings.vapi_api_key or ""


def is_configured(api_key: str | None = None) -> bool:
    return bool(_resolve_key(api_key))


def _headers(api_key: str | None = None) -> dict:
    return {
        "Authorization": f"Bearer {_resolve_key(api_key)}",
        "Content-Type": "application/json",
    }


def build_system_prompt(tenant_name: str, menu_items: list, special_instructions: str = "", sms_number: str = "") -> str:
    by_cat: dict = {}
    for item in menu_items:
        if item.get("available", True):
            cat = (item.get("category") or "other").replace("_", " ").title()
            by_cat.setdefault(cat, []).append(item)

    menu_text = ""
    if by_cat:
        menu_text = "\n\nMENU:\n"
        for cat, items in by_cat.items():
            menu_text += f"\n{cat}:\n"
            for it in items[:10]:
                line = f"  • {it['name']} — ${float(it.get('price', 0)):.2f}"
                desc = (it.get("description") or "")[:60]
                if desc:
                    line += f" ({desc})"
                menu_text += line + "\n"

    cat_names = list(by_cat.keys())
    category_list = ", ".join(cat_names[:5]) if cat_names else "various dishes"

    extra = f"\n\nSPECIAL INSTRUCTIONS:\n{special_instructions}" if special_instructions.strip() else ""

    sms_note = (
        "\n\nSMS OPTION: If the customer says they'd prefer to text, say 'Sure! Text this number and I'll take your order there.' "
        "Then use the switch_to_sms tool to notify the customer." if sms_number else ""
    )

    return f"""You are a warm, professional phone order-taking assistant for {tenant_name}.
Your only job is to take orders accurately, confirm them, and end the call politely.
{menu_text}{extra}{sms_note}

CALL FLOW:
1. Greet the caller and ask how you can help (place an order, hear specials, or get info).
2. If ordering — guide them by category. Say: "We have {category_list}. What sounds good?"
3. When a category is chosen, read those items with prices — 4–6 at a time to keep it natural.
4. After each item ask "Would you like anything else?" and naturally suggest a drink or side if appropriate.
5. Once done, read the complete order back with each item and the total price, then confirm.
6. Get the caller's first name for the order.
7. Tell them their order will be ready in approximately 15–20 minutes.
8. Thank them warmly by name and say goodbye.

RULES:
- Never invent menu items or prices — only use what is listed above.
- Keep responses short; this is a phone call.
- If asked about something not on the menu, politely say it is not available and suggest the closest alternative.
- If a caller wants to speak with a person, say "I'll make sure someone gets back to you — let me take your order first."
- Always confirm the full order before ending the call.
"""


async def create_assistant(name: str, system_prompt: str, first_message: str, webhook_url: str, sms_tool_url: str = "", api_key: str | None = None) -> dict:
    tools = []
    if sms_tool_url:
        tools.append({
            "type": "function",
            "function": {
                "name": "switch_to_sms",
                "description": "Send the customer an SMS so they can continue ordering by text instead of voice. Call this when the customer says they prefer to text.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "message": {
                            "type": "string",
                            "description": "The SMS text to send to the customer",
                        }
                    },
                    "required": ["message"],
                },
            },
            "server": {"url": sms_tool_url},
        })

    payload: dict = {
        "name": name,
        "firstMessage": first_message,
        "model": {
            "provider": "openai",
            "model": "gpt-4o-mini",
            "messages": [{"role": "system", "content": system_prompt}],
            "temperature": 0.4,
        },
        "voice": {
            "provider": "openai",
            "voiceId": "nova",
        },
        "serverUrl": webhook_url,
        "analysisPlan": {
            "structuredDataSchema": {
                "type": "object",
                "properties": {
                    "order_items": {
                        "type": "array",
                        "description": "Every item the customer ordered",
                        "items": {
                            "type": "object",
                            "properties": {
                                "name":     {"type": "string"},
                                "quantity": {"type": "integer"},
                                "price":    {"type": "number"},
                            },
                        },
                    },
                    "customer_name":  {"type": "string", "description": "Customer's first name"},
                    "order_type":     {"type": "string", "enum": ["pickup", "delivery"], "description": "pickup or delivery"},
                    "special_notes":  {"type": "string", "description": "Any dietary restrictions or special requests"},
                },
            },
            "structuredDataPrompt": "Extract the complete order from the call. List every item ordered with quantity and price. Include the customer name and whether it is pickup or delivery.",
        },
    }

    if settings.vapi_webhook_secret:
        payload["serverUrlSecret"] = settings.vapi_webhook_secret
    if tools:
        payload["tools"] = tools

    async with httpx.AsyncClient(timeout=30) as client:
        resp = await client.post(
            f"{VAPI_API}/assistant",
            headers=_headers(api_key),
            json=payload,
        )
        resp.raise_for_status()
        return resp.json()


async def update_assistant(assistant_id: str, system_prompt: str, first_message: str, webhook_url: str = "", api_key: str | None = None) -> dict:
    payload: dict = {
        "firstMessage": first_message,
        "model": {
            "provider": "openai",
            "model": "gpt-4o-mini",
            "messages": [{"role": "system", "content": system_prompt}],
            "temperature": 0.4,
        },
    }
    if webhook_url:
        payload["serverUrl"] = webhook_url
    async with httpx.AsyncClient(timeout=30) as client:
        resp = await client.patch(
            f"{VAPI_API}/assistant/{assistant_id}",
            headers=_headers(api_key),
            json=payload,
        )
        resp.raise_for_status()
        return resp.json()


async def relink_phone_number(phone_number_id: str, assistant_id: str, api_key: str | None = None) -> dict:
    async with httpx.AsyncClient(timeout=30) as client:
        resp = await client.patch(
            f"{VAPI_API}/phone-number/{phone_number_id}",
            headers=_headers(api_key),
            json={"assistantId": assistant_id},
        )
        resp.raise_for_status()
        return resp.json()


async def provision_phone_number(assistant_id: str, area_code: str = "", api_key: str | None = None) -> dict:
    payload: dict = {
        "provider": "vapi",
        "assistantId": assistant_id,
        "numberDesiredAreaCode": area_code if area_code else "800",
    }
    async with httpx.AsyncClient(timeout=30) as client:
        resp = await client.post(
            f"{VAPI_API}/phone-number",
            headers=_headers(api_key),
            json=payload,
        )
        if not resp.is_success:
            try:
                body = resp.json()
                detail = body.get("message") or body.get("error") or str(body)
            except Exception:
                detail = resp.text
            raise Exception(f"VAPI {resp.status_code}: {detail}")
        return resp.json()


async def initiate_outbound_call(phone_number: str, assistant_id: str, context_message: str = "", api_key: str | None = None) -> dict:
    """Start an outbound call to a customer — used when they text CALL ME during an SMS session."""
    async with httpx.AsyncClient(timeout=30) as client:
        overrides: dict = {}
        if context_message:
            overrides["firstMessage"] = context_message
        resp = await client.post(
            f"{VAPI_API}/call/phone",
            headers=_headers(api_key),
            json={
                "assistantId": assistant_id,
                "customer": {"number": phone_number},
                **({"assistantOverrides": overrides} if overrides else {}),
            },
        )
        resp.raise_for_status()
        return resp.json()


async def list_calls(assistant_id: str, limit: int = 25, api_key: str | None = None) -> list:
    async with httpx.AsyncClient(timeout=30) as client:
        resp = await client.get(
            f"{VAPI_API}/call",
            headers=_headers(api_key),
            params={"assistantId": assistant_id, "limit": limit, "sortOrder": "desc"},
        )
        resp.raise_for_status()
        return resp.json()
