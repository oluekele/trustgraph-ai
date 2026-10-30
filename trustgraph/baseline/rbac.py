"""Static RBAC baseline (proposal §12, "conventional/static authorisation").

Models the common way agent tool access is governed today: each agent is
assigned a role whose permissions are (capability, action) pairs — i.e. a
tool allow-list — configured once by an administrator. It deliberately has
no resource scoping, no delegation constraints (delegating = adding
permissions to the delegatee's role), no runtime risk, no human approval,
no expiry and no audit chain. It does authenticate callers and honour
account suspension, as any conventional system would.

The baseline is derived from the *same* seed world, so both systems start
from equivalent administrative intent.
"""

from dataclasses import dataclass, field
from time import perf_counter
from typing import Any

from ai_agent.tools.registry import TicketAuthority, ToolRegistry
from trustgraph.capability.models import Permission
from trustgraph.common import new_id


@dataclass
class BaselineDecision:
    allowed: bool
    reason: str
    latency_ms: float


@dataclass
class BaselineResult:
    status: str  # executed | blocked | failed
    decision: BaselineDecision
    output: Any = None
    error: str | None = None

    @property
    def executed(self) -> bool:
        return self.status in ("executed", "failed")


@dataclass
class StaticRBAC:
    tools: ToolRegistry
    # agent -> {(capability, action): {sources}}
    role_permissions: dict[str, dict[tuple[str, str], set[str]]] = field(default_factory=dict)
    active: dict[str, bool] = field(default_factory=dict)
    capabilities: dict[str, set[str]] = field(default_factory=dict)

    @classmethod
    def from_trustgraph(cls, tg, tools: ToolRegistry | None = None) -> "StaticRBAC":
        """Project the seed world's authority onto coarse (capability, action) roles."""
        baseline = cls(tools=tools or ToolRegistry(TicketAuthority(new_id("baseline"))))
        for principal in tg.repository.list_principals():
            baseline.active[principal.id] = principal.is_active
            baseline.capabilities[principal.id] = set(principal.capabilities)
            authority = tg.reconstructor.reconstruct(principal.id)
            for path in authority.paths:
                source = path.chain[-1] if path.chain else "direct"
                baseline._add(principal.id, path.permission, source)
        return baseline

    def _add(self, principal_id: str, permission: Permission, source: str) -> None:
        key = (permission.capability, permission.action)
        self.role_permissions.setdefault(principal_id, {}).setdefault(key, set()).add(source)

    # ------------------------------------------------------------------

    def check(self, agent_id: str, capability: str, action: str, authenticated: str | None = None) -> BaselineDecision:
        started = perf_counter()
        if authenticated is not None and authenticated != agent_id:
            allowed, reason = False, "Credential does not match the claimed agent."
        elif not self.active.get(agent_id, False):
            allowed, reason = False, "Agent is unknown or inactive."
        elif capability not in self.capabilities.get(agent_id, set()):
            allowed, reason = False, "Role does not include this tool."
        elif (capability, action) not in self.role_permissions.get(agent_id, {}):
            allowed, reason = False, "Role does not permit this action."
        else:
            allowed, reason = True, "Role permits the action."
        return BaselineDecision(allowed, reason, round((perf_counter() - started) * 1000, 4))

    def execute(
        self,
        agent_id: str,
        tool_name: str,
        arguments: dict[str, Any],
        authenticated: str | None = None,
    ) -> BaselineResult:
        spec = self.tools.spec(tool_name)
        if spec is None:
            return BaselineResult("blocked", BaselineDecision(False, "Unknown tool.", 0.0))
        _, action = spec.resolve(arguments)
        decision = self.check(agent_id, spec.capability, action, authenticated)
        if not decision.allowed:
            return BaselineResult("blocked", decision)
        request_id = new_id("base")
        ticket = self.tools.tickets.issue(request_id, tool_name, "baseline")
        try:
            output = self.tools.protected(tool_name).invoke(ticket, request_id, "baseline", arguments, {})
        except Exception as exc:
            return BaselineResult("failed", decision, error=str(exc))
        return BaselineResult("executed", decision, output=output)

    def delegate(self, delegator_id: str, delegatee_id: str, grants: list[Permission]) -> tuple[bool, str, str]:
        """Static RBAC has no delegation semantics: the admin tool copies permissions."""
        delegation_id = new_id("base-dlg")
        for grant in grants:
            self._add(delegatee_id, grant, delegation_id)
        return True, "Permissions assigned to delegatee role.", delegation_id

    def revoke(self, delegatee_id: str, delegation_id: str) -> None:
        """Removes only what that delegation added to the immediate delegatee (no cascade)."""
        permissions = self.role_permissions.get(delegatee_id, {})
        for key in list(permissions):
            permissions[key].discard(delegation_id)
            if not permissions[key]:
                del permissions[key]

    def grant(self, principal_id: str, permission: Permission) -> None:
        self._add(principal_id, permission, new_id("base-grant"))

    def set_active(self, principal_id: str, active: bool) -> None:
        self.active[principal_id] = active
