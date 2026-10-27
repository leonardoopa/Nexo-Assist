"""Deadline arithmetic for the priorities of the service desk rules (Annex A).

Business time runs Monday to Friday, 08:00-18:00 (the service desk hours). Critical tickets
have 24-hour on-call coverage, so their deadline is plain calendar time.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo

from .models import Priority

OPENING_HOUR = 8
CLOSING_HOUR = 18
BUSINESS_DAY = timedelta(hours=CLOSING_HOUR - OPENING_HOUR)


@dataclass(frozen=True)
class SlaRule:
    label: str
    business: timedelta | None = None  # counted only inside business hours
    calendar: timedelta | None = None  # counted around the clock


SLA_RULES: dict[Priority, SlaRule] = {
    Priority.CRITICA: SlaRule("1 hora", calendar=timedelta(hours=1)),
    Priority.ALTA: SlaRule("4 horas úteis", business=timedelta(hours=4)),
    Priority.MEDIA: SlaRule("3 dias úteis", business=3 * BUSINESS_DAY),
    Priority.BAIXA: SlaRule("5 dias úteis", business=5 * BUSINESS_DAY),
}


def _at(moment: datetime, hour: int) -> datetime:
    return moment.replace(hour=hour, minute=0, second=0, microsecond=0)


def next_business_moment(moment: datetime) -> datetime:
    """Earliest instant at or after `moment` that falls inside business hours."""
    while True:
        if moment.weekday() < 5:
            if moment < _at(moment, OPENING_HOUR):
                return _at(moment, OPENING_HOUR)
            if moment < _at(moment, CLOSING_HOUR):
                return moment
        moment = _at(moment + timedelta(days=1), OPENING_HOUR)


def add_business_time(start: datetime, amount: timedelta) -> datetime:
    """Add `amount` of business time to a timezone-aware `start` expressed in local time."""
    current = next_business_moment(start)
    remaining = amount
    while True:
        available = _at(current, CLOSING_HOUR) - current
        if remaining <= available:
            return current + remaining
        remaining -= available
        current = next_business_moment(_at(current, CLOSING_HOUR))


def due_at(priority: Priority, anchor: datetime, tz: ZoneInfo) -> datetime:
    """Deadline for the next response, counted from `anchor` (creation or last service desk update)."""
    rule = SLA_RULES[priority]
    local = anchor.astimezone(tz)
    if rule.calendar is not None:
        return local + rule.calendar
    assert rule.business is not None
    return add_business_time(local, rule.business)
