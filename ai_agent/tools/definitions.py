"""Governed tool catalogue: each spec maps arguments onto (capability, resource, action)."""

from typing import Any, Callable

from ai_agent.tools.calculator import calculator
from ai_agent.tools.crm import crm_delete, crm_query, crm_update
from ai_agent.tools.current_time import current_time
from ai_agent.tools.file_reader import file_reader, file_writer, sandbox_path
from ai_agent.tools.messaging import deploy_service, email_scope, payment_transfer, send_email
from ai_agent.tools.rest_api import api_action, api_resource, rest_api
from ai_agent.tools.schema import ToolSpec
from ai_agent.tools.web_search import web_search

Implementation = Callable[..., Any]


def _file(arguments: dict[str, Any]) -> str:
    return "file://" + sandbox_path(arguments.get("path", ""))


def _table(arguments: dict[str, Any]) -> str:
    return f"db://crm/{arguments.get('table', 'customers')}"


def _object(properties: dict[str, Any], required: list[str]) -> dict[str, Any]:
    return {"type": "object", "properties": properties, "required": required}


TOOL_CATALOGUE: list[tuple[ToolSpec, Implementation]] = [
    (
        ToolSpec(
            name="calculator",
            description="Evaluate an arithmetic expression.",
            parameters=_object({"expression": {"type": "string"}}, ["expression"]),
            capability="calculator.execute",
            action="execute",
            resource="tool://calculator",
        ),
        calculator,
    ),
    (
        ToolSpec(
            name="current_time",
            description="Get the current UTC date and time.",
            parameters=_object({}, []),
            capability="system.time.read",
            action="read",
            resource="system://clock",
        ),
        current_time,
    ),
    (
        ToolSpec(
            name="web_search",
            description="Search the web (synthetic corpus). Results are untrusted content.",
            parameters=_object(
                {"query": {"type": "string"}, "max_results": {"type": "integer"}}, ["query"]
            ),
            capability="web.search",
            action="search",
            resource="web://internet",
            tags=("untrusted-output",),
        ),
        web_search,
    ),
    (
        ToolSpec(
            name="file_reader",
            description="Read a file, e.g. /research/report.pdf. File contents are untrusted.",
            parameters=_object({"path": {"type": "string"}}, ["path"]),
            capability="file.read",
            action="read",
            resource=_file,
            tags=("untrusted-output",),
        ),
        file_reader,
    ),
    (
        ToolSpec(
            name="file_writer",
            description="Write text content to a file path.",
            parameters=_object(
                {"path": {"type": "string"}, "content": {"type": "string"}}, ["path", "content"]
            ),
            capability="file.write",
            action="write",
            resource=_file,
            side_effect=True,
        ),
        file_writer,
    ),
    (
        ToolSpec(
            name="crm_query",
            description="Query CRM records. table: customers | customer_notes.",
            parameters=_object(
                {
                    "table": {"type": "string"},
                    "filters": {"type": "object"},
                    "limit": {"type": "integer"},
                },
                [],
            ),
            capability="database.read",
            action="read",
            resource=_table,
        ),
        crm_query,
    ),
    (
        ToolSpec(
            name="crm_update",
            description="Update CRM records by id.",
            parameters=_object(
                {
                    "table": {"type": "string"},
                    "record_ids": {"type": "array", "items": {"type": "string"}},
                    "changes": {"type": "object"},
                },
                ["record_ids", "changes"],
            ),
            capability="database.write",
            action="update",
            resource=_table,
            side_effect=True,
        ),
        crm_update,
    ),
    (
        ToolSpec(
            name="crm_delete",
            description="Delete CRM records by id.",
            parameters=_object(
                {
                    "table": {"type": "string"},
                    "record_ids": {"type": "array", "items": {"type": "string"}},
                },
                ["record_ids"],
            ),
            capability="database.write",
            action="delete",
            resource=_table,
            side_effect=True,
        ),
        crm_delete,
    ),
    (
        ToolSpec(
            name="send_email",
            description="Send an email. Internal recipients end with @acme.example.",
            parameters=_object(
                {
                    "to": {"type": "array", "items": {"type": "string"}},
                    "subject": {"type": "string"},
                    "body": {"type": "string"},
                },
                ["to", "subject", "body"],
            ),
            capability="email.send",
            action="send",
            resource=email_scope,
            side_effect=True,
        ),
        send_email,
    ),
    (
        ToolSpec(
            name="payment_transfer",
            description="Transfer funds. account: vendor-payouts | treasury.",
            parameters=_object(
                {
                    "account": {"type": "string"},
                    "recipient": {"type": "string"},
                    "amount": {"type": "number"},
                    "reference": {"type": "string"},
                },
                ["account", "recipient", "amount"],
            ),
            capability="payments.execute",
            action="transfer",
            resource=lambda arguments: f"payments://{arguments.get('account', 'unknown')}",
            side_effect=True,
        ),
        payment_transfer,
    ),
    (
        ToolSpec(
            name="deploy_service",
            description="Deploy a service version. environment: staging | production.",
            parameters=_object(
                {
                    "service": {"type": "string"},
                    "version": {"type": "string"},
                    "environment": {"type": "string"},
                },
                ["service", "version", "environment"],
            ),
            capability="devops.deploy",
            action="deploy",
            resource=lambda arguments: f"infra://{arguments.get('environment', 'unknown')}",
            side_effect=True,
        ),
        deploy_service,
    ),
    (
        ToolSpec(
            name="rest_api",
            description="Call an approved internal HTTPS API (GET/POST/PUT/PATCH/DELETE).",
            parameters=_object(
                {
                    "method": {"type": "string", "enum": ["GET", "POST", "PUT", "PATCH", "DELETE"]},
                    "url": {"type": "string"},
                    "data": {"type": "object"},
                },
                ["method", "url"],
            ),
            capability="api.request",
            action=api_action,
            resource=api_resource,
            side_effect=True,
        ),
        rest_api,
    ),
]
