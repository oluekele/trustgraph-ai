"""Request-scoped dependencies: service authentication and TrustGraph sessions."""

import hmac
import threading
from contextlib import nullcontext
from dataclasses import dataclass, field
from typing import Any

from fastapi import Depends, Header, HTTPException, Request, status
from sqlalchemy.orm import Session, sessionmaker

from graph.store import GraphProjector
from trustgraph.risk.models import RiskConfig
from trustgraph.service import TrustGraph
from trustgraph.settings import Settings


@dataclass
class AppRuntime:
    settings: Settings
    session_factory: sessionmaker[Session]
    tools: object
    projector: GraphProjector
    risk_config: RiskConfig = field(default_factory=RiskConfig)
    # SQLite has no row locks; serialise writers so the audit hash chain stays linear.
    write_lock: Any = None
    engine: Any = None
    seed_keys: dict[str, str] = field(default_factory=dict)
    sync_pool: Any = None
    sync_pending: threading.Event = field(default_factory=threading.Event)


def runtime(request: Request) -> AppRuntime:
    return request.app.state.runtime


def get_tg(rt: AppRuntime = Depends(runtime)):
    lock = rt.write_lock or nullcontext()
    with lock:
        session = rt.session_factory()
        tg = TrustGraph(
            session,
            risk_config=rt.risk_config,
            tools=rt.tools,
            approval_ttl_minutes=rt.settings.approval_ttl_minutes,
        )
        try:
            yield tg
            session.commit()
        except Exception:
            session.rollback()
            raise
        finally:
            session.close()


def require_service(
    rt: AppRuntime = Depends(runtime),
    x_service_token: str | None = Header(default=None),
) -> None:
    """Callers other than agents (i.e. the NestJS gateway) must present the service token."""
    expected = rt.settings.service_token
    if not expected:
        return
    if not x_service_token or not hmac.compare_digest(expected, x_service_token):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid or missing service token.")


def operator_id(x_operator_id: str | None = Header(default=None)) -> str:
    """Human operator identity forwarded by the gateway (used for audit attribution)."""
    return (x_operator_id or "operator:local").strip()[:128]
