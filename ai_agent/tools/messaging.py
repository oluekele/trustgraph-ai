"""Synthetic email, payments and deployment tools."""

from typing import Any

from ai_agent.tools.sandbox import Sandbox, redact

INTERNAL_DOMAIN = "acme.example"


def email_scope(arguments: dict[str, Any]) -> str:
    recipients = arguments.get("to") or []
    if isinstance(recipients, str):
        recipients = [recipients]
    internal = recipients and all(
        str(address).lower().endswith("@" + INTERNAL_DOMAIN) for address in recipients
    )
    return "email://internal" if internal else "email://external"


def send_email(sandbox: Sandbox, arguments: dict[str, Any], restrictions: dict[str, Any]) -> dict:
    recipients = arguments.get("to") or []
    if isinstance(recipients, str):
        recipients = [recipients]
    if not recipients:
        raise ValueError("At least one recipient is required.")
    body = str(arguments.get("body", ""))
    if restrictions:
        recipients = recipients[: int(restrictions.get("max_affected_records", 1))]
        if restrictions.get("redact_pii"):
            body = redact(body)
    message = {"to": recipients, "subject": str(arguments.get("subject", "")), "body": body}
    sandbox.outbox.append(message)
    return {"sent": True, "recipients": recipients, "message_id": f"msg-{len(sandbox.outbox)}"}


def payment_transfer(sandbox: Sandbox, arguments: dict[str, Any], restrictions: dict[str, Any]) -> dict:
    amount = float(arguments.get("amount", 0))
    if amount <= 0:
        raise ValueError("Transfer amount must be positive.")
    entry = {
        "account": arguments.get("account"),
        "recipient": arguments.get("recipient"),
        "amount": amount,
        "reference": arguments.get("reference", ""),
    }
    sandbox.ledger.append(entry)
    return {"transferred": True, "ledger_entry": len(sandbox.ledger), **entry}


def deploy_service(sandbox: Sandbox, arguments: dict[str, Any], restrictions: dict[str, Any]) -> dict:
    record = {
        "service": arguments.get("service"),
        "version": arguments.get("version"),
        "environment": arguments.get("environment"),
    }
    sandbox.deployments.append(record)
    return {"deployed": True, **record}
