from __future__ import annotations


class ServiceError(Exception):
    """A business or access error that maps to a stable `{"error": {"code", "message"}}` response."""

    def __init__(self, status: int, code: str, message: str) -> None:
        super().__init__(message)
        self.status = status
        self.code = code
        self.message = message
