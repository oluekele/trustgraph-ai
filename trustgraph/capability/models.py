from enum import StrEnum

from pydantic import BaseModel, ConfigDict, Field


class Classification(StrEnum):
    PUBLIC = "public"
    INTERNAL = "internal"
    CONFIDENTIAL = "confidential"
    RESTRICTED = "restricted"


class Capability(BaseModel):
    """A technical capability, e.g. ``file.read`` or ``payments.execute``."""

    name: str
    description: str = ""
    actions: list[str] = Field(default_factory=list)


class Resource(BaseModel):
    """A protected resource identified by a canonical URI."""

    id: str
    name: str
    kind: str
    classification: Classification = Classification.INTERNAL
    sensitivity: float = Field(default=50.0, ge=0, le=100)
    allowed_actions: list[str] = Field(default_factory=list)
    owner_id: str | None = None
    description: str = ""


class Permission(BaseModel):
    """The atomic unit of authority: capability + resource + action."""

    model_config = ConfigDict(frozen=True)

    capability: str
    resource: str
    action: str

    @property
    def key(self) -> tuple[str, str, str]:
        return (self.capability, self.resource, self.action)

    def __str__(self) -> str:
        return f"{self.capability} → {self.resource} → {self.action}"
