"""Compatibility shim: configuration now lives in ``trustgraph.settings``."""

from trustgraph.settings import Settings, get_settings

__all__ = ["Settings", "get_settings"]
