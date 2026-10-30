'use client';

import { Braces, Play, ShieldQuestion, SquareTerminal, Wand2 } from 'lucide-react';
import { type FormEvent, useEffect, useMemo, useState } from 'react';
import { DecisionPanel, ExecutionResultView } from '@/components/governance/DecisionPanel';
import { SchemaForm } from '@/components/playground/SchemaForm';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card, CardBody, CardHeader } from '@/components/ui/Card';
import { Checkbox, Field, Input, Select, Textarea } from '@/components/ui/Field';
import { PageHeader, Segmented } from '@/components/ui/Page';
import { Alert, ErrorState, LoadingBlock, MutationError } from '@/components/ui/States';
import { api } from '@/lib/api';
import { PURPOSE_EXAMPLES, TOOL_EXAMPLES } from '@/lib/examples';
import { prettyJson } from '@/lib/format';
import { useAsync, useMutation } from '@/lib/hooks';
import { type FieldValues, initialValues, parseJsonObject, toArguments } from '@/lib/schema';
import { useSession } from '@/lib/session';
import { resolvePermission } from '@/lib/toolResolve';
import type { AuthorizationDecision, ExecutionResult, JsonObject, ToolMetadata } from '@/lib/types';

type Mode = 'tool' | 'raw';
type Outcome = { kind: 'authorize'; decision: AuthorizationDecision } | { kind: 'execute'; result: ExecutionResult };

function exampleValues(tool: ToolMetadata): FieldValues {
  const values = initialValues(tool.parameters);
  for (const [key, value] of Object.entries(TOOL_EXAMPLES[tool.name] ?? {})) {
    values[key] = typeof value === 'string' ? value : JSON.stringify(value);
  }
  return values;
}

export default function PlaygroundPage() {
  const { can } = useSession();
  const allowed = can('runtime.simulate');
  const agents = useAsync(() => api.principals('agent'), []);
  const tools = useAsync(() => api.tools(), []);
  const catalogue = useAsync(() => Promise.all([api.capabilities(), api.resources()]), []);
  const riskConfig = useAsync(() => api.riskConfig(), []);

  const [agentId, setAgentId] = useState('agent-research');
  const [mode, setMode] = useState<Mode>('tool');
  const [toolName, setToolName] = useState('file_reader');
  const [rawArgs, setRawArgs] = useState(false);
  const [values, setValues] = useState<FieldValues>({});
  const [argsText, setArgsText] = useState('{}');
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [purpose, setPurpose] = useState('');
  const [untrusted, setUntrusted] = useState(false);
  const [capability, setCapability] = useState('');
  const [resource, setResource] = useState('');
  const [action, setAction] = useState('');
  const [formError, setFormError] = useState<string | null>(null);
  const [outcome, setOutcome] = useState<Outcome | null>(null);

  const tool = useMemo(() => tools.data?.find((item) => item.name === toolName), [tools.data, toolName]);

  useEffect(() => {
    if (!tool) return;
    const initial = exampleValues(tool);
    setValues(initial);
    setArgsText(prettyJson(TOOL_EXAMPLES[tool.name] ?? {}));
    setFieldErrors({});
  }, [tool]);

  const currentArgs = useMemo((): { value?: JsonObject; error?: string; fieldErrors?: Record<string, string> } => {
    if (mode === 'raw' || rawArgs || !tool) return parseJsonObject(argsText);
    const { value, errors } = toArguments(tool.parameters, values);
    return Object.keys(errors).length ? { error: 'Fix the highlighted arguments.', fieldErrors: errors } : { value };
  }, [mode, rawArgs, tool, argsText, values]);

  // Keep the derived permission in sync with the tool + arguments (still editable).
  useEffect(() => {
    if (mode !== 'tool' || !tool) return;
    const permission = resolvePermission(tool, currentArgs.value ?? {});
    setCapability(permission.capability);
    setResource(permission.resource);
    setAction(permission.action);
  }, [mode, tool, currentArgs.value]);

  const authorize = useMutation(api.authorize);
  const execute = useMutation(api.execute);
  const pending = authorize.pending || execute.pending;

  function readArgs(): JsonObject | null {
    setFieldErrors(currentArgs.fieldErrors ?? {});
    if (!currentArgs.value) {
      setFormError(currentArgs.error ?? 'Invalid arguments.');
      return null;
    }
    setFormError(null);
    return currentArgs.value;
  }

  const context = () => ({ purpose: purpose.trim() || null, untrusted_input: untrusted });

  async function onAuthorize(event?: FormEvent) {
    event?.preventDefault();
    const args = readArgs();
    if (!args) return;
    if (!capability || !resource || !action) {
      setFormError('Capability, resource and action are required for an authorisation request.');
      return;
    }
    execute.reset();
    const decision = await authorize.run({ agent_id: agentId, capability, resource, action, arguments: args, context: context() });
    if (decision) setOutcome({ kind: 'authorize', decision });
  }

  async function onExecute() {
    const args = readArgs();
    if (!args || !tool) return;
    authorize.reset();
    const result = await execute.run({ agent_id: agentId, tool: tool.name, arguments: args, context: context() });
    if (result) setOutcome({ kind: 'execute', result });
  }

  const loadError = agents.error ?? tools.error;
  const [capabilities, resources] = catalogue.data ?? [[], []];
  const resourceActions = resources.find((item) => item.id === resource)?.allowed_actions ?? [];

  return (
    <>
      <PageHeader
        title="Governance playground"
        icon={<SquareTerminal className="size-5" />}
        description="Simulate an agent request. “Authorize only” asks the policy decision point; “Execute” runs the full governed tool call through the runtime enforcer."
      />
      {!allowed ? (
        <Alert tone="info" className="mb-4" title="Read-only">
          Simulations are recorded in the audit log and require the operator role.
        </Alert>
      ) : null}
      {loadError ? (
        <Card>
          <ErrorState error={loadError} onRetry={() => { agents.reload(); tools.reload(); }} />
        </Card>
      ) : !agents.data || !tools.data ? (
        <LoadingBlock rows={8} />
      ) : (
        <div className="grid gap-5 2xl:grid-cols-[minmax(0,460px)_1fr] xl:grid-cols-[minmax(0,420px)_1fr]">
          <Card className="self-start">
            <CardHeader title="Request" />
            <CardBody>
              <form onSubmit={onAuthorize} className="flex flex-col gap-4">
                <Field label="Agent" required>
                  {(id) => (
                    <Select id={id} value={agentId} onChange={(event) => setAgentId(event.target.value)}>
                      {(agents.data ?? []).map((agent) => (
                        <option key={agent.id} value={agent.id}>
                          {agent.id} — {agent.name}
                          {agent.status !== 'active' ? ` (${agent.status})` : ''}
                        </option>
                      ))}
                    </Select>
                  )}
                </Field>
                <Segmented<Mode>
                  label="Request mode"
                  value={mode}
                  onChange={setMode}
                  options={[
                    { value: 'tool', label: 'Tool call' },
                    { value: 'raw', label: 'Raw capability / resource / action' },
                  ]}
                />
                {mode === 'tool' ? (
                  <>
                    <Field label="Tool" required hint={tool?.description}>
                      {(id, describedBy) => (
                        <Select id={id} aria-describedby={describedBy} value={toolName} onChange={(event) => setToolName(event.target.value)}>
                          {(tools.data ?? []).map((item) => (
                            <option key={item.name} value={item.name}>
                              {item.name}
                              {item.side_effect ? ' (side effect)' : ''}
                            </option>
                          ))}
                        </Select>
                      )}
                    </Field>
                    {tool ? (
                      <div className="flex flex-col gap-2">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-semibold text-fg-2">Arguments</span>
                          <div className="flex gap-1">
                            <Button size="sm" variant="ghost" icon={<Wand2 className="size-3.5" />} onClick={() => { setValues(exampleValues(tool)); setArgsText(prettyJson(TOOL_EXAMPLES[tool.name] ?? {})); }}>
                              Example
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              aria-pressed={rawArgs}
                              icon={<Braces className="size-3.5" />}
                              onClick={() => {
                                if (!rawArgs && currentArgs.value) setArgsText(prettyJson(currentArgs.value));
                                setRawArgs((value) => !value);
                              }}
                            >
                              {rawArgs ? 'Form' : 'Raw JSON'}
                            </Button>
                          </div>
                        </div>
                        {rawArgs ? (
                          <Textarea aria-label="Arguments (JSON)" className="min-h-[140px] font-mono text-xs" value={argsText} onChange={(event) => setArgsText(event.target.value)} />
                        ) : (
                          <SchemaForm schema={tool.parameters} values={values} errors={fieldErrors} onChange={setValues} />
                        )}
                      </div>
                    ) : null}
                  </>
                ) : (
                  <Field label="Arguments (JSON)" hint="Bound into the approval fingerprint.">
                    {(id, describedBy) => (
                      <Textarea id={id} aria-describedby={describedBy} className="min-h-[90px] font-mono text-xs" value={argsText} onChange={(event) => setArgsText(event.target.value)} />
                    )}
                  </Field>
                )}

                <fieldset className="grid gap-3 rounded-md border border-line p-3 sm:grid-cols-[1fr_1fr]">
                  <legend className="px-1 text-xs font-semibold text-fg-2">
                    {mode === 'tool' ? 'Resolved permission (used by “Authorize only”)' : 'Permission'}
                  </legend>
                  <Field label="Capability">
                    {(id) =>
                      mode === 'raw' ? (
                        <Select id={id} value={capability} onChange={(event) => setCapability(event.target.value)}>
                          <option value="">Select…</option>
                          {capabilities.map((item) => (
                            <option key={item.name} value={item.name}>{item.name}</option>
                          ))}
                        </Select>
                      ) : (
                        <Input id={id} value={capability} onChange={(event) => setCapability(event.target.value)} className="font-mono text-xs" />
                      )
                    }
                  </Field>
                  <Field label="Resource" className="sm:col-span-2 sm:row-start-2">
                    {(id) =>
                      mode === 'raw' ? (
                        <Select id={id} value={resource} onChange={(event) => setResource(event.target.value)}>
                          <option value="">Select…</option>
                          {resources.map((item) => (
                            <option key={item.id} value={item.id}>{item.id}</option>
                          ))}
                        </Select>
                      ) : (
                        <Input id={id} value={resource} onChange={(event) => setResource(event.target.value)} className="font-mono text-xs" />
                      )
                    }
                  </Field>
                  <Field label="Action">
                    {(id) =>
                      mode === 'raw' && resourceActions.length ? (
                        <Select id={id} value={action} onChange={(event) => setAction(event.target.value)}>
                          <option value="">Select…</option>
                          {resourceActions.map((item) => (
                            <option key={item} value={item}>{item}</option>
                          ))}
                        </Select>
                      ) : (
                        <Input id={id} value={action} onChange={(event) => setAction(event.target.value)} className="font-mono text-xs" />
                      )
                    }
                  </Field>
                </fieldset>

                <Field label="Purpose" hint="Some policies require a declared purpose.">
                  {(id, describedBy) => (
                    <>
                      <Input id={id} aria-describedby={describedBy} list="purpose-examples" value={purpose} onChange={(event) => setPurpose(event.target.value)} />
                      <datalist id="purpose-examples">
                        {PURPOSE_EXAMPLES.map((example) => (
                          <option key={example} value={example} />
                        ))}
                      </datalist>
                    </>
                  )}
                </Field>
                <Checkbox
                  label="Untrusted input in context"
                  description="The agent has ingested content it does not control (web pages, files) — raises context risk (prompt-injection precondition)."
                  checked={untrusted}
                  onChange={(event) => setUntrusted(event.target.checked)}
                />
                {formError ? <Alert tone="error">{formError}</Alert> : null}
                <MutationError error={authorize.error ?? execute.error} />
                <div className="flex flex-wrap gap-2">
                  <Button type="submit" disabled={!allowed} loading={authorize.pending} icon={<ShieldQuestion className="size-4" />}>
                    Authorize only
                  </Button>
                  {mode === 'tool' ? (
                    <Button variant="primary" disabled={!allowed || pending} loading={execute.pending} onClick={onExecute} icon={<Play className="size-4" />}>
                      Execute
                    </Button>
                  ) : null}
                </div>
              </form>
            </CardBody>
          </Card>

          <div className="min-w-0">
            {outcome ? (
              <div className="flex flex-col gap-2">
                <Badge tone="neutral" className="self-start">
                  {outcome.kind === 'authorize' ? 'Authorisation decision (no execution)' : 'Governed execution'}
                </Badge>
                {outcome.kind === 'authorize' ? (
                  <DecisionPanel decision={outcome.decision} thresholds={riskConfig.data?.thresholds} />
                ) : (
                  <ExecutionResultView result={outcome.result} thresholds={riskConfig.data?.thresholds} />
                )}
              </div>
            ) : (
              <Card className="flex min-h-72 items-center justify-center border-dashed p-8 text-center text-[13px] text-muted">
                {pending ? 'Evaluating…' : 'Submit a request to see the decision, risk breakdown, authority path and full trace.'}
              </Card>
            )}
          </div>
        </div>
      )}
    </>
  );
}
