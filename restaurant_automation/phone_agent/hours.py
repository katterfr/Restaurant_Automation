"""
hours.py — Business hours gating.
Returns whether the restaurant is currently open and formats hours for callers.
"""
from datetime import datetime, time as dtime
from zoneinfo import ZoneInfo
from orchestrator.config import settings


def is_open(now: datetime | None = None) -> bool:
    """Return True if the restaurant is currently open."""
    tz = settings.tz
    now = now or datetime.now(tz)
    open_h, open_m = map(int, settings.business_open_time.split(":"))
    close_h, close_m = map(int, settings.business_close_time.split(":"))
    open_t = dtime(open_h, open_m)
    close_t = dtime(close_h, close_m)
    current_t = now.time()
    # Handle midnight-spanning windows
    if open_t <= close_t:
        return open_t <= current_t < close_t
    return current_t >= open_t or current_t < close_t


def hours_message() -> str:
    """Human-readable hours string for voice prompts."""
    return (
        f"Our hours are {settings.business_open_time} to "
        f"{settings.business_close_time}, "
        f"{settings.restaurant_timezone.split('/')[-1]} time."
    )


def after_hours_message() -> str:
    return (
        f"Thank you for calling {settings.restaurant_name}. "
        f"We are currently closed. {hours_message()} "
        "Please leave your name and number and we'll call you back, "
        "or visit our website to place an order online. Goodbye!"
    )
