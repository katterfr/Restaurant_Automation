"""
conversation.py — GPT-4o conversation manager for the phone agent.
Maintains per-call conversation history and system prompts.
"""
from __future__ import annotations
import json
import logging
from typing import Any
from openai import AsyncOpenAI
from orchestrator.config import settings

log = logging.getLogger(__name__)

SYSTEM_PROMPT = """
You are {restaurant_name}'s friendly AI phone assistant. Your job is to:
1. Greet callers warmly and take their food orders accurately.
2. Confirm each item, quantity, customizations, and special instructions.
3. Always repeat the full order back to the customer before confirming.
4. Collect the customer's name and (for delivery) their address.
5. Provide estimated wait times (default: 20-30 min pickup, 45-60 min delivery).
6. Answer questions about the menu, hours, and location.
7. Be concise — this is a phone call, keep responses short and natural.
8. When the order is complete, say "ORDER_COMPLETE" followed by a JSON object:
   {{"customer_name": "...", "items": [{{"name": "...", "qty": 1, "mods": "...", "price": 0.00}}], 
     "order_type": "pickup|delivery", "address": "...", "total": 0.00}}

Current menu (update via menu.json):
{menu}

If you don't know a price, say "I'll check that for you" and use 0.00 as placeholder.
Never make up menu items. If asked for something not on the menu, politely say it's unavailable.
"""


class ConversationManager:
    def __init__(self, call_sid: str, menu: list[dict]):
        self.call_sid = call_sid
        self.client = AsyncOpenAI(api_key=settings.openai_api_key)
        self.history: list[dict] = []
        self.system_prompt = SYSTEM_PROMPT.format(
            restaurant_name=settings.restaurant_name,
            menu=json.dumps(menu, indent=2)
        )

    async def respond(self, user_input: str) -> tuple[str, bool]:
        """
        Send user_input to GPT-4o, get assistant reply.
        Returns (reply_text, order_complete).
        """
        self.history.append({"role": "user", "content": user_input})

        response = await self.client.chat.completions.create(
            model="gpt-4o",
            messages=[
                {"role": "system", "content": self.system_prompt},
                *self.history,
            ],
            temperature=0.4,
            max_tokens=400,
        )

        reply = response.choices[0].message.content.strip()
        self.history.append({"role": "assistant", "content": reply})

        order_complete = "ORDER_COMPLETE" in reply
        log.info("CALL %s | user=%r | assistant=%r | complete=%s",
                 self.call_sid, user_input, reply, order_complete)

        return reply, order_complete

    def get_transcript(self) -> list[dict]:
        return self.history.copy()
