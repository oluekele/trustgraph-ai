"""Planner selection."""

from typing import Any

from ai_agent.providers.base_provider import Planner
from ai_agent.providers.local_tool_provider import NaiveInstructionFollowingPlanner, ScriptedPlanner
from trustgraph.errors import ValidationError
from trustgraph.settings import Settings


def build_planner(kind: str, settings: Settings, script: list[dict[str, Any]] | None = None) -> Planner:
    """Create a planner. ``auto`` prefers Gemini, then OpenAI, then Grok, then local."""
    if kind == "scripted":
        if not script:
            raise ValidationError("The scripted planner needs a non-empty 'script'.")
        return ScriptedPlanner(script)
    if kind in ("gemini", "auto") and settings.gemini_api_key:
        from ai_agent.providers.gemini_provider import GeminiPlanner

        return GeminiPlanner(settings.gemini_api_key, settings.gemini_model)
    if kind in ("openai", "auto") and settings.openai_api_key:
        from ai_agent.providers.openai_provider import OpenAICompatiblePlanner

        return OpenAICompatiblePlanner(settings.openai_api_key, settings.openai_model)
    if kind in ("grok", "auto") and settings.grok_api_key:
        from ai_agent.providers.grok_provider import GrokPlanner

        return GrokPlanner(settings.grok_api_key, settings.grok_model)
    if kind == "auto":
        return NaiveInstructionFollowingPlanner()
    raise ValidationError(f"Planner '{kind}' is not configured (missing API key).")


# Name kept from the original prototype.
ProviderManager = build_planner
