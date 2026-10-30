/**
 * Types mirroring the TrustGraph governance API (Python FastAPI, proxied 1:1
 * by the NestJS gateway under /api) plus the gateway's own auth/user routes.
 * Datetimes are ISO-8601 strings as produced by pydantic `model_dump(mode="json")`.
 */

export type ISODate = string;
export type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };
export type JsonObject = { [key: string]: JsonValue };

// --------------------------------------------------------------- gateway auth

export type Role = 'auditor' | 'approver' | 'operator' | 'admin';

export interface SessionUser {
  id: string;
  email: string;
  name: string;
  role: Role;
}

export interface GatewayUser extends SessionUser {
  active?: boolean;
  isActive?: boolean;
  createdAt?: ISODate;
  lastLoginAt?: ISODate | null;
}

export interface UserCreate {
  email: string;
  name: string;
  password: string;
  role: Role;
}

export interface UserUpdate {
  name?: string;
  role?: Role;
  active?: boolean;
  password?: string;
}

// ------------------------------------------------------------------ identity

export type PrincipalKind = 'user' | 'agent';
export type PrincipalStatus = 'active' | 'suspended' | 'decommissioned';

export interface Principal {
  id: string;
  kind: PrincipalKind;
  name: string;
  description: string;
  owner_id: string | null;
  parent_agent_id: string | null;
  status: PrincipalStatus;
  capabilities: string[];
  created_at: ISODate;
}

export interface PrincipalCreate {
  id: string;
  kind: PrincipalKind;
  name: string;
  description?: string;
  owner_id?: string | null;
  parent_agent_id?: string | null;
  capabilities?: string[];
}

// ------------------------------------------------------------------ catalogue

export type Classification = 'public' | 'internal' | 'confidential' | 'restricted';

export interface Capability {
  name: string;
  description: string;
  actions: string[];
}

export interface Resource {
  id: string;
  name: string;
  kind: string;
  classification: Classification;
  sensitivity: number;
  allowed_actions: string[];
  owner_id: string | null;
  description: string;
}

export interface Permission {
  capability: string;
  resource: string;
  action: string;
}

// ------------------------------------------------------------------ authority

export interface AuthorityGrant extends Permission {
  id: string;
  principal_id: string;
  max_delegation_depth: number;
  granted_by: string;
  created_at: ISODate;
  expires_at: ISODate | null;
  revoked_at: ISODate | null;
  valid?: boolean;
}

export interface GrantCreate extends Permission {
  principal_id: string;
  max_delegation_depth: number;
  expires_at?: ISODate | null;
}

export interface AuthorityPath {
  permission: Permission;
  root_principal_id: string;
  root_grant_id: string;
  chain: string[];
  principals: string[];
  remaining_depth: number;
  expires_at: ISODate | null;
}

export interface AuthorityPermission {
  permission: Permission;
  paths: AuthorityPath[];
  direct: boolean;
  delegable: boolean;
}

export interface AuthoritySummary {
  principal_id: string;
  permissions: AuthorityPermission[];
}

// ----------------------------------------------------------------- delegation

export type DelegationStatus = 'active' | 'revoked' | 'expired';

export interface Delegation {
  id: string;
  delegator_id: string;
  delegatee_id: string;
  grants: Permission[];
  purpose: string;
  max_redelegation_depth: number;
  parent_delegation_id: string | null;
  depth: number;
  status: DelegationStatus;
  created_by: string;
  created_at: ISODate;
  expires_at: ISODate | null;
  revoked_at: ISODate | null;
  revoked_reason: string | null;
  effective_status: DelegationStatus;
}

export interface DelegationRequest {
  delegator_id: string;
  delegatee_id: string;
  grants: Permission[];
  purpose: string;
  max_redelegation_depth: number;
  expires_at?: ISODate | null;
}

export interface DelegationResult {
  accepted: boolean;
  reason: string;
  violations: string[];
  delegation: Omit<Delegation, 'effective_status'> | null;
}

export interface DelegationDetail {
  delegation: Delegation;
  chain: Delegation[];
  children: Delegation[];
}

export interface PrincipalDetail {
  principal: Principal;
  authority: AuthoritySummary;
  grants: AuthorityGrant[];
  delegations: Delegation[];
  owned_agents: string[];
}

// -------------------------------------------------------------------- policy

export type PolicyEffect = 'allow' | 'require_approval' | 'deny';

export interface PolicyConditions {
  require_purpose: boolean;
  max_risk_score: number | null;
  max_delegation_hops: number | null;
  direct_authority_only: boolean;
  allowed_hours_utc: [number, number] | null;
}

export interface Policy {
  id: string;
  name: string;
  description: string;
  effect: PolicyEffect;
  priority: number;
  subjects: string[];
  capabilities: string[];
  resources: string[];
  actions: string[];
  conditions: PolicyConditions;
  enabled: boolean;
  version: number;
  created_at: ISODate;
  updated_at: ISODate;
}

export type PolicyInput = Omit<Policy, 'version' | 'created_at' | 'updated_at'>;

// ---------------------------------------------------------------------- risk

export type RiskLevel = 'low' | 'medium' | 'high' | 'critical';

export interface RiskFactors {
  action_sensitivity: number;
  resource_sensitivity: number;
  delegation_risk: number;
  context_risk: number;
  behavioural_risk: number;
}

export interface RiskAssessment {
  score: number;
  level: RiskLevel;
  factors: RiskFactors;
  contributions: Record<string, number>;
  notes: string[];
}

export interface RiskWeights extends Record<string, number> {
  action_sensitivity: number;
  resource_sensitivity: number;
  delegation_risk: number;
  context_risk: number;
  behavioural_risk: number;
  sensitivity_interaction: number;
}

export interface RiskThresholds {
  medium: number;
  high: number;
  critical: number;
}

export interface RiskConfigView {
  weights: RiskWeights;
  thresholds: RiskThresholds;
  behaviour_window_minutes: number;
  action_sensitivity: Record<string, number>;
  delegation_hop_risk: Record<string, number>;
  decision_mapping: Record<RiskLevel, Decision>;
}

// ------------------------------------------------------------- authorization

export type Decision = 'allow' | 'restrict' | 'require_approval' | 'deny';
export type TraceOutcome = 'pass' | 'fail' | 'warn' | 'info';

export interface TraceStep {
  step: string;
  outcome: TraceOutcome;
  detail: string;
}

export interface RequestContext {
  purpose?: string | null;
  untrusted_input?: boolean;
  session_id?: string | null;
  source?: string;
  attributes?: JsonObject;
}

export interface AuthorizeBody extends Permission {
  agent_id: string;
  arguments?: JsonObject;
  context?: RequestContext;
  approval_id?: string | null;
}

export interface ExecuteBody {
  agent_id: string;
  tool: string;
  arguments: JsonObject;
  context?: RequestContext;
  approval_id?: string | null;
}

export interface AuthorizationDecision extends Permission {
  request_id: string;
  decision: Decision;
  reason: string;
  agent_id: string;
  on_behalf_of: string | null;
  authority_path: AuthorityPath | null;
  matched_policies: string[];
  risk: RiskAssessment | null;
  restrictions: JsonObject;
  approval_id: string | null;
  approved_by: string | null;
  trace: TraceStep[];
  fingerprint: string;
  latency_ms: number;
  evaluated_at: ISODate;
}

export type ExecutionStatus = 'executed' | 'restricted' | 'pending_approval' | 'blocked' | 'failed';

export interface ExecutionResult {
  request_id: string;
  tool_name: string;
  status: ExecutionStatus;
  decision: AuthorizationDecision;
  output: JsonValue;
  error: string | null;
}

// --------------------------------------------------------------------- tools

export interface JsonSchema {
  type?: string | string[];
  description?: string;
  properties?: Record<string, JsonSchema>;
  required?: string[];
  items?: JsonSchema;
  enum?: JsonValue[];
  default?: JsonValue;
}

export interface ToolMetadata {
  name: string;
  description: string;
  capability: string;
  /** Static action, or "dynamic" when it depends on the arguments. */
  action: string;
  /** Static resource URI, or "dynamic" when it depends on the arguments. */
  resource: string;
  side_effect: boolean;
  parameters: JsonSchema;
}

// ----------------------------------------------------------------- approvals

export type ApprovalStatus = 'pending' | 'approved' | 'rejected' | 'expired' | 'consumed';

export interface ApprovalRequest extends Permission {
  id: string;
  fingerprint: string;
  agent_id: string;
  arguments: JsonObject;
  purpose: string | null;
  tool_name: string | null;
  risk_score: number | null;
  risk_level: RiskLevel | null;
  reason: string;
  status: ApprovalStatus;
  requested_at: ISODate;
  expires_at: ISODate;
  decided_by: string | null;
  decided_at: ISODate | null;
  decision_note: string | null;
  consumed_at: ISODate | null;
  effective_status?: ApprovalStatus;
}

// --------------------------------------------------------------------- audit

export type AuditEventType =
  | 'authorization'
  | 'execution'
  | 'delegation.created'
  | 'delegation.rejected'
  | 'delegation.revoked'
  | 'grant.created'
  | 'grant.revoked'
  | 'principal.registered'
  | 'principal.status'
  | 'policy.changed'
  | 'approval.requested'
  | 'approval.decided';

export const AUDIT_EVENT_TYPES: AuditEventType[] = [
  'authorization',
  'execution',
  'delegation.created',
  'delegation.rejected',
  'delegation.revoked',
  'grant.created',
  'grant.revoked',
  'principal.registered',
  'principal.status',
  'policy.changed',
  'approval.requested',
  'approval.decided',
];

export interface AuditEvent {
  id: string;
  sequence: number;
  timestamp: ISODate;
  event_type: AuditEventType;
  actor_id: string;
  on_behalf_of: string | null;
  delegation_chain: string[];
  principal_chain: string[];
  request_id: string | null;
  tool_name: string | null;
  capability: string | null;
  resource: string | null;
  action: string | null;
  purpose: string | null;
  decision: string | null;
  reason: string;
  policy_ids: string[];
  risk_score: number | null;
  risk_level: string | null;
  risk_factors: Record<string, number> | null;
  execution_status: string | null;
  details: JsonObject;
  prev_hash: string;
  hash: string;
}

export interface AuditPage {
  total: number;
  events: AuditEvent[];
}

export interface AuditQuery {
  actor_id?: string;
  event_type?: string;
  decision?: string;
  request_id?: string;
  limit?: number;
  offset?: number;
}

export interface AuditVerification {
  valid: boolean;
  events_checked: number;
  first_invalid_sequence: number | null;
  detail: string;
}

// ------------------------------------------------------------------ overview

export interface Overview {
  status: string;
  storage: string;
  agents: { total: number; active: number };
  users: number;
  resources: number;
  capabilities: number;
  policies: number;
  grants: number;
  delegations: { total: number; active: number };
  approvals_pending: number;
  decisions: Record<Decision, number>;
  audit_events: number;
  recent_decisions: AuditEvent[];
  neo4j: {
    enabled: boolean;
    last_sync: Record<string, number> | null;
    last_error: string | null;
  };
}

export interface HealthStatus {
  status: string;
  database: string;
  neo4j: string;
}

// --------------------------------------------------------------------- graph

export type GraphNodeType = 'User' | 'Agent' | 'Capability' | 'Resource' | 'AuthorityGrant' | 'Delegation';
export type GraphEdgeType =
  | 'OWNS'
  | 'HAS_CAPABILITY'
  | 'HOLDS'
  | 'TARGETS'
  | 'FROM'
  | 'DELEGATED_TO'
  | 'GRANTS'
  | 'EXECUTED'
  | 'BLOCKED';

export interface GraphNode {
  id: string;
  type: GraphNodeType;
  label: string;
  status?: string;
  classification?: string;
  resource?: string;
  depth?: number;
}

export interface GraphEdge {
  source: string;
  target: string;
  type: GraphEdgeType;
  status?: string;
  label?: string;
  event_id?: string;
}

export interface GraphSnapshot {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

export interface Neo4jChains {
  agent_id: string;
  chains: { root: string; principals: string[]; delegations: string[] }[];
  dependents: string[];
  latency_ms: { chains: number; blast_radius: number };
}

export interface GraphSyncResult {
  synced: boolean;
  counts: Record<string, number> | null;
  error: string | null;
}

// ---------------------------------------------------------------- agent runs

export type Planner = 'auto' | 'scripted' | 'gemini' | 'openai';

export interface ScriptStep {
  tool: string;
  arguments: JsonObject;
}

export interface AgentRunBody {
  task: string;
  purpose?: string | null;
  planner: Planner;
  max_steps?: number;
  script?: ScriptStep[] | null;
}

export interface AgentStep {
  index: number;
  tool: string;
  arguments: JsonObject;
  thought: string | null;
  status: ExecutionStatus | string;
  decision: Decision | string;
  reason: string;
  request_id: string;
  risk_score: number | null;
  risk_level: RiskLevel | null;
  approval_id: string | null;
  untrusted_context: boolean;
  output: JsonValue;
}

export interface AgentRun {
  run_id: string;
  agent_id: string;
  planner: string;
  task: string;
  purpose: string | null;
  steps: AgentStep[];
  final_answer: string | null;
  stopped_reason: string;
  error: string | null;
}

// ---------------------------------------------------------------- evaluation

export type ExpectedOutcome = 'execute' | 'escalate' | 'block';
export type CaseOutcome = 'executed' | 'escalated' | 'blocked';
export type EvaluatedSystem = 'trustgraph' | 'baseline_rbac';

export interface LatencyStats {
  mean: number;
  p50: number;
  p95: number;
  p99: number;
}

export interface EvaluationMetrics {
  cases: number;
  accuracy: number | null;
  false_allow_rate: number | null;
  false_deny_rate: number | null;
  true_allow_rate: number | null;
  true_deny_rate: number | null;
  unauthorised_action_prevention_rate: number | null;
  privilege_escalation_success_rate: number | null;
  unauthorised_delegation_prevention_rate: number | null;
  excessive_agency_prevention_rate: number | null;
  legitimate_task_completion: number | null;
  human_intervention_rate: number | null;
  audit_completeness: number | null;
  provenance_completeness: number | null;
  latency_ms: LatencyStats | null;
}

export interface CategoryScore {
  correct: number;
  accuracy: number | null;
}

export interface EvaluationCategory {
  id: string;
  name: string;
  cases: number;
  trustgraph: CategoryScore;
  baseline_rbac: CategoryScore;
}

export interface CaseSystemResult {
  outcome: CaseOutcome;
  decision: string | null;
  reason: string | null;
  latency_ms: number | null;
}

export interface EvaluationCase {
  id: string;
  category: string;
  description: string;
  expected: ExpectedOutcome;
  trustgraph: CaseSystemResult;
  baseline_rbac: CaseSystemResult;
}

export interface SensitivityRow {
  label: string;
  thresholds: RiskThresholds;
  accuracy: number | null;
  false_allow_rate: number | null;
  false_deny_rate: number | null;
  human_intervention_rate: number | null;
}

export interface EvaluationResult {
  run_id: string;
  generated_at: ISODate;
  repetitions: number;
  environment: {
    agents: number;
    users: number;
    resources: number;
    capabilities: number;
    policies: number;
    delegations: number;
  };
  systems: EvaluatedSystem[];
  summary: Record<EvaluatedSystem, EvaluationMetrics>;
  categories: EvaluationCategory[];
  cases: EvaluationCase[];
  sensitivity: SensitivityRow[];
  graph: {
    neo4j_available: boolean;
    chain_query_latency_ms: LatencyStats | null;
  };
}

// --------------------------------------------------------------------- admin

export interface ResetResult {
  reset_by: string;
  agent_api_keys: Record<string, string>;
}
