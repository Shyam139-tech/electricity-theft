"""Stable ASGI entrypoint for the inspection-prioritization backend."""

from .main import app

# Supports both `uvicorn backend.app:app` and `uvicorn backend.app:main`.
main = app

__all__ = ["app", "main"]
