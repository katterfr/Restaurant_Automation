"""
AI conversation engine for SMS ordering sessions.
Uses Anthropic's Claude API via httpx (no extra SDK needed).
"""
import json
import httpx
from core.config import settings


def is_configured() -> bool:
    return bool(settings.anthropic_api_key)


def _build_menu_text(menu_items: list) -> str:
    by_cat: dict = {}
    for item in menu_items:
        if item.get("available", True):
            cat = (item.get("category") or "other").replace("_", " ").title()
            by_cat.setdefault(cat, []).append(item)

    lines = []
    for cat, items in by_cat.items():
        lines.append(f"\n{cat}:")
        for it in items[:10]:
            line = f"  • {it['name']} — ${float(it.get('price', 0)):.2f}"
            if it.get("description"):
                line += f" ({it['description'][:50]})"
            lines.append(line)
    return "\n".join(lines) if lines else "(No menu items yet)"


def _system_prompt(restaurant_name: str, menu_items: list, special_instructions: str) -> str:
    menu_text = _build_menu_text(menu_items)
    cats = list({
        (item.get("category") or "other").replace("_", " ").title()
        for item in menu_items if item.get("available", True)
    })
    cat_list = ", ".join(cats[:5]) if cats else "our menu"

    extra = f"\n\nSPECIAL NOTES:\n{special_instructions}" if special_instructions.strip() else ""

    return f"""You are a friendly, efficient SMS ordering assistant for {restaurant_name}.
Customers are texting to place a food order. Keep every reply SHORT (2–4 sentences max — this is SMS).

MENU:{menu_text}{extra}

ORDERING FLOW:
1. Greet warmly, mention we have {cat_list}. Ask what they'd like.
2. As they order, confirm each item with price.
3. When they seem done, read back the complete order with total and ask for their name.
4. Say: "Reply YES to confirm your order."
5. When they reply YES (or confirm/ok/place it/etc.), output this special block on its own line at the END:
   ##ORDER:item_name|qty|price,item_name|qty|price##
   ##CUSTOMER:{customer_name}##
   Then tell them: "Your order is placed! Ready in about 15–20 mins. 🎉"

6. If they text CALL ME or CALL: tell them "Calling you now!" and output: ##CALLBACK##

RULES:
- Never invent menu items or prices.
- If they ask for something not on the menu, say it's not available and suggest the closest option.
- Don't ask unnecessary questions — get the order quickly.
- Keep tone warm and fast — people hate slow SMS bots.
"""


async def get_response(
    restaurant_name: str,
    menu_items: list,
    messages: list,
    special_instructions: str = "",
) -> str:
    """
    messages: list of {"role": "user"|"assistant", "content": "..."}
    Returns the AI reply text.
    """
    system = _system_prompt(restaurant_name, menu_items, special_instructions)

    headers = {
        "x-api-key": settings.anthropic_api_key,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
    }

    body = {
        "model": "claude-haiku-4-5-20251001",
        "max_tokens": 300,
        "system": system,
        "messages": messages,
    }

    async with httpx.AsyncClient(timeout=30) as client:
        resp = await client.post(
            "https://api.anthropic.com/v1/messages",
            headers=headers,
            json=body,
        )
        resp.raise_for_status()
        data = resp.json()
        return data["content"][0]["text"]


def parse_order_from_reply(reply: str) -> dict | None:
    """
    Extracts structured order data from the AI reply when it contains ##ORDER:...##
    Returns None if no order marker found.
    """
    if "##ORDER:" not in reply:
        return None

    try:
        import re
        order_match = re.search(r'##ORDER:(.*?)##', reply)
        name_match = re.search(r'##CUSTOMER:(.*?)##', reply)

        if not order_match:
            return None

        items = []
        for part in order_match.group(1).split(","):
            parts = part.strip().split("|")
            if len(parts) == 3:
                name, qty, price = parts
                items.append({
                    "name": name.strip(),
                    "qty": int(qty.strip()),
                    "price": float(price.strip()),
                })

        return {
            "items": items,
            "customer_name": name_match.group(1).strip() if name_match else "SMS Customer",
            "total": sum(i["qty"] * i["price"] for i in items),
        }
    except Exception:
        return None


def is_callback_request(reply: str) -> bool:
    return "##CALLBACK##" in reply


def clean_reply(reply: str) -> str:
    """Strip the internal markers before sending as SMS."""
    import re
    reply = re.sub(r'##ORDER:.*?##', '', reply)
    reply = re.sub(r'##CUSTOMER:.*?##', '', reply)
    reply = reply.replace("##CALLBACK##", "")
    return reply.strip()
