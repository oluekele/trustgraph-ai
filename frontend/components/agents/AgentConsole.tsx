'use client';

import { Bot, Play, Plus, Sparkles, Trash2, TriangleAlert } from 'lucide-react';
import Link from 'next/link';
import { type FormEvent, useState } from 'react';
import { DecisionBadge, RiskBadge, StatusBadge } from '@/components/governance/badges';
import { Badge, Code } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card, CardBody, CardHeader } from '@/components/ui/Card';
import { Field, Input, Select, Textarea } from '@/components/ui/Field';
import { JsonView, Segmented } from '@/components/ui/Page';
import { Alert, MutationError } from '@/components/ui/States';
import { api } from '@/lib/api';
import { TOOL_EXAMPLES } from '@/lib/examples';
import { useMutation } from '@/lib/hooks';
import { parseJsonObject } from '@/lib/schema';
import type { AgentRun, Planner, ScriptStep, ToolMetadata } from '@/lib/types';

interface DraftStep {
  key: number;
  tool: string;
  args: string;
}

let nextKey = 1;

function TranscriptView({ run }: { run: AgentRun }) {
  return (
    <div className="flex flex-col gap-3" aria-live="polite">
      <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
        <Code>{run.run_id}</Code>
        <span>Planner {run.planner}</span>
        <StatusBadge status={run.stopped_reason === 'completed' ? 'executed' : run.stopped_reason} />
      </div>
      {run.error ? (
        <Alert tone="error" title="Planner error">
          {run.error}
        </Alert>
      ) : null}
      {run.steps.length === 0 ? <p className="text-xs text-muted">The planner proposed no tool calls.</p> : null}
      <ol className="flex flex-col gap-3">
        {run.steps.map((step) => (
          <li key={step.index} className="rounded-md border border-line bg-surface-2 p-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="flex size-6 items-center justify-center rounded-full bg-surface-3 text-[11px] font-semibold tabular-nums">
                {step.index + 1}
              </span>
              <Code>{step.tool}</Code>
              <DecisionBadge decision={step.decision} />
              <StatusBadge status={step.status} />
              <RiskBadge score={step.risk_score} level={step.risk_level} />
              {step.untrusted_context ? (
                <Badge tone="restrict" icon={<TriangleAlert className="size-3" aria-hidden />} title="The session had already ingested untrusted content when this call was made.">
                  Untrusted context
                </Badge>
              ) : null}
            </div>
            {step.thought ? <p className="mt-2 text-xs text-fg-2 italic">“{step.thought}”</p> : null}
            <p className="mt-2 text-[13px]">{step.reason}</p>
            {step.approval_id ? (
              <Link className="mt-1 inline-block text-xs font-medium text-approval hover:underline" href={`/approvals?id=${encodeURIComponent(step.approval_id)}`}>
                Approval {step.approval_id} →
              </Link>
            ) : null}
            <details className="mt-2">
              <summary className="cursor-pointer text-xs text-muted">Arguments{step.output !== null ? ' & output' : ''}</summary>
              <div className="mt-2 grid gap-2 md:grid-cols-2">
                <JsonView value={step.arguments} maxHeight={200} />
                {step.output !== null ? <JsonView value={step.output} maxHeight={200} /> : null}
              </div>
            </details>
          </li>
        ))}
      </ol>
      {run.final_answer ? (
        <div className="rounded-md border border-accent/40 bg-accent-soft p-3">
          <p className="mb-1 flex items-center gap-1.5 text-xs font-semibold text-accent">
            <Sparkles className="size-3.5" aria-hidden /> Final answer
          </p>
          <p className="text-[13px] whitespace-pre-wrap">{run.final_answer}</p>
        </div>
      ) : null}
    </div>
  );
}

/** Run a governed agent task and show the step-by-step transcript. */
export function AgentConsole({ agentId, tools, canRun }: { agentId: string; tools: ToolMetadata[]; canRun: boolean }) {
  const [task, setTask] = useState('');
  const [purpose, setPurpose] = useState('');
  const [planner, setPlanner] = useState<Planner>('auto');
  const [maxSteps, setMaxSteps] = useState(6);
  const [steps, setSteps] = useState<DraftStep[]>([{ key: 0, tool: 'calculator', args: JSON.stringify(TOOL_EXAMPLES.calculator) }]);
  const [formError, setFormError] = useState<string | null>(null);
  const [run, setRun] = useState<AgentRun | null>(null);
  const mutation = useMutation(api.runAgent);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setFormError(null);
    let script: ScriptStep[] | null = null;
    if (planner === 'scripted') {
      script = [];
      for (const [index, step] of steps.entries()) {
        const parsed = parseJsonObject(step.args);
        if (parsed.error || !parsed.value) {
          setFormError(`Step ${index + 1}: ${parsed.error}`);
          return;
        }
        script.push({ tool: step.tool, arguments: parsed.value });
      }
      if (!script.length) {
        setFormError('The scripted planner needs at least one step.');
        return;
      }
    }
    const result = await mutation.run(agentId, {
      task: task.trim(),
      purpose: purpose.trim() || null,
      planner,
      max_steps: maxSteps,
      script,
    });
    if (result) setRun(result);
  }

  const updateStep = (key: number, patch: Partial<DraftStep>) =>
    setSteps((current) => current.map((step) => (step.key === key ? { ...step, ...patch } : step)));

  return (
    <Card>
      <CardHeader
        title="Agent console"
        description="Every tool call the planner proposes is submitted to the TrustGraph runtime enforcer."
        icon={<Bot className="size-4" />}
      />
      <CardBody className="grid gap-5 xl:grid-cols-[minmax(0,420px)_1fr]">
        <form onSubmit={onSubmit} className="flex flex-col gap-3">
          {!canRun ? <Alert tone="info">Running agents requires the operator role.</Alert> : null}
          <Field label="Task" required>
            {(id) => (
              <Textarea id={id} required value={task} disabled={!canRun} onChange={(event) => setTask(event.target.value)} placeholder="e.g. Summarise the research report and email the team." />
            )}
          </Field>
          <Field label="Purpose" hint="Declared purpose; policies may require one.">
            {(id, describedBy) => (
              <Input id={id} aria-describedby={describedBy} value={purpose} disabled={!canRun} onChange={(event) => setPurpose(event.target.value)} />
            )}
          </Field>
          <div className="flex flex-wrap items-end gap-3">
            <div className="flex flex-col gap-1">
              <span className="text-xs font-medium text-fg-2">Planner</span>
              <Segmented<Planner>
                label="Planner"
                value={planner}
                onChange={setPlanner}
                options={[
                  { value: 'auto', label: 'Auto' },
                  { value: 'scripted', label: 'Scripted' },
                  { value: 'gemini', label: 'Gemini' },
                  { value: 'openai', label: 'OpenAI' },
                ]}
              />
            </div>
            <Field label="Max steps" className="w-24">
              {(id) => (
                <Input id={id} type="number" min={1} max={20} value={maxSteps} disabled={!canRun} onChange={(event) => setMaxSteps(Number(event.target.value) || 1)} />
              )}
            </Field>
          </div>
          {planner === 'scripted' ? (
            <fieldset className="flex flex-col gap-2 rounded-md border border-line p-3">
              <legend className="px-1 text-xs font-medium text-fg-2">Scripted steps</legend>
              {steps.map((step, index) => (
                <div key={step.key} className="flex flex-col gap-1.5 rounded border border-line bg-surface-2 p-2">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold tabular-nums text-muted">{index + 1}.</span>
                    <Select
                      aria-label={`Step ${index + 1} tool`}
                      value={step.tool}
                      onChange={(event) =>
                        updateStep(step.key, {
                          tool: event.target.value,
                          args: JSON.stringify(TOOL_EXAMPLES[event.target.value] ?? {}),
                        })
                      }
                    >
                      {tools.map((tool) => (
                        <option key={tool.name} value={tool.name}>
                          {tool.name}
                        </option>
                      ))}
                    </Select>
                    <Button
                      size="sm"
                      variant="ghost"
                      aria-label={`Remove step ${index + 1}`}
                      onClick={() => setSteps((current) => current.filter((item) => item.key !== step.key))}
                      icon={<Trash2 className="size-3.5" />}
                    />
                  </div>
                  <Textarea
                    aria-label={`Step ${index + 1} arguments (JSON)`}
                    className="min-h-[60px] font-mono text-xs"
                    value={step.args}
                    onChange={(event) => updateStep(step.key, { args: event.target.value })}
                  />
                </div>
              ))}
              <Button
                size="sm"
                icon={<Plus className="size-3.5" />}
                onClick={() =>
                  setSteps((current) => [...current, { key: nextKey++, tool: 'web_search', args: JSON.stringify(TOOL_EXAMPLES.web_search) }])
                }
              >
                Add step
              </Button>
            </fieldset>
          ) : (
            <p className="text-[11px] text-muted">
              Auto uses a configured LLM provider if available, otherwise the local instruction-following planner.
            </p>
          )}
          {formError ? <Alert tone="error">{formError}</Alert> : null}
          <MutationError error={mutation.error} />
          <Button type="submit" variant="primary" disabled={!canRun || !task.trim()} loading={mutation.pending} icon={<Play className="size-4" />}>
            Run task
          </Button>
        </form>
        <div className="min-w-0">
          {run ? (
            <TranscriptView run={run} />
          ) : (
            <div className="flex h-full min-h-40 items-center justify-center rounded-md border border-dashed border-line text-xs text-muted">
              {mutation.pending ? 'Running… governed steps will appear here.' : 'The transcript will appear here.'}
            </div>
          )}
        </div>
      </CardBody>
    </Card>
  );
}
