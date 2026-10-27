from __future__ import annotations

from collections.abc import Callable, Iterator
from contextlib import ExitStack
from pathlib import Path
from typing import Any

import pytest
from fastapi.testclient import TestClient
from helpers import API_KEY, NOW, FakeClock

from servicedesk.config import Settings
from servicedesk.main import create_app


@pytest.fixture
def clock() -> FakeClock:
    return FakeClock(NOW)


@pytest.fixture
def make_client(tmp_path: Path, clock: FakeClock) -> Iterator[Callable[..., TestClient]]:
    stack = ExitStack()

    def make(**overrides: Any) -> TestClient:
        settings = Settings(
            db_path=str(tmp_path / "servicedesk.db"), api_key=API_KEY, admin_enabled=True, **overrides
        )
        return stack.enter_context(TestClient(create_app(settings, clock)))

    yield make
    stack.close()


@pytest.fixture
def client(make_client: Callable[..., TestClient]) -> TestClient:
    return make_client()
