"""Data access for TrustGraph.

The repository is the only component that talks to the relational store.
Rows convert to and from domain models generically because column names
mirror field names.
"""

from datetime import datetime
from typing import Any, TypeVar

from pydantic import BaseModel
from sqlalchemy import JSON, func, select
from sqlalchemy.orm import Session

from trustgraph.approval.models import ApprovalRequest, ApprovalStatus
from trustgraph.audit.models import AuditEvent
from trustgraph.capability.models import Capability, Resource
from trustgraph.delegation.models import Delegation, DelegationStatus
from trustgraph.delegation.provenance import AuthorityGrant
from trustgraph.identity.models import Principal, PrincipalKind, PrincipalStatus
from trustgraph.persistence.tables import (
    ApprovalRow,
    AuditChainHeadRow,
    AuditEventRow,
    AuthorityGrantRow,
    Base,
    CapabilityRow,
    DelegationRow,
    PolicyRow,
    PrincipalRow,
    ResourceRow,
)
from trustgraph.policy.models import Policy

M = TypeVar("M", bound=BaseModel)


def _to_row(row_cls: type[Base], model: BaseModel, **extra: Any) -> Base:
    columns = row_cls.__table__.columns
    python = model.model_dump(mode="python")
    json_mode = model.model_dump(mode="json")
    values = {}
    for column in columns:
        if column.key in extra:
            values[column.key] = extra[column.key]
        elif column.key in python:
            values[column.key] = (
                json_mode[column.key] if isinstance(column.type, JSON) else python[column.key]
            )
    return row_cls(**values)


def _to_model(model_cls: type[M], row: Base) -> M:
    fields = model_cls.model_fields
    data = {
        column.key: getattr(row, column.key)
        for column in row.__table__.columns
        if column.key in fields
    }
    return model_cls.model_validate(data)


def _apply(row: Base, model: BaseModel) -> None:
    python = model.model_dump(mode="python")
    json_mode = model.model_dump(mode="json")
    for column in row.__table__.columns:
        if column.key in python and not column.primary_key:
            value = json_mode[column.key] if isinstance(column.type, JSON) else python[column.key]
            setattr(row, column.key, value)


class Repository:
    def __init__(self, session: Session):
        self.session = session

    # ------------------------------------------------------------------
    # Unit of work
    # ------------------------------------------------------------------

    def commit(self) -> None:
        self.session.commit()

    def rollback(self) -> None:
        self.session.rollback()

    # ------------------------------------------------------------------
    # Principals
    # ------------------------------------------------------------------

    def add_principal(self, principal: Principal, api_key_hash: str | None = None) -> Principal:
        self.session.add(_to_row(PrincipalRow, principal, api_key_hash=api_key_hash))
        self.session.flush()
        return principal

    def get_principal(self, principal_id: str) -> Principal | None:
        row = self.session.get(PrincipalRow, principal_id)
        return _to_model(Principal, row) if row else None

    def list_principals(self, kind: PrincipalKind | None = None) -> list[Principal]:
        query = select(PrincipalRow).order_by(PrincipalRow.kind, PrincipalRow.id)
        if kind is not None:
            query = query.where(PrincipalRow.kind == kind.value)
        return [_to_model(Principal, row) for row in self.session.scalars(query)]

    def update_principal(self, principal: Principal) -> None:
        row = self.session.get(PrincipalRow, principal.id)
        if row is None:
            raise KeyError(principal.id)
        _apply(row, principal)
        self.session.flush()

    def set_principal_status(self, principal_id: str, status: PrincipalStatus) -> None:
        row = self.session.get(PrincipalRow, principal_id)
        if row is None:
            raise KeyError(principal_id)
        row.status = status.value
        self.session.flush()

    def set_api_key_hash(self, principal_id: str, api_key_hash: str) -> None:
        row = self.session.get(PrincipalRow, principal_id)
        if row is None:
            raise KeyError(principal_id)
        row.api_key_hash = api_key_hash
        self.session.flush()

    def principal_id_for_key_hash(self, api_key_hash: str) -> str | None:
        return self.session.scalar(
            select(PrincipalRow.id).where(PrincipalRow.api_key_hash == api_key_hash)
        )

    # ------------------------------------------------------------------
    # Capability and resource catalogue
    # ------------------------------------------------------------------

    def upsert_capability(self, capability: Capability) -> Capability:
        row = self.session.get(CapabilityRow, capability.name)
        if row is None:
            self.session.add(_to_row(CapabilityRow, capability))
        else:
            _apply(row, capability)
        self.session.flush()
        return capability

    def get_capability(self, name: str) -> Capability | None:
        row = self.session.get(CapabilityRow, name)
        return _to_model(Capability, row) if row else None

    def list_capabilities(self) -> list[Capability]:
        rows = self.session.scalars(select(CapabilityRow).order_by(CapabilityRow.name))
        return [_to_model(Capability, row) for row in rows]

    def upsert_resource(self, resource: Resource) -> Resource:
        row = self.session.get(ResourceRow, resource.id)
        if row is None:
            self.session.add(_to_row(ResourceRow, resource))
        else:
            _apply(row, resource)
        self.session.flush()
        return resource

    def get_resource(self, resource_id: str) -> Resource | None:
        row = self.session.get(ResourceRow, resource_id)
        return _to_model(Resource, row) if row else None

    def list_resources(self) -> list[Resource]:
        rows = self.session.scalars(select(ResourceRow).order_by(ResourceRow.id))
        return [_to_model(Resource, row) for row in rows]

    # ------------------------------------------------------------------
    # Direct authority grants
    # ------------------------------------------------------------------

    def add_grant(self, grant: AuthorityGrant) -> AuthorityGrant:
        self.session.add(_to_row(AuthorityGrantRow, grant))
        self.session.flush()
        return grant

    def get_grant(self, grant_id: str) -> AuthorityGrant | None:
        row = self.session.get(AuthorityGrantRow, grant_id)
        return _to_model(AuthorityGrant, row) if row else None

    def list_grants(
        self, principal_id: str | None = None, include_revoked: bool = True
    ) -> list[AuthorityGrant]:
        query = select(AuthorityGrantRow).order_by(AuthorityGrantRow.created_at)
        if principal_id is not None:
            query = query.where(AuthorityGrantRow.principal_id == principal_id)
        if not include_revoked:
            query = query.where(AuthorityGrantRow.revoked_at.is_(None))
        return [_to_model(AuthorityGrant, row) for row in self.session.scalars(query)]

    def revoke_grant(self, grant_id: str, revoked_at: datetime) -> None:
        row = self.session.get(AuthorityGrantRow, grant_id)
        if row is None:
            raise KeyError(grant_id)
        row.revoked_at = revoked_at
        self.session.flush()

    # ------------------------------------------------------------------
    # Delegations
    # ------------------------------------------------------------------

    def add_delegation(self, delegation: Delegation) -> Delegation:
        self.session.add(_to_row(DelegationRow, delegation))
        self.session.flush()
        return delegation

    def get_delegation(self, delegation_id: str) -> Delegation | None:
        row = self.session.get(DelegationRow, delegation_id)
        return _to_model(Delegation, row) if row else None

    def update_delegation(self, delegation: Delegation) -> None:
        row = self.session.get(DelegationRow, delegation.id)
        if row is None:
            raise KeyError(delegation.id)
        _apply(row, delegation)
        self.session.flush()

    def list_delegations(
        self,
        principal_id: str | None = None,
        status: DelegationStatus | None = None,
    ) -> list[Delegation]:
        query = select(DelegationRow).order_by(DelegationRow.created_at)
        if principal_id is not None:
            query = query.where(
                (DelegationRow.delegator_id == principal_id)
                | (DelegationRow.delegatee_id == principal_id)
            )
        if status is not None:
            query = query.where(DelegationRow.status == status.value)
        return [_to_model(Delegation, row) for row in self.session.scalars(query)]

    def delegations_to(self, principal_id: str) -> list[Delegation]:
        query = select(DelegationRow).where(
            DelegationRow.delegatee_id == principal_id,
            DelegationRow.status == DelegationStatus.ACTIVE.value,
        )
        return [_to_model(Delegation, row) for row in self.session.scalars(query)]

    # ------------------------------------------------------------------
    # Policies
    # ------------------------------------------------------------------

    def upsert_policy(self, policy: Policy) -> Policy:
        row = self.session.get(PolicyRow, policy.id)
        if row is None:
            self.session.add(_to_row(PolicyRow, policy))
        else:
            _apply(row, policy)
        self.session.flush()
        return policy

    def get_policy(self, policy_id: str) -> Policy | None:
        row = self.session.get(PolicyRow, policy_id)
        return _to_model(Policy, row) if row else None

    def list_policies(self, enabled_only: bool = False) -> list[Policy]:
        query = select(PolicyRow).order_by(PolicyRow.priority, PolicyRow.id)
        if enabled_only:
            query = query.where(PolicyRow.enabled.is_(True))
        return [_to_model(Policy, row) for row in self.session.scalars(query)]

    def delete_policy(self, policy_id: str) -> None:
        row = self.session.get(PolicyRow, policy_id)
        if row is None:
            raise KeyError(policy_id)
        self.session.delete(row)
        self.session.flush()

    # ------------------------------------------------------------------
    # Approvals
    # ------------------------------------------------------------------

    def add_approval(self, approval: ApprovalRequest) -> ApprovalRequest:
        self.session.add(_to_row(ApprovalRow, approval))
        self.session.flush()
        return approval

    def get_approval(self, approval_id: str) -> ApprovalRequest | None:
        row = self.session.get(ApprovalRow, approval_id)
        return _to_model(ApprovalRequest, row) if row else None

    def update_approval(self, approval: ApprovalRequest) -> None:
        row = self.session.get(ApprovalRow, approval.id)
        if row is None:
            raise KeyError(approval.id)
        _apply(row, approval)
        self.session.flush()

    def list_approvals(self, status: ApprovalStatus | None = None) -> list[ApprovalRequest]:
        query = select(ApprovalRow).order_by(ApprovalRow.requested_at.desc())
        if status is not None:
            query = query.where(ApprovalRow.status == status.value)
        return [_to_model(ApprovalRequest, row) for row in self.session.scalars(query)]

    def pending_approval_for(self, fingerprint: str) -> ApprovalRequest | None:
        row = self.session.scalar(
            select(ApprovalRow)
            .where(
                ApprovalRow.fingerprint == fingerprint,
                ApprovalRow.status == ApprovalStatus.PENDING.value,
            )
            .order_by(ApprovalRow.requested_at.desc())
        )
        return _to_model(ApprovalRequest, row) if row else None

    # ------------------------------------------------------------------
    # Audit
    # ------------------------------------------------------------------

    def lock_chain_head(self) -> AuditChainHeadRow:
        head = self.session.scalar(
            select(AuditChainHeadRow).where(AuditChainHeadRow.id == 1).with_for_update()
        )
        if head is None:
            head = AuditChainHeadRow(id=1, sequence=0, hash="")
            self.session.add(head)
            self.session.flush()
        return head

    def add_audit_event(self, event: AuditEvent) -> None:
        self.session.add(_to_row(AuditEventRow, event))
        self.session.flush()

    def list_audit_events(
        self,
        actor_id: str | None = None,
        event_type: str | None = None,
        decision: str | None = None,
        request_id: str | None = None,
        limit: int = 100,
        offset: int = 0,
        ascending: bool = False,
    ) -> list[AuditEvent]:
        query = select(AuditEventRow)
        if actor_id:
            query = query.where(AuditEventRow.actor_id == actor_id)
        if event_type:
            query = query.where(AuditEventRow.event_type == event_type)
        if decision:
            query = query.where(AuditEventRow.decision == decision)
        if request_id:
            query = query.where(AuditEventRow.request_id == request_id)
        order = AuditEventRow.sequence.asc() if ascending else AuditEventRow.sequence.desc()
        query = query.order_by(order).limit(limit).offset(offset)
        return [_to_model(AuditEvent, row) for row in self.session.scalars(query)]

    def iter_audit_chain(self, batch_size: int = 500):
        offset = 0
        while True:
            rows = list(
                self.session.scalars(
                    select(AuditEventRow)
                    .order_by(AuditEventRow.sequence.asc())
                    .limit(batch_size)
                    .offset(offset)
                )
            )
            if not rows:
                return
            for row in rows:
                yield _to_model(AuditEvent, row)
            offset += batch_size

    def count_audit_events(self) -> int:
        return self.session.scalar(select(func.count()).select_from(AuditEventRow)) or 0

    def decision_counts(self) -> dict[str, int]:
        rows = self.session.execute(
            select(AuditEventRow.decision, func.count())
            .where(AuditEventRow.event_type == "authorization")
            .group_by(AuditEventRow.decision)
        )
        return {decision: count for decision, count in rows if decision}

    def recent_activity(self, agent_id: str, since: datetime) -> tuple[int, int]:
        """Return (authorization requests, denials) for an agent since ``since``."""
        base = select(func.count()).where(
            AuditEventRow.actor_id == agent_id,
            AuditEventRow.event_type == "authorization",
            AuditEventRow.timestamp >= since,
        )
        total = self.session.scalar(base) or 0
        denials = self.session.scalar(base.where(AuditEventRow.decision == "deny")) or 0
        return total, denials
