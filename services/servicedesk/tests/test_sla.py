from __future__ import annotations

from datetime import datetime, timedelta
from zoneinfo import ZoneInfo

import pytest

from servicedesk import sla
from servicedesk.models import Priority

TZ = ZoneInfo("America/Sao_Paulo")


def at(day: int, hour: int, minute: int = 0, month: int = 10) -> datetime:
    return datetime(2026, month, day, hour, minute, tzinfo=TZ)


# 28 Oct 2026 is a Wednesday, 30 Oct a Friday, 31 Oct a Saturday, 2 Nov a Monday.
@pytest.mark.parametrize(
    ("priority", "start", "expected"),
    [
        (Priority.ALTA, at(28, 9, 43), at(28, 13, 43)),  # same business day
        (Priority.ALTA, at(28, 14), at(28, 18)),  # ends exactly at closing time
        (Priority.ALTA, at(28, 16), at(29, 10)),  # spills into the next morning
        (Priority.ALTA, at(30, 17, 30), at(2, 11, 30, month=11)),  # Friday evening to Monday
        (Priority.ALTA, at(31, 10), at(2, 12, month=11)),  # Saturday counts from Monday opening
        (Priority.ALTA, at(28, 6), at(28, 12)),  # before opening counts from 08:00
        (Priority.MEDIA, at(28, 10), at(2, 10, month=11)),  # 3 business days
        (Priority.BAIXA, at(28, 10), at(4, 10, month=11)),  # 5 business days
        (Priority.CRITICA, at(31, 23), at(1, 0, month=11)),  # 24h on-call: plain calendar hour
    ],
)
def test_due_at(priority: Priority, start: datetime, expected: datetime) -> None:
    assert sla.due_at(priority, start, TZ) == expected


def test_anchor_is_converted_to_local_time() -> None:
    utc_start = at(28, 10).astimezone(ZoneInfo("UTC"))
    assert sla.due_at(Priority.ALTA, utc_start, TZ) == at(28, 14)


def test_next_business_moment_skips_the_weekend() -> None:
    assert sla.next_business_moment(at(30, 18)) == at(2, 8, month=11)
    assert sla.next_business_moment(at(28, 12)) == at(28, 12)


def test_business_time_never_lands_outside_opening_hours() -> None:
    start = at(26, 7)  # a Monday before opening
    for minutes in range(0, 60 * 40, 37):
        due = sla.add_business_time(start, timedelta(minutes=minutes))
        assert due.weekday() < 5
        assert 8 <= due.hour < 18 or (due.hour == 18 and due.minute == 0)
