"""Thin wrapper around presentation_inspect to avoid shadowing Python's stdlib inspect module."""

from __future__ import annotations

from presentation_inspect import inspect_presentation, main

__all__ = ["inspect_presentation", "main"]


if __name__ == "__main__":
    main()
