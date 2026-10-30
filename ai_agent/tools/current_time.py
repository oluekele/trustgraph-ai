from datetime import datetime, timezone
from typing import Any

from ai_agent.tools.sandbox import Sandbox


def current_time(sandbox: Sandbox, arguments: dict[str, Any], restrictions: dict[str, Any]) -> dict:
    return {"utc": datetime.now(timezone.utc).isoformat(timespec="seconds")}
