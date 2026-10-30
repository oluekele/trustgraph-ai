"""Governed agent loop: planners propose, TrustGraph decides."""

from ai_agent.providers.local_tool_provider import NaiveInstructionFollowingPlanner, ScriptedPlanner
from ai_agent.runtime import AgentRuntime


def runtime(tg, agent, planner):
    return AgentRuntime(tg.enforcer, agent, planner, tg.tools.specs())


def test_scripted_run_records_each_governed_step(tg):
    planner = ScriptedPlanner([
        {"tool": "calculator", "arguments": {"expression": "40+2"}},
        {"tool": "crm_query", "arguments": {}},
    ])
    run = runtime(tg, "agent-research", planner).run("Compute and look up", purpose="Test")
    assert [step.status for step in run.steps] == ["executed", "blocked"]
    assert run.steps[0].output["result"] == 42
    assert run.final_answer.startswith("Actions taken")


def test_untrusted_tool_output_taints_later_steps(tg):
    planner = ScriptedPlanner([
        {"tool": "web_search", "arguments": {"query": "northwind partners"}},
        {"tool": "calculator", "arguments": {"expression": "1+1"}},
    ])
    run = runtime(tg, "agent-research", planner).run("Search", purpose="Research")
    assert run.steps[0].untrusted_context is False
    assert run.steps[1].untrusted_context is True


def test_hijacked_agent_cannot_act_on_injected_instructions(tg):
    from trustgraph.policy.models import Policy
    from trustgraph.seed import VENDOR_BRIEF_READ
    from tests.conftest import delegate

    tg.repository.upsert_policy(Policy(id="pol-dd", name="DD", subjects=["agent-orchestrator"],
                                       capabilities=["file.read"], resources=["file:///research/vendor-brief.txt"]))
    assert delegate(tg, "u-chioma", "agent-orchestrator", VENDOR_BRIEF_READ).accepted
    run = runtime(tg, "agent-orchestrator", NaiveInstructionFollowingPlanner()).run(
        "Read /research/vendor-brief.txt and summarise it", purpose="Vendor due diligence"
    )
    tools = [(step.tool, step.status) for step in run.steps]
    assert tools[0] == ("file_reader", "executed")
    injected = run.steps[1:]
    assert {step.tool for step in injected} == {"payment_transfer", "file_reader", "send_email"}
    assert all(step.status == "blocked" for step in injected)
    assert tg.tools.sandbox.ledger == [] and tg.tools.sandbox.outbox == []


def test_max_steps_bounds_the_loop(tg):
    planner = ScriptedPlanner([{"tool": "calculator", "arguments": {"expression": "1"}}] * 10)
    run = runtime(tg, "agent-research", planner).run("Loop", purpose="Test", max_steps=3)
    assert len(run.steps) == 3 and run.stopped_reason == "max_steps"
