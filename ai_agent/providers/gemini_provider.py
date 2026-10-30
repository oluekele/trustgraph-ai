"""Gemini function-calling planner (google-genai SDK).

Automatic function calling is disabled: Gemini only *proposes* tool calls;
the agent runtime submits each one to TrustGraph for a decision.
"""

import json
import time
from typing import Any

from ai_agent.providers.base_provider import SYSTEM_PROMPT, Planner
from ai_agent.providers.tool_call import Observation, PlannerStep, ToolCall
from ai_agent.tools.schema import ToolSpec

RETRYABLE_STATUS = {429, 500, 503}


class GeminiPlanner(Planner):
    def __init__(self, api_key: str, model: str):
        from google import genai
        from google.genai import types

        self.types = types
        # Bound every request so an overloaded API cannot hang the agent loop.
        self.client = genai.Client(api_key=api_key, http_options=types.HttpOptions(timeout=60_000))
        self.model = model
        self.history: list[Any] = []
        self.consumed = 0

    def name(self) -> str:
        return f"gemini:{self.model}"

    def _tools(self, tools: list[ToolSpec]):
        types = self.types
        return types.Tool(
            function_declarations=[
                types.FunctionDeclaration(
                    name=spec.name,
                    description=spec.description,
                    parameters_json_schema=spec.parameters,
                )
                for spec in tools
            ]
        )

    def _generate(self, config, attempts: int = 4):
        """Call Gemini, retrying transient overload / rate-limit errors with backoff."""
        from google.genai import errors

        for attempt in range(attempts):
            try:
                return self.client.models.generate_content(model=self.model, contents=self.history, config=config)
            except errors.APIError as exc:
                if exc.code not in RETRYABLE_STATUS or attempt == attempts - 1:
                    raise
                time.sleep(2**attempt)

    def next_step(self, task: str, observations: list[Observation], tools: list[ToolSpec]) -> PlannerStep:
        types = self.types
        if not self.history:
            self.history.append(types.Content(role="user", parts=[types.Part(text=task)]))
        new = observations[self.consumed :]
        if new:
            self.history.append(
                types.Content(
                    role="user",
                    parts=[
                        types.Part.from_function_response(
                            name=observation.tool,
                            response=json.loads(json.dumps(observation.for_model(), default=str)),
                        )
                        for observation in new
                    ],
                )
            )
            self.consumed = len(observations)

        config = types.GenerateContentConfig(
            system_instruction=SYSTEM_PROMPT,
            tools=[self._tools(tools)],
            automatic_function_calling=types.AutomaticFunctionCallingConfig(disable=True),
        )
        response = self._generate(config)
        candidate = response.candidates[0] if response.candidates else None
        calls = response.function_calls or []
        if candidate is not None and candidate.content is not None:
            # Keep the model's own content (including thought signatures), but
            # only the first function call: one governed call per step keeps the
            # decision trace linear and every call in history gets a response.
            parts = candidate.content.parts or []
            first_call = next((part for part in parts if part.function_call), None)
            kept = [part for part in parts if not part.function_call]
            if first_call is not None:
                kept.append(first_call)
            self.history.append(types.Content(role=candidate.content.role or "model", parts=kept))
        if calls:
            call = calls[0]
            return PlannerStep(
                kind="tool",
                tool_call=ToolCall(name=call.name, arguments=dict(call.args or {}), call_id=call.id),
            )
        return PlannerStep(kind="final", text=response.text or "")
