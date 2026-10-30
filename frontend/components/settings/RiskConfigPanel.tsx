'use client';

import { Gauge } from 'lucide-react';
import { DecisionBadge, riskTone } from '@/components/governance/badges';
import { Badge } from '@/components/ui/Badge';
import { Card, CardBody, CardHeader } from '@/components/ui/Card';
import { ErrorState, LoadingBlock } from '@/components/ui/States';
import { api } from '@/lib/api';
import { humanize } from '@/lib/format';
import { useAsync } from '@/lib/hooks';
import type { RiskLevel } from '@/lib/types';

function BarRow({ label, value, max, suffix = '' }: { label: string; value: number; max: number; suffix?: string }) {
  return (
    <tr>
      <th scope="row" className="py-1 pr-3 text-left font-normal text-fg-2">{label}</th>
      <td className="w-full py-1">
        <div className="h-2 rounded-full bg-surface-3">
          <div className="h-2 rounded-full bg-[var(--series-1)]" style={{ width: `${(value / max) * 100}%` }} />
        </div>
      </td>
      <td className="py-1 pl-3 text-right tabular-nums">{value}{suffix}</td>
    </tr>
  );
}

export function RiskConfigPanel() {
  const config = useAsync(() => api.riskConfig(), []);
  if (config.error) return <Card><ErrorState error={config.error} onRetry={config.reload} /></Card>;
  if (!config.data) return <Card><LoadingBlock rows={6} /></Card>;
  const { weights, thresholds, action_sensitivity, delegation_hop_risk, decision_mapping, behaviour_window_minutes } = config.data;
  const levels: RiskLevel[] = ['low', 'medium', 'high', 'critical'];
  const bands: Record<RiskLevel, string> = {
    low: `0 – ${thresholds.medium}`,
    medium: `${thresholds.medium} – ${thresholds.high}`,
    high: `${thresholds.high} – ${thresholds.critical}`,
    critical: `${thresholds.critical} – 100`,
  };
  return (
    <Card>
      <CardHeader
        title="Risk model"
        description={`Experimental parameters of the runtime risk engine (read-only). Behaviour window: ${behaviour_window_minutes} min.`}
        icon={<Gauge className="size-4" />}
      />
      <CardBody className="grid gap-6 lg:grid-cols-2">
        <section>
          <h3 className="mb-2 text-xs font-semibold text-fg-2">Factor weights</h3>
          <table className="w-full text-[12.5px]">
            <caption className="sr-only">Risk factor weights</caption>
            <tbody>
              {Object.entries(weights).map(([key, value]) => (
                <BarRow key={key} label={humanize(key)} value={value} max={Math.max(...Object.values(weights), 0.01)} />
              ))}
            </tbody>
          </table>
        </section>
        <section>
          <h3 className="mb-2 text-xs font-semibold text-fg-2">Thresholds & decision mapping</h3>
          <table className="w-full text-[12.5px]">
            <caption className="sr-only">Risk bands and decisions</caption>
            <thead className="text-[10.5px] text-muted uppercase">
              <tr>
                <th scope="col" className="pb-1 text-left">Level</th>
                <th scope="col" className="pb-1 text-left">Score band</th>
                <th scope="col" className="pb-1 text-left">Risk-only decision</th>
              </tr>
            </thead>
            <tbody>
              {levels.map((level) => (
                <tr key={level}>
                  <td className="py-1"><Badge tone={riskTone(level)}>{level}</Badge></td>
                  <td className="py-1 tabular-nums">{bands[level]}</td>
                  <td className="py-1"><DecisionBadge decision={decision_mapping[level]} /></td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="mt-2 text-[11px] text-muted">The final decision is the most restrictive of the policy outcome and the risk-only decision.</p>
        </section>
        <section>
          <h3 className="mb-2 text-xs font-semibold text-fg-2">Action sensitivity (0–100)</h3>
          <table className="w-full text-[12.5px]">
            <caption className="sr-only">Action sensitivity</caption>
            <tbody>
              {Object.entries(action_sensitivity)
                .sort((a, b) => a[1] - b[1])
                .map(([action, value]) => (
                  <BarRow key={action} label={action} value={value} max={100} />
                ))}
            </tbody>
          </table>
        </section>
        <section>
          <h3 className="mb-2 text-xs font-semibold text-fg-2">Delegation hop risk (0–100)</h3>
          <table className="w-full text-[12.5px]">
            <caption className="sr-only">Delegation hop risk</caption>
            <tbody>
              {Object.entries(delegation_hop_risk).map(([hops, value]) => (
                <BarRow key={hops} label={`${hops} hop${hops === '1' ? '' : 's'}`} value={value} max={100} />
              ))}
            </tbody>
          </table>
        </section>
      </CardBody>
    </Card>
  );
}
