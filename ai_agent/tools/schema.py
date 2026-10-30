"""Tool metadata visible to agents.

A ``ToolSpec`` describes a tool and how its arguments map onto the
governance tuple (capability, resource, action). It deliberately carries
no reference to the implementation: agents only ever see specs.
"""

from dataclasses import dataclass, field
from typing import Any, Callable


@dataclass(frozen=True)
class ToolSpec:
    name: str
    description: str
    parameters: dict[str, Any]
    capability: str
    action: str | Callable[[dict[str, Any]], str]
    resource: str | Callable[[dict[str, Any]], str]
    side_effect: bool = False
    tags: tuple[str, ...] = field(default_factory=tuple)

    def resolve(self, arguments: dict[str, Any]) -> tuple[str, str]:
        """Return (resource, action) for a concrete invocation."""
        resource = self.resource(arguments) if callable(self.resource) else self.resource
        action = self.action(arguments) if callable(self.action) else self.action
        return resource, action

    def to_function_schema(self) -> dict[str, Any]:
        return {
            "type": "function",
            "function": {
                "name": self.name,
                "description": self.description,
                "parameters": self.parameters,
            },
        }

    def to_metadata(self) -> dict[str, Any]:
        return {
            "name": self.name,
            "description": self.description,
            "capability": self.capability,
            "action": self.action if isinstance(self.action, str) else "dynamic",
            "resource": self.resource if isinstance(self.resource, str) else "dynamic",
            "side_effect": self.side_effect,
            "parameters": self.parameters,
        }


# Name kept from the original prototype.
ToolDefinition = ToolSpec
