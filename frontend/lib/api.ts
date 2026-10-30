import type {
  AgentRun,
  AgentRunBody,
  ApprovalRequest,
  ApprovalStatus,
  AuditPage,
  AuditQuery,
  AuditVerification,
  AuthorityGrant,
  AuthorizationDecision,
  AuthorizeBody,
  AuthoritySummary,
  Capability,
  Delegation,
  DelegationDetail,
  DelegationRequest,
  DelegationResult,
  DelegationStatus,
  EvaluationResult,
  ExecuteBody,
  ExecutionResult,
  GatewayUser,
  GrantCreate,
  GraphSnapshot,
  GraphSyncResult,
  HealthStatus,
  Neo4jChains,
  Overview,
  Policy,
  PolicyInput,
  Principal,
  PrincipalCreate,
  PrincipalDetail,
  PrincipalKind,
  PrincipalStatus,
  ResetResult,
  Resource,
  RiskConfigView,
  SessionUser,
  ToolMetadata,
  UserCreate,
  UserUpdate,
} from './types';

export const API_BASE = (process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001/api').replace(/\/+$/, '');

/** Error carrying the HTTP status (0 = network failure, gateway unreachable). */
export class ApiError extends Error {
  readonly status: number;
  readonly body: unknown;

  constructor(status: number, message: string, body?: unknown) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.body = body;
  }

  get isUnauthorized(): boolean {
    return this.status === 401;
  }

  get isForbidden(): boolean {
    return this.status === 403;
  }

  get isUnavailable(): boolean {
    return this.status === 0 || this.status === 502 || this.status === 503 || this.status === 504;
  }
}

type Query = Record<string, string | number | boolean | null | undefined>;

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  body?: unknown;
  query?: Query;
  signal?: AbortSignal;
  /** Do not trigger the global "session expired" handler on 401. */
  skipAuthRedirect?: boolean;
}

let unauthorizedHandler: (() => void) | null = null;

/** Registered by the session provider so any 401 ends the session. */
export function setUnauthorizedHandler(handler: (() => void) | null): void {
  unauthorizedHandler = handler;
}

function buildUrl(path: string, query?: Query): string {
  const url = `${API_BASE}${path.startsWith('/') ? path : `/${path}`}`;
  if (!query) return url;
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === null || value === '') continue;
    params.set(key, String(value));
  }
  const qs = params.toString();
  return qs ? `${url}?${qs}` : url;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Extracts a readable message from FastAPI (`detail`) or NestJS (`message`) error bodies. */
function messageFrom(status: number, body: unknown): string {
  if (isRecord(body)) {
    const detail = body.detail ?? body.message;
    if (typeof detail === 'string' && detail) return detail;
    if (Array.isArray(detail)) {
      const parts = detail.map((item) => {
        if (typeof item === 'string') return item;
        if (isRecord(item)) {
          const loc = Array.isArray(item.loc) ? item.loc.filter((p) => p !== 'body').join('.') : '';
          const msg = typeof item.msg === 'string' ? item.msg : JSON.stringify(item);
          return loc ? `${loc}: ${msg}` : msg;
        }
        return String(item);
      });
      if (parts.length) return parts.join('; ');
    }
  }
  if (typeof body === 'string' && body.trim() && body.length < 300) return body.trim();
  switch (status) {
    case 401:
      return 'Your session has expired. Please sign in again.';
    case 403:
      return 'Your role does not permit this action.';
    case 404:
      return 'Not found.';
    case 502:
    case 503:
    case 504:
      return 'Governance service unavailable. The gateway could not reach the TrustGraph engine.';
    default:
      return `Request failed (${status}).`;
  }
}

export async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { method = 'GET', body, query, signal, skipAuthRedirect } = options;
  let response: Response;
  try {
    response = await fetch(buildUrl(path, query), {
      method,
      credentials: 'include',
      signal,
      headers: {
        Accept: 'application/json',
        ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
      cache: 'no-store',
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') throw error;
    throw new ApiError(0, 'Cannot reach the TrustGraph gateway. Check that it is running.');
  }

  const text = await response.text();
  let parsed: unknown = undefined;
  if (text) {
    try {
      parsed = JSON.parse(text);
    } catch {
      parsed = text;
    }
  }

  if (!response.ok) {
    if (response.status === 401 && !skipAuthRedirect) unauthorizedHandler?.();
    throw new ApiError(response.status, messageFrom(response.status, parsed), parsed);
  }
  return parsed as T;
}

const enc = encodeURIComponent;

function unwrapUsers(value: GatewayUser[] | { users: GatewayUser[] }): GatewayUser[] {
  return Array.isArray(value) ? value : value.users;
}

export const api = {
  // ---------------------------------------------------------------- auth
  login: (email: string, password: string) =>
    request<{ user: SessionUser }>('/auth/login', {
      method: 'POST',
      body: { email, password },
      skipAuthRedirect: true,
    }),
  logout: () => request<unknown>('/auth/logout', { method: 'POST', skipAuthRedirect: true }),
  me: () => request<{ user: SessionUser }>('/auth/me', { skipAuthRedirect: true }),

  // --------------------------------------------------------------- users
  users: async () => unwrapUsers(await request<GatewayUser[] | { users: GatewayUser[] }>('/users')),
  createUser: (body: UserCreate) => request<GatewayUser | { user: GatewayUser }>('/users', { method: 'POST', body }),
  updateUser: (id: string, body: UserUpdate) =>
    request<GatewayUser | { user: GatewayUser }>(`/users/${enc(id)}`, { method: 'PATCH', body }),

  // ------------------------------------------------------- observability
  health: () => request<HealthStatus>('/health'),
  overview: () => request<Overview>('/overview'),
  audit: (query: AuditQuery) => request<AuditPage>('/audit', { query: { ...query } }),
  verifyAudit: () => request<AuditVerification>('/audit/verify'),
  graph: (activity = 50) => request<GraphSnapshot>('/graph', { query: { activity } }),
  syncGraph: () => request<GraphSyncResult>('/graph/sync', { method: 'POST' }),
  neo4jChains: (agentId: string) => request<Neo4jChains>(`/graph/neo4j/chains/${enc(agentId)}`),
  riskConfig: () => request<RiskConfigView>('/risk/config'),
  latestEvaluation: () => request<EvaluationResult>('/evaluation/latest'),
  runEvaluation: (repetitions: number) =>
    request<EvaluationResult>('/evaluation/run', { method: 'POST', body: { repetitions } }),
  reset: () => request<ResetResult>('/admin/reset', { method: 'POST' }),

  // ----------------------------------------------------------- registry
  principals: (kind?: PrincipalKind) => request<Principal[]>('/principals', { query: { kind } }),
  principal: (id: string) => request<PrincipalDetail>(`/principals/${enc(id)}`),
  createPrincipal: (body: PrincipalCreate) =>
    request<{ principal: Principal; api_key: string | null }>('/principals', { method: 'POST', body }),
  authority: (id: string) => request<AuthoritySummary>(`/principals/${enc(id)}/authority`),
  setPrincipalStatus: (id: string, status: PrincipalStatus) =>
    request<Principal>(`/principals/${enc(id)}/status`, { method: 'PATCH', body: { status } }),
  capabilities: () => request<Capability[]>('/capabilities'),
  resources: () => request<Resource[]>('/resources'),
  grants: (principalId?: string) =>
    request<AuthorityGrant[]>('/grants', { query: { principal_id: principalId } }),
  createGrant: (body: GrantCreate) => request<AuthorityGrant>('/grants', { method: 'POST', body }),
  revokeGrant: (id: string) =>
    request<{ grant: AuthorityGrant; cascaded_delegations: string[] }>(`/grants/${enc(id)}/revoke`, {
      method: 'POST',
    }),

  // ------------------------------------------------------------- policies
  policies: () => request<Policy[]>('/policies'),
  createPolicy: (body: PolicyInput) => request<Policy>('/policies', { method: 'POST', body }),
  updatePolicy: (id: string, body: PolicyInput) =>
    request<Policy>(`/policies/${enc(id)}`, { method: 'PUT', body }),
  deletePolicy: (id: string) => request<void>(`/policies/${enc(id)}`, { method: 'DELETE' }),

  // ---------------------------------------------------------- delegations
  delegations: (params: { principal_id?: string; status?: DelegationStatus } = {}) =>
    request<Delegation[]>('/delegations', { query: { ...params } }),
  delegation: (id: string) => request<DelegationDetail>(`/delegations/${enc(id)}`),
  createDelegation: (body: DelegationRequest) =>
    request<DelegationResult>('/delegations', { method: 'POST', body }),
  revokeDelegation: (id: string, reason: string) =>
    request<{ revoked: Delegation[] }>(`/delegations/${enc(id)}/revoke`, { method: 'POST', body: { reason } }),

  // -------------------------------------------------------------- runtime
  tools: () => request<ToolMetadata[]>('/tools'),
  authorize: (body: AuthorizeBody) => request<AuthorizationDecision>('/authorize', { method: 'POST', body }),
  execute: (body: ExecuteBody) => request<ExecutionResult>('/execute', { method: 'POST', body }),
  runAgent: (agentId: string, body: AgentRunBody) =>
    request<AgentRun>(`/agents/${enc(agentId)}/run`, { method: 'POST', body }),

  // ------------------------------------------------------------ approvals
  approvals: (status?: ApprovalStatus) => request<ApprovalRequest[]>('/approvals', { query: { status } }),
  approval: (id: string) => request<ApprovalRequest>(`/approvals/${enc(id)}`),
  approve: (id: string, note: string | null) =>
    request<ApprovalRequest>(`/approvals/${enc(id)}/approve`, { method: 'POST', body: { note } }),
  reject: (id: string, note: string | null) =>
    request<ApprovalRequest>(`/approvals/${enc(id)}/reject`, { method: 'POST', body: { note } }),
  executeApproval: (id: string) =>
    request<ExecutionResult>(`/approvals/${enc(id)}/execute`, { method: 'POST' }),
};

export function errorMessage(error: unknown): string {
  if (error instanceof ApiError) return error.message;
  if (error instanceof Error) return error.message;
  return 'Unexpected error.';
}
