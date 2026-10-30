"""OpenAI-compatible chat-completions planner (OpenAI, or xAI Grok via base_url)."""

import json
from typing import Any

from ai_agent.providers.base_provider import SYSTEM_PROMPT, Planner
from ai_agent.providers.tool_call import Observation, PlannerStep, ToolCall
from ai_agent.tools.schema import ToolSpec


class OpenAICompatiblePlanner(Planner):
    def __init__(self, api_key: str, model: str, base_url: str | None = None, label: str = "openai"):
        from openai import OpenAI

        self.client = OpenAI(api_key=api_key, base_url=base_url)
        self.model = model
        self.label = label
        self.messages: list[dict[str, Any]] = []
        self.consumed = 0

    def name(self) -> str:
        return f"{self.label}:{self.model}"

    def next_step(self, task: str, observations: list[Observation], tools: list[ToolSpec]) -> PlannerStep:
        if not self.messages:
            self.messages = [
                {"role": "system", "content": SYSTEM_PROMPT},
                {"role": "user", "content": task},
            ]
        for observation in observations[self.consumed :]:
            self.messages.append(
                {
                    "role": "tool",
                    "tool_call_id": observation.call_id or observation.tool,
                    "content": json.dumps(observation.for_model(), default=str),
                }
            )
        self.consumed = len(observations)

        response = self.client.chat.completions.create(
            model=self.model,
            messages=self.messages,
            tools=[spec.to_function_schema() for spec in tools],
            parallel_tool_calls=False,
        )
        message = response.choices[0].message
        if message.tool_calls:
            call = message.tool_calls[0]
            self.messages.append(
                {
                    "role": "assistant",
                    "content": message.content,
                    "tool_calls": [
                        {
                            "id": call.id,
                            "type": "function",
                            "function": {"name": call.function.name, "arguments": call.function.arguments},
                        }
                    ],
                }
            )
            return PlannerStep(
                kind="tool",
                tool_call=ToolCall(
                    name=call.function.name,
                    arguments=json.loads(call.function.arguments or "{}"),
                    call_id=call.id,
                ),
                thought=message.content,
            )
        self.messages.append({"role": "assistant", "content": message.content or ""})
        return PlannerStep(kind="final", text=message.content or "")


# Name kept from the original prototype.
OpenAIProvider = OpenAICompatiblePlanner
