"""Simulated internal REST API.

Real outbound HTTP is out of scope for the controlled environment; this
tool returns canned responses for approved synthetic hosts so the
governance of HTTP methods (GET=read, POST/PUT/PATCH=write, DELETE=delete)
can still be exercised.
"""

from typing import Any
from urllib.parse import urlsplit

from ai_agent.tools.sandbox import Sandbox

METHOD_ACTIONS = {"GET": "read", "POST": "write", "PUT": "write", "PATCH": "write", "DELETE": "delete"}

RESPONSES = {
    "status.acme.example": {"status": "operational", "incidents": []},
    "inventory.acme.example": {"items": [{"sku": "NW-100", "stock": 42}]},
}


def api_resource(arguments: dict[str, Any]) -> str:
    host = urlsplit(str(arguments.get("url", ""))).hostname or "invalid"
    return f"api://{host}"


def api_action(arguments: dict[str, Any]) -> str:
    return METHOD_ACTIONS.get(str(arguments.get("method", "GET")).upper(), "admin")


def rest_api(sandbox: Sandbox, arguments: dict[str, Any], restrictions: dict[str, Any]) -> dict:
    url = str(arguments.get("url", ""))
    parts = urlsplit(url)
    if parts.scheme != "https" or not parts.hostname:
        raise ValueError("Only HTTPS URLs are allowed.")
    body = RESPONSES.get(parts.hostname)
    if body is None:
        raise PermissionError(f"Host '{parts.hostname}' is not part of the sandbox.")
    method = str(arguments.get("method", "GET")).upper()
    return {"status_code": 200, "method": method, "url": url, "body": body}
