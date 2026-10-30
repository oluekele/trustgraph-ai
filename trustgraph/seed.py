"""Controlled experimental environment (proposal §12.1).

A fictional organisation ("Acme") with 5 human principals, 8 agents,
11 capabilities, 19 protected resources, 16 policies, direct grants and
multi-hop delegation chains. All data is synthetic.
"""

from trustgraph.capability.models import Capability, Classification, Permission, Resource
from trustgraph.delegation.models import DelegationRequest
from trustgraph.identity.models import Principal, PrincipalKind, PrincipalStatus
from trustgraph.policy.models import Policy, PolicyConditions, PolicyEffect
from trustgraph.service import TrustGraph

C = Classification

CAPABILITIES = [
    Capability(name="calculator.execute", description="Evaluate arithmetic", actions=["execute"]),
    Capability(name="system.time.read", description="Read the system clock", actions=["read"]),
    Capability(name="web.search", description="Search the web", actions=["search"]),
    Capability(name="file.read", description="Read files", actions=["read"]),
    Capability(name="file.write", description="Write files", actions=["write"]),
    Capability(name="database.read", description="Query databases", actions=["read"]),
    Capability(
        name="database.write", description="Modify database records", actions=["create", "update", "delete"]
    ),
    Capability(name="email.send", description="Send email", actions=["send"]),
    Capability(name="payments.execute", description="Move funds", actions=["transfer"]),
    Capability(name="devops.deploy", description="Deploy services", actions=["deploy"]),
    Capability(name="api.request", description="Call internal HTTP APIs", actions=["read", "write", "delete"]),
]


def _resource(uri, name, kind, classification, sensitivity, actions, description=""):
    return Resource(
        id=uri,
        name=name,
        kind=kind,
        classification=classification,
        sensitivity=sensitivity,
        allowed_actions=actions,
        description=description,
    )


RESOURCES = [
    _resource("tool://calculator", "Calculator", "tool", C.PUBLIC, 5, ["execute"]),
    _resource("system://clock", "System clock", "system", C.PUBLIC, 0, ["read"]),
    _resource("web://internet", "Public web", "web", C.PUBLIC, 20, ["search"]),
    _resource("file:///research/report.pdf", "Q3 research report", "file", C.INTERNAL, 30, ["read", "write"]),
    _resource("file:///research/notes.txt", "Research notes", "file", C.PUBLIC, 10, ["read", "write"]),
    _resource("file:///research/vendor-brief.txt", "Vendor brief (external)", "file", C.INTERNAL, 30, ["read"]),
    _resource("file:///reports/weekly.md", "Weekly report", "file", C.INTERNAL, 30, ["read", "write"]),
    _resource("file:///hr/salaries.csv", "Salary register", "file", C.RESTRICTED, 95, ["read", "write"]),
    _resource("file:///finance/forecast.csv", "Revenue forecast", "file", C.CONFIDENTIAL, 70, ["read", "write"]),
    _resource(
        "db://crm/customers", "CRM customers", "database", C.CONFIDENTIAL, 70, ["read", "create", "update", "delete"]
    ),
    _resource(
        "db://crm/customer_notes", "CRM notes", "database", C.INTERNAL, 40, ["read", "create", "update", "delete"]
    ),
    _resource("email://internal", "Internal email", "email", C.INTERNAL, 20, ["send"]),
    _resource("email://external", "External email", "email", C.CONFIDENTIAL, 60, ["send"]),
    _resource("payments://vendor-payouts", "Vendor payouts account", "payments", C.CONFIDENTIAL, 70, ["transfer"]),
    _resource("payments://treasury", "Treasury account", "payments", C.RESTRICTED, 100, ["transfer"]),
    _resource("infra://staging", "Staging environment", "infrastructure", C.INTERNAL, 40, ["deploy"]),
    _resource("infra://production", "Production environment", "infrastructure", C.RESTRICTED, 90, ["deploy"]),
    _resource("api://status.acme.example", "Status API", "api", C.PUBLIC, 10, ["read"]),
    _resource("api://inventory.acme.example", "Inventory API", "api", C.INTERNAL, 40, ["read", "write", "delete"]),
]

USERS = [
    Principal(id="u-ada", kind=PrincipalKind.USER, name="Ada Obi", description="Chief Information Security Officer"),
    Principal(id="u-bayo", kind=PrincipalKind.USER, name="Bayo Adeyemi", description="Finance Director"),
    Principal(id="u-chioma", kind=PrincipalKind.USER, name="Chioma Eze", description="Head of Research"),
    Principal(id="u-dele", kind=PrincipalKind.USER, name="Dele Okon", description="Engineering Lead"),
    Principal(id="u-efe", kind=PrincipalKind.USER, name="Efe Akpan", description="Customer Operations Manager"),
]

AGENTS = [
    Principal(
        id="agent-orchestrator",
        kind=PrincipalKind.AGENT,
        name="Finance Orchestrator",
        description="Plans month-end finance work and delegates sub-tasks.",
        owner_id="u-bayo",
        capabilities=[
            "database.read", "email.send", "file.read", "file.write", "calculator.execute", "payments.execute",
        ],
    ),
    Principal(
        id="agent-finance",
        kind=PrincipalKind.AGENT,
        name="Payments Agent",
        description="Executes vendor payment runs.",
        owner_id="u-bayo",
        parent_agent_id="agent-orchestrator",
        capabilities=["database.read", "payments.execute", "calculator.execute", "email.send"],
    ),
    Principal(
        id="agent-reporting",
        kind=PrincipalKind.AGENT,
        name="Reporting Agent",
        description="Compiles weekly reports from CRM data.",
        owner_id="u-bayo",
        parent_agent_id="agent-finance",
        capabilities=["database.read", "file.read", "file.write", "email.send"],
    ),
    Principal(
        id="agent-research",
        kind=PrincipalKind.AGENT,
        name="Research Assistant",
        description="Searches the web and summarises research files.",
        owner_id="u-chioma",
        capabilities=["web.search", "file.read", "file.write", "calculator.execute", "system.time.read"],
    ),
    Principal(
        id="agent-support",
        kind=PrincipalKind.AGENT,
        name="Customer Support Agent",
        description="Resolves customer tickets in the CRM.",
        owner_id="u-efe",
        capabilities=["database.read", "database.write", "email.send"],
    ),
    Principal(
        id="agent-devops",
        kind=PrincipalKind.AGENT,
        name="DevOps Agent",
        description="Ships builds to staging and production.",
        owner_id="u-dele",
        capabilities=["devops.deploy", "file.read", "api.request", "system.time.read"],
    ),
    Principal(
        id="agent-intern",
        kind=PrincipalKind.AGENT,
        name="Intern Agent",
        description="Experimental agent: broad technical capability, minimal authority.",
        owner_id="u-chioma",
        capabilities=[
            "web.search", "calculator.execute", "database.read", "database.write", "payments.execute", "file.read",
        ],
    ),
    Principal(
        id="agent-legacy",
        kind=PrincipalKind.AGENT,
        name="Legacy Batch Agent",
        description="Decommissioning candidate; suspended.",
        owner_id="u-dele",
        status=PrincipalStatus.SUSPENDED,
        capabilities=["file.read"],
    ),
]


def P(capability: str, resource: str, action: str) -> Permission:
    return Permission(capability=capability, resource=resource, action=action)


CRM_READ = P("database.read", "db://crm/customers", "read")
NOTES_READ = P("database.read", "db://crm/customer_notes", "read")
CRM_UPDATE = P("database.write", "db://crm/customers", "update")
CRM_DELETE = P("database.write", "db://crm/customers", "delete")
VENDOR_PAY = P("payments.execute", "payments://vendor-payouts", "transfer")
TREASURY_PAY = P("payments.execute", "payments://treasury", "transfer")
EMAIL_INT = P("email.send", "email://internal", "send")
EMAIL_EXT = P("email.send", "email://external", "send")
WEEKLY_WRITE = P("file.write", "file:///reports/weekly.md", "write")
FORECAST_READ = P("file.read", "file:///finance/forecast.csv", "read")
CALC = P("calculator.execute", "tool://calculator", "execute")
CLOCK = P("system.time.read", "system://clock", "read")
SEARCH = P("web.search", "web://internet", "search")
REPORT_READ = P("file.read", "file:///research/report.pdf", "read")
NOTES_FILE_READ = P("file.read", "file:///research/notes.txt", "read")
NOTES_FILE_WRITE = P("file.write", "file:///research/notes.txt", "write")
VENDOR_BRIEF_READ = P("file.read", "file:///research/vendor-brief.txt", "read")
HR_READ = P("file.read", "file:///hr/salaries.csv", "read")
DEPLOY_STAGING = P("devops.deploy", "infra://staging", "deploy")
DEPLOY_PROD = P("devops.deploy", "infra://production", "deploy")
STATUS_API = P("api.request", "api://status.acme.example", "read")
INVENTORY_READ = P("api.request", "api://inventory.acme.example", "read")
INVENTORY_WRITE = P("api.request", "api://inventory.acme.example", "write")

# (principal, permission, max delegation depth)
DIRECT_GRANTS = [
    ("u-bayo", CRM_READ, 3),
    ("u-bayo", NOTES_READ, 3),
    ("u-bayo", VENDOR_PAY, 2),
    ("u-bayo", EMAIL_INT, 3),
    ("u-bayo", EMAIL_EXT, 2),
    ("u-bayo", WEEKLY_WRITE, 3),
    ("u-bayo", FORECAST_READ, 2),
    ("u-bayo", CALC, 3),
    ("u-chioma", SEARCH, 2),
    ("u-chioma", REPORT_READ, 2),
    ("u-chioma", NOTES_FILE_READ, 2),
    ("u-chioma", NOTES_FILE_WRITE, 1),
    ("u-chioma", VENDOR_BRIEF_READ, 2),
    ("u-chioma", CALC, 2),
    ("u-dele", DEPLOY_STAGING, 2),
    ("u-dele", DEPLOY_PROD, 1),
    ("u-dele", STATUS_API, 1),
    ("u-dele", INVENTORY_READ, 1),
    ("u-dele", INVENTORY_WRITE, 1),
    ("u-efe", CRM_READ, 2),
    ("u-efe", NOTES_READ, 1),
    ("u-efe", CRM_UPDATE, 1),
    ("u-efe", CRM_DELETE, 1),
    ("u-efe", EMAIL_INT, 1),
    ("u-efe", EMAIL_EXT, 1),
    ("u-ada", HR_READ, 0),
    ("u-ada", TREASURY_PAY, 0),
    ("agent-research", CLOCK, 0),
    ("agent-research", CALC, 0),
    ("agent-intern", CALC, 0),
    ("agent-intern", SEARCH, 0),
]

# (key, request) — key lets scenarios reference the created delegation id.
DELEGATIONS = [
    (
        "bayo->orchestrator",
        DelegationRequest(
            delegator_id="u-bayo",
            delegatee_id="agent-orchestrator",
            grants=[CRM_READ, VENDOR_PAY, EMAIL_INT, EMAIL_EXT, WEEKLY_WRITE, FORECAST_READ, CALC],
            purpose="Month-end finance operations",
            max_redelegation_depth=2,
        ),
    ),
    (
        "orchestrator->finance",
        DelegationRequest(
            delegator_id="agent-orchestrator",
            delegatee_id="agent-finance",
            grants=[CRM_READ, VENDOR_PAY, CALC],
            purpose="Vendor payment run",
            max_redelegation_depth=1,
        ),
    ),
    (
        "finance->reporting",
        DelegationRequest(
            delegator_id="agent-finance",
            delegatee_id="agent-reporting",
            grants=[CRM_READ],
            purpose="Payment run reporting",
            max_redelegation_depth=0,
        ),
    ),
    (
        "orchestrator->reporting",
        DelegationRequest(
            delegator_id="agent-orchestrator",
            delegatee_id="agent-reporting",
            grants=[WEEKLY_WRITE, EMAIL_INT],
            purpose="Publish weekly report",
            max_redelegation_depth=0,
        ),
    ),
    (
        "chioma->research",
        DelegationRequest(
            delegator_id="u-chioma",
            delegatee_id="agent-research",
            grants=[SEARCH, REPORT_READ, NOTES_FILE_READ, NOTES_FILE_WRITE, VENDOR_BRIEF_READ],
            purpose="Market research",
            max_redelegation_depth=0,
        ),
    ),
    (
        "efe->support",
        DelegationRequest(
            delegator_id="u-efe",
            delegatee_id="agent-support",
            grants=[CRM_READ, NOTES_READ, CRM_UPDATE, CRM_DELETE, EMAIL_INT, EMAIL_EXT],
            purpose="Customer ticket resolution",
            max_redelegation_depth=0,
        ),
    ),
    (
        "dele->devops",
        DelegationRequest(
            delegator_id="u-dele",
            delegatee_id="agent-devops",
            grants=[DEPLOY_STAGING, DEPLOY_PROD, STATUS_API, INVENTORY_READ],
            purpose="Release management",
            max_redelegation_depth=0,
        ),
    ),
]

E = PolicyEffect
AGENTS_ANY: list[str] = []

POLICIES = [
    Policy(id="pol-baseline-tools", name="Baseline utilities", effect=E.ALLOW, priority=50,
           capabilities=["calculator.execute", "system.time.read"],
           description="Low-risk utilities are available to any agent holding authority."),
    Policy(id="pol-research", name="Research access", effect=E.ALLOW, priority=60,
           subjects=["agent-research", "agent-intern"], capabilities=["web.search", "file.read"],
           resources=["web://internet", "file:///research/*"]),
    Policy(id="pol-crm-read", name="CRM read access", effect=E.ALLOW, priority=60,
           capabilities=["database.read"], resources=["db://crm/*"],
           conditions=PolicyConditions(max_delegation_hops=3)),
    Policy(id="pol-crm-change", name="CRM changes require a purpose", effect=E.ALLOW, priority=60,
           capabilities=["database.write"], actions=["create", "update"], resources=["db://crm/*"],
           conditions=PolicyConditions(require_purpose=True)),
    Policy(id="pol-crm-delete", name="CRM deletion requires approval", effect=E.REQUIRE_APPROVAL, priority=40,
           capabilities=["database.write"], actions=["delete"], resources=["db://crm/*"],
           conditions=PolicyConditions(require_purpose=True)),
    Policy(id="pol-vendor-pay", name="Vendor payments require approval", effect=E.REQUIRE_APPROVAL, priority=40,
           capabilities=["payments.execute"], resources=["payments://vendor-payouts"],
           conditions=PolicyConditions(require_purpose=True, max_delegation_hops=2)),
    Policy(id="pol-treasury-deny", name="Treasury is human-only", effect=E.DENY, priority=1,
           capabilities=["payments.execute"], resources=["payments://treasury"],
           description="No agent may move treasury funds, regardless of authority."),
    Policy(id="pol-hr-deny", name="HR data is off-limits to agents", effect=E.DENY, priority=1,
           resources=["file:///hr/*"]),
    Policy(id="pol-email-internal", name="Internal email", effect=E.ALLOW, priority=60,
           capabilities=["email.send"], resources=["email://internal"]),
    Policy(id="pol-email-external", name="External email limits", effect=E.ALLOW, priority=60,
           capabilities=["email.send"], resources=["email://external"],
           conditions=PolicyConditions(require_purpose=True, max_risk_score=55, max_delegation_hops=1)),
    Policy(id="pol-reports-write", name="Report publishing", effect=E.ALLOW, priority=60,
           capabilities=["file.write"], resources=["file:///reports/*", "file:///research/notes.txt"]),
    Policy(id="pol-forecast-read", name="Forecast read (max one hop)", effect=E.ALLOW, priority=60,
           capabilities=["file.read"], resources=["file:///finance/*"],
           conditions=PolicyConditions(max_delegation_hops=1)),
    Policy(id="pol-deploy-staging", name="Staging deploys", effect=E.ALLOW, priority=60,
           capabilities=["devops.deploy"], resources=["infra://staging"]),
    Policy(id="pol-deploy-prod", name="Production deploys require approval", effect=E.REQUIRE_APPROVAL,
           priority=40, capabilities=["devops.deploy"], resources=["infra://production"],
           conditions=PolicyConditions(require_purpose=True)),
    Policy(id="pol-internal-api-read", name="Internal API reads", effect=E.ALLOW, priority=60,
           capabilities=["api.request"], actions=["read"], resources=["api://*"]),
    Policy(id="pol-intern-lockdown", name="Intern agent is read-only", effect=E.DENY, priority=1,
           subjects=["agent-intern"],
           actions=["create", "update", "delete", "write", "send", "transfer", "deploy"]),
]


def seed_world(tg: TrustGraph) -> dict[str, object]:
    """Populate an empty TrustGraph database. Returns agent API keys and delegation ids."""
    for capability in CAPABILITIES:
        tg.catalog.register_capability(capability)
    for resource in RESOURCES:
        tg.catalog.register_resource(resource)
    api_keys: dict[str, str] = {}
    for principal in [*USERS, *AGENTS]:
        _, key = tg.identity.register(principal)
        if key:
            api_keys[principal.id] = key
    for principal_id, permission, depth in DIRECT_GRANTS:
        tg.direct_authority.grant(principal_id, permission, max_delegation_depth=depth)
    for policy in POLICIES:
        tg.repository.upsert_policy(policy)
    delegation_ids: dict[str, str] = {}
    for key, request in DELEGATIONS:
        result = tg.delegations.create_delegation(request, created_by="seed")
        if not result.accepted:
            raise RuntimeError(f"Seed delegation '{key}' rejected: {result.reason}")
        delegation_ids[key] = result.delegation.id
    tg.commit()
    return {"api_keys": api_keys, "delegations": delegation_ids}


def is_seeded(tg: TrustGraph) -> bool:
    return bool(tg.repository.list_principals())
