"""Protected tool registry.

Implementations are wrapped in ``ProtectedTool`` objects that refuse to run
without a single-use execution ticket. Tickets are HMAC-signed by the
runtime enforcer only after a permitting governance decision, so a caller
that skips governance — or replays an old ticket — cannot execute a tool
(threat 20.8, policy bypass).
"""

import hashlib
import hmac
import threading
from typing import Any

from ai_agent.tools.definitions import TOOL_CATALOGUE, Implementation
from ai_agent.tools.sandbox import Sandbox
from ai_agent.tools.schema import ToolSpec


class ToolBypassError(PermissionError):
    """Raised when a protected tool is invoked without a valid ticket."""


class TicketAuthority:
    def __init__(self, secret: str):
        self._secret = secret.encode("utf-8")
        self._used: set[str] = set()
        self._lock = threading.Lock()

    def _sign(self, request_id: str, tool_name: str, fingerprint: str) -> str:
        message = f"{request_id}|{tool_name}|{fingerprint}".encode("utf-8")
        return hmac.new(self._secret, message, hashlib.sha256).hexdigest()

    def issue(self, request_id: str, tool_name: str, fingerprint: str) -> str:
        return self._sign(request_id, tool_name, fingerprint)

    def redeem(self, ticket: str, request_id: str, tool_name: str, fingerprint: str) -> bool:
        expected = self._sign(request_id, tool_name, fingerprint)
        if not hmac.compare_digest(expected, ticket or ""):
            return False
        with self._lock:
            if ticket in self._used:
                return False
            self._used.add(ticket)
        return True


class ProtectedTool:
    def __init__(self, spec: ToolSpec, implementation: Implementation, tickets: TicketAuthority, sandbox: Sandbox):
        self.spec = spec
        self._implementation = implementation
        self._tickets = tickets
        self._sandbox = sandbox

    def invoke(
        self,
        ticket: str,
        request_id: str,
        fingerprint: str,
        arguments: dict[str, Any],
        restrictions: dict[str, Any] | None = None,
    ) -> Any:
        if not self._tickets.redeem(ticket, request_id, self.spec.name, fingerprint):
            raise ToolBypassError(
                f"Tool '{self.spec.name}' requires a valid, unused governance ticket."
            )
        return self._implementation(self._sandbox, arguments, restrictions or {})


class ToolRegistry:
    def __init__(self, tickets: TicketAuthority, sandbox: Sandbox | None = None):
        self.tickets = tickets
        self.sandbox = sandbox or Sandbox()
        self._tools: dict[str, ProtectedTool] = {}
        for spec, implementation in TOOL_CATALOGUE:
            self.register(spec, implementation)

    def register(self, spec: ToolSpec, implementation: Implementation) -> None:
        self._tools[spec.name] = ProtectedTool(spec, implementation, self.tickets, self.sandbox)

    def spec(self, name: str) -> ToolSpec | None:
        tool = self._tools.get(name)
        return tool.spec if tool else None

    def specs(self) -> list[ToolSpec]:
        return [tool.spec for tool in self._tools.values()]

    def protected(self, name: str) -> ProtectedTool:
        return self._tools[name]
