import posixpath
from typing import Any

from ai_agent.tools.sandbox import Sandbox, redact


def sandbox_path(path: str) -> str:
    """Normalise a sandbox path exactly as the governance layer does."""
    path = str(path).strip()
    if path.startswith("file://"):
        path = path[len("file://") :]
    return posixpath.normpath("/" + path.lstrip("/"))


def file_reader(sandbox: Sandbox, arguments: dict[str, Any], restrictions: dict[str, Any]) -> dict:
    path = sandbox_path(arguments["path"])
    if path not in sandbox.files:
        raise FileNotFoundError(f"No such file in sandbox: {path}")
    content = sandbox.files[path]
    if restrictions.get("redact_pii"):
        content = redact(content)
    return {"path": path, "content": content, "restricted": bool(restrictions)}


def file_writer(sandbox: Sandbox, arguments: dict[str, Any], restrictions: dict[str, Any]) -> dict:
    path = sandbox_path(arguments["path"])
    content = str(arguments.get("content", ""))
    sandbox.files[path] = content
    return {"path": path, "bytes_written": len(content.encode("utf-8"))}
