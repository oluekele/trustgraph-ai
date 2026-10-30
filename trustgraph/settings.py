"""Runtime configuration for the TrustGraph governance service.

Values are read from environment variables (prefixed ``TRUSTGRAPH_`` where
they are TrustGraph-specific) and from ``.env`` / ``ai_agent/.env``.
"""

from functools import lru_cache
from pathlib import Path

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict

BASE_DIR = Path(__file__).resolve().parent.parent


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=(BASE_DIR / ".env", BASE_DIR / "ai_agent" / ".env"),
        env_file_encoding="utf-8",
        extra="ignore",
        env_ignore_empty=True,
    )

    # Persistence ---------------------------------------------------------
    database_url: str = Field(
        default=f"sqlite:///{BASE_DIR / 'trustgraph.db'}",
        alias="TRUSTGRAPH_DATABASE_URL",
    )

    # Service-to-service authentication (NestJS -> Python). When empty the
    # API accepts unauthenticated calls, which is only acceptable locally.
    service_token: str = Field(default="", alias="TRUSTGRAPH_SERVICE_TOKEN")

    # Secret used to sign single-use tool execution tickets.
    ticket_secret: str = Field(
        default="dev-only-ticket-secret-change-me",
        alias="TRUSTGRAPH_TICKET_SECRET",
    )

    seed_on_startup: bool = Field(default=True, alias="TRUSTGRAPH_SEED_ON_STARTUP")

    # Human approval -------------------------------------------------------
    approval_ttl_minutes: int = Field(default=30, alias="TRUSTGRAPH_APPROVAL_TTL_MINUTES")

    # Neo4j graph projection (optional; never authoritative) -------------
    neo4j_enabled: bool = Field(default=False, alias="TRUSTGRAPH_NEO4J_ENABLED")
    neo4j_uri: str = Field(default="neo4j://localhost:7687", alias="NEO4J_URI")
    neo4j_username: str = Field(default="neo4j", alias="NEO4J_USERNAME")
    neo4j_password: str = Field(default="trustgraph", alias="NEO4J_PASSWORD")
    neo4j_database: str = Field(default="neo4j", alias="NEO4J_DATABASE")

    # LLM planners -----------------------------------------------------------
    gemini_api_key: str = Field(default="", alias="GEMINI_API_KEY")
    gemini_model: str = Field(default="gemini-3.8-flash", alias="GEMINI_MODEL")
    openai_api_key: str = Field(default="", alias="OPENAI_API_KEY")
    openai_model: str = Field(default="gpt-4.1-mini", alias="OPENAI_MODEL")
    grok_api_key: str = Field(default="", alias="GROK_API_KEY")
    grok_model: str = Field(default="grok-3-mini", alias="GROK_MODEL")


@lru_cache
def get_settings() -> Settings:
    return Settings()
