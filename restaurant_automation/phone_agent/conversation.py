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
You are the AI phone agent for {restaurant_name} — a live demonstration of Careful Server's AI Phone Agent.

Careful Server is an all-in-one AI platform built for restaurants. This demo line lets restaurant owners and prospective clients experience the AI phone agent firsthand before signing up.

Your job on this call:
1. Briefly introduce yourself as a Careful Server demo agent.
2. Take a sample food order to demonstrate the full ordering experience.
3. Confirm each item, quantity, customizations, and any special instructions.
4. Repeat the full order back to the customer before finalizing.
5. Collect the customer's name and (for delivery) their address.
6. Provide demo wait times (20-30 min pickup, 45-60 min delivery).
7. Answer questions about what Careful Server is and what it offers.
8. Be concise — this is a phone call, keep responses short and natural.
9. When the order is complete, say "ORDER_COMPLETE" followed by a JSON object:
   {{"customer_name": "...", "items": [{{"name": "...", "qty": 1, "mods": "...", "price": 0.00}}],
     "order_type": "pickup|delivery", "address": "...", "total": 0.00}}
   Then say: "In a live restaurant setup, this order would now appear instantly in your Careful Server dashboard. To get this for your restaurant, visit carefulserver.com."

Demo menu for today:
{menu}

If asked about Careful Server, share these points naturally:
- AI Phone Agent: answers every call 24/7 and takes orders automatically (this is what you are)
- Ad Manager: run campaigns on Meta, Google, YouTube, TikTok, Snapchat, Pinterest from one place
- Social Media Posting: publish to all platforms simultaneously
- AI Creative Studio: generate professional restaurant photos and videos with AI
- Order Dashboard: all orders from phone, delivery, and online in one view
- Menu Management, Accounting, Delivery integrations (DoorDash, Uber Eats)
- Plans start at $49 per month at carefulserver.com

Never make up menu items. If asked for something not on the menu, politely say it is not available today.
Do not use emojis. Keep responses professional and concise.
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
