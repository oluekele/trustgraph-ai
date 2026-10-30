"""Composition root: wires TrustGraph services around one database session."""

from typing import TYPE_CHECKING, Any

from sqlalchemy.orm import Session

from trustgraph.approval.service import ApprovalService
from trustgraph.audit.logger import AuditLogger
from trustgraph.authorization.engine import AuthorizationEngine
from trustgraph.authorization.models import AuthorizationRequest, Decision
from trustgraph.authorization.runtime import RuntimeEnforcer
from trustgraph.capability.catalog import CatalogService, canonical_resource
from trustgraph.capability.models import Permission
from trustgraph.common import utc_now
from trustgraph.delegation.chain import DelegationChainEngine
from trustgraph.delegation.direct_authority import DirectAuthorityService
from trustgraph.delegation.models import DelegationStatus
from trustgraph.delegation.reconstructor import EffectiveAuthorityReconstructor
from trustgraph.identity.models import PrincipalKind
from trustgraph.identity.store import IdentityService
from trustgraph.persistence.repository import Repository
from trustgraph.risk.engine import RiskEngine
from trustgraph.risk.models import RiskConfig

if TYPE_CHECKING:
    from ai_agent.tools.registry import ToolRegistry


class TrustGraph:
    def __init__(
        self,
        session: Session,
        risk_config: RiskConfig | None = None,
        tools: "ToolRegistry | None" = None,
        approval_ttl_minutes: int = 30,
    ):
        self.repository = Repository(session)
        self.audit = AuditLogger(self.repository)
        self.identity = IdentityService(self.repository, self.audit)
        self.catalog = CatalogService(self.repository)
        self.reconstructor = EffectiveAuthorityReconstructor(self.repository)
        self.direct_authority = DirectAuthorityService(self.repository, self.catalog, self.audit)
        self.delegations = DelegationChainEngine(
            self.repository, self.catalog, self.reconstructor, self.audit
        )
        self.approvals = ApprovalService(self.repository, self.audit, approval_ttl_minutes)
        self.risk = RiskEngine(risk_config)
        self.authorization = AuthorizationEngine(
            self.repository, self.reconstructor, self.risk, self.approvals, self.audit
        )
        self.tools = tools
        self.enforcer = RuntimeEnforcer(self.authorization, tools, self.audit) if tools else None

    def commit(self) -> None:
        self.repository.commit()

    # ------------------------------------------------------------------
    # Operations spanning several services
    # ------------------------------------------------------------------

    def authorize(self, request: AuthorizationRequest):
        return self.authorization.evaluate(request)

    def revoke_grant(self, grant_id: str, revoked_by: str):
        grant = self.direct_authority.revoke(grant_id, revoked_by)
        cascaded = self.delegations.cascade(revoked_by, f"Cascade from revocation of grant {grant_id}.")
        return grant, cascaded

    def provenance(self, agent_id: str, permission: Permission) -> dict[str, Any]:
        """Explain how (if at all) an agent holds a permission."""
        permission = Permission(
            capability=permission.capability,
            resource=canonical_resource(permission.resource),
            action=permission.action,
        )
        authority = self.reconstructor.reconstruct(agent_id)
        paths = authority.paths_for(permission)
        explained = []
        for path in paths:
            grant = self.repository.get_grant(path.root_grant_id)
            explained.append(
                {
                    "path": path.model_dump(mode="json"),
                    "root_grant": grant.model_dump(mode="json") if grant else None,
                    "delegations": [
                        self.repository.get_delegation(delegation_id).model_dump(mode="json")
                        for delegation_id in path.chain
                    ],
                }
            )
        return {
            "agent_id": agent_id,
            "permission": permission.model_dump(),
            "held": bool(paths),
            "paths": explained,
        }

    def overview(self) -> dict[str, Any]:
        now = utc_now()
        principals = self.repository.list_principals()
        agents = [principal for principal in principals if principal.kind == PrincipalKind.AGENT]
        delegations = self.repository.list_delegations()
        decisions = self.repository.decision_counts()
        pending = [
            approval
            for approval in self.repository.list_approvals()
            if approval.effective_status(now).value == "pending"
        ]
        recent = self.repository.list_audit_events(event_type="authorization", limit=10)
        return {
            "status": "operational",
            "storage": self.repository.session.get_bind().dialect.name,
            "agents": {"total": len(agents), "active": sum(agent.is_active for agent in agents)},
            "users": len(principals) - len(agents),
            "resources": len(self.repository.list_resources()),
            "capabilities": len(self.repository.list_capabilities()),
            "policies": len(self.repository.list_policies()),
            "grants": len(self.repository.list_grants(include_revoked=False)),
            "delegations": {
                "total": len(delegations),
                "active": sum(
                    delegation.effective_status(now) == DelegationStatus.ACTIVE
                    for delegation in delegations
                ),
            },
            "approvals_pending": len(pending),
            "decisions": {decision.value: decisions.get(decision.value, 0) for decision in Decision},
            "audit_events": self.repository.count_audit_events(),
            "recent_decisions": [event.model_dump(mode="json") for event in recent],
        }

    def graph_snapshot(self, include_activity: int = 50) -> dict[str, Any]:
        """Nodes and edges of the authority graph, built from the authoritative store."""
        now = utc_now()
        nodes: list[dict[str, Any]] = []
        edges: list[dict[str, Any]] = []

        for principal in self.repository.list_principals():
            nodes.append(
                {
                    "id": principal.id,
                    "type": "User" if principal.kind == PrincipalKind.USER else "Agent",
                    "label": principal.name,
                    "status": principal.status.value,
                }
            )
            if principal.owner_id:
                edges.append({"source": principal.owner_id, "target": principal.id, "type": "OWNS"})
            for capability in principal.capabilities:
                edges.append(
                    {"source": principal.id, "target": f"cap:{capability}", "type": "HAS_CAPABILITY"}
                )
        for capability in self.repository.list_capabilities():
            nodes.append({"id": f"cap:{capability.name}", "type": "Capability", "label": capability.name})
        for resource in self.repository.list_resources():
            nodes.append(
                {
                    "id": f"res:{resource.id}",
                    "type": "Resource",
                    "label": resource.name,
                    "classification": resource.classification.value,
                }
            )
        for grant in self.repository.list_grants(include_revoked=False):
            if not grant.is_valid(now):
                continue
            grant_node = f"grant:{grant.id}"
            nodes.append(
                {
                    "id": grant_node,
                    "type": "AuthorityGrant",
                    "label": f"{grant.capability} · {grant.action}",
                    "resource": grant.resource,
                }
            )
            edges.append({"source": grant.principal_id, "target": grant_node, "type": "HOLDS"})
            edges.append({"source": grant_node, "target": f"res:{grant.resource}", "type": "TARGETS"})
        for delegation in self.repository.list_delegations():
            status = delegation.effective_status(now).value
            node = f"dlg:{delegation.id}"
            nodes.append(
                {
                    "id": node,
                    "type": "Delegation",
                    "label": delegation.purpose or delegation.id,
                    "status": status,
                    "depth": delegation.depth,
                }
            )
            edges.append({"source": delegation.delegator_id, "target": node, "type": "FROM", "status": status})
            edges.append({"source": node, "target": delegation.delegatee_id, "type": "DELEGATED_TO", "status": status})
            for grant in delegation.grants:
                edges.append(
                    {
                        "source": node,
                        "target": f"res:{grant.resource}",
                        "type": "GRANTS",
                        "label": f"{grant.capability} · {grant.action}",
                        "status": status,
                    }
                )
        if include_activity:
            for event in self.repository.list_audit_events(event_type="execution", limit=include_activity):
                if not event.resource:
                    continue
                edges.append(
                    {
                        "source": event.actor_id,
                        "target": f"res:{event.resource}",
                        "type": "EXECUTED" if event.execution_status in ("executed", "restricted") else "BLOCKED",
                        "event_id": event.id,
                    }
                )
        node_ids = {node["id"] for node in nodes}
        edges = [edge for edge in edges if edge["source"] in node_ids and edge["target"] in node_ids]
        return {"nodes": nodes, "edges": edges}
