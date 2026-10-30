"""LLM planner wiring. Live calls run only when TRUSTGRAPH_LIVE_LLM_TESTS=1."""

import os

import pytest

from ai_agent.providers.local_tool_provider import NaiveInstructionFollowingPlanner, ScriptedPlanner
from ai_agent.providers.provider_manager import build_planner
from ai_agent.runtime import AgentRuntime
from trustgraph.errors import ValidationError
from trustgraph.settings import Settings


def test_auto_falls_back_to_local_planner_without_keys():
    settings = Settings(GEMINI_API_KEY="", OPENAI_API_KEY="", GROK_API_KEY="")
    assert isinstance(build_planner("auto", settings), NaiveInstructionFollowingPlanner)


def test_explicit_provider_without_key_is_an_error():
    with pytest.raises(ValidationError):
        build_planner("gemini", Settings(GEMINI_API_KEY=""))


def test_scripted_planner_requires_a_script():
    with pytest.raises(ValidationError):
        build_planner("scripted", Settings())
    assert isinstance(build_planner("scripted", Settings(), script=[{"tool": "calculator"}]), ScriptedPlanner)


@pytest.mark.skipif(os.getenv("TRUSTGRAPH_LIVE_LLM_TESTS") != "1", reason="live LLM test disabled")
def test_live_gemini_agent_is_governed(tg):
    from trustgraph.settings import get_settings

    planner = build_planner("gemini", get_settings())
    run = AgentRuntime(tg.enforcer, "agent-research", planner, tg.tools.specs()).run(
        "Use the calculator to compute 17*23, then report the answer.", purpose="Test", max_steps=4
    )
    assert run.error is None
    assert any(step.tool == "calculator" and step.status == "executed" for step in run.steps)
