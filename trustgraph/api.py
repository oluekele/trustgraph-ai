"""TrustGraph governance API (the authoritative policy decision/enforcement service).

Run locally:  uvicorn trustgraph.api:app --reload --port 8000
"""

import logging
import threading
from concurrent.futures import ThreadPoolExecutor
from contextlib import asynccontextmanager

from fastapi import Depends, FastAPI, Request
from fastapi.responses import JSONResponse

from ai_agent.tools.registry import TicketAuthority, ToolRegistry
from graph.store import build_projector
from trustgraph.errors import ConflictError, NotFoundError, ValidationError
from trustgraph.persistence.database import (
    create_database_engine,
    create_schema,
    drop_schema,
    make_session_factory,
)
from trustgraph.routes import delegations, observability, registry, runtime
from trustgraph.routes.deps import AppRuntime, require_service
from trustgraph.seed import is_seeded, seed_world
from trustgraph.service import TrustGraph
from trustgraph.settings import Settings, get_settings

logger = logging.getLogger("trustgraph")

MUTATING_METHODS = {"POST", "PUT", "PATCH", "DELETE"}


def build_runtime(settings: Settings) -> AppRuntime:
    engine = create_database_engine(settings.database_url)
    create_schema(engine)
    rt = AppRuntime(
        settings=settings,
        session_factory=make_session_factory(engine),
        tools=ToolRegistry(TicketAuthority(settings.ticket_secret)),
        projector=build_projector(settings.neo4j_enabled),
        write_lock=threading.Lock() if engine.dialect.name == "sqlite" else None,
        engine=engine,
        sync_pool=ThreadPoolExecutor(max_workers=1, thread_name_prefix="neo4j-sync"),
    )
    if settings.seed_on_startup:
        with rt.session_factory() as session:
            tg = TrustGraph(session, tools=rt.tools)
            if not is_seeded(tg):
                rt.seed_keys = seed_world(tg)["api_keys"]
                logger.info("Seeded demonstration environment with %d agents.", len(rt.seed_keys))
    schedule_graph_sync(rt)
    return rt


def reset_environment(rt: AppRuntime) -> dict[str, str]:
    lock = rt.write_lock or threading.Lock()
    with lock:
        drop_schema(rt.engine)
        create_schema(rt.engine)
        rt.tools.sandbox.reset()
        with rt.session_factory() as session:
            rt.seed_keys = seed_world(TrustGraph(session, tools=rt.tools))["api_keys"]
    schedule_graph_sync(rt)
    return rt.seed_keys


def schedule_graph_sync(rt: AppRuntime) -> None:
    """Coalesced, asynchronous Neo4j projection refresh."""
    if not rt.projector.enabled or rt.sync_pending.is_set():
        return
    rt.sync_pending.set()

    def job() -> None:
        rt.sync_pending.clear()
        with rt.session_factory() as session:
            rt.projector.sync(TrustGraph(session).graph_snapshot())

    rt.sync_pool.submit(job)


@asynccontextmanager
async def lifespan(app: FastAPI):
    if not hasattr(app.state, "runtime"):
        app.state.runtime = build_runtime(get_settings())
    yield
    app.state.runtime.sync_pool.shutdown(wait=False)


def create_app(rt: AppRuntime | None = None) -> FastAPI:
    app = FastAPI(
        title="TrustGraph AI — Governance API",
        version="1.0.0",
        description=(
            "Risk-adaptive identity, delegation and runtime governance for autonomous AI agents. "
            "This service is the authoritative security decision component."
        ),
        lifespan=lifespan,
    )
    if rt is not None:
        app.state.runtime = rt

    @app.exception_handler(NotFoundError)
    @app.exception_handler(KeyError)
    async def not_found(_: Request, exc: Exception):
        return JSONResponse(status_code=404, content={"detail": str(exc).strip("'")})

    @app.exception_handler(ValidationError)
    async def invalid(_: Request, exc: ValidationError):
        return JSONResponse(status_code=422, content={"detail": str(exc)})

    @app.exception_handler(ConflictError)
    async def conflict(_: Request, exc: ConflictError):
        return JSONResponse(status_code=409, content={"detail": str(exc)})

    @app.middleware("http")
    async def project_graph(request: Request, call_next):
        response = await call_next(request)
        if request.method in MUTATING_METHODS and response.status_code < 400:
            schedule_graph_sync(request.app.state.runtime)
        return response

    app.include_router(observability.health_router)
    app.include_router(registry.router)
    app.include_router(delegations.router)
    app.include_router(runtime.router)
    app.include_router(observability.router)

    @app.get("/admin/seed-keys", tags=["admin"], dependencies=[Depends(require_service)])
    def seed_keys(request: Request) -> dict:
        """API keys issued to seeded demo agents in this process (demo environment only)."""
        return request.app.state.runtime.seed_keys

    return app


app = create_app()
