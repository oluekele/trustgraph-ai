import type { RiskAssessment, RiskThresholds } from '@/lib/types';
import { humanize } from '@/lib/format';
import { RiskBadge } from './badges';

const DEFAULT_THRESHOLDS: RiskThresholds = { medium: 35, high: 60, critical: 80 };

/** Horizontal risk gauge with the four bands and a marker at the score. */
export function RiskGauge({
  score,
  level,
  thresholds = DEFAULT_THRESHOLDS,
}: {
  score: number;
  level: string;
  thresholds?: RiskThresholds;
}) {
  const clamped = Math.max(0, Math.min(100, score));
  const bands = [
    { from: 0, to: thresholds.medium, cls: 'bg-allow/35 border-allow/50', label: 'low' },
    { from: thresholds.medium, to: thresholds.high, cls: 'bg-restrict/35 border-restrict/50', label: 'medium' },
    { from: thresholds.high, to: thresholds.critical, cls: 'bg-approval/35 border-approval/50', label: 'high' },
    { from: thresholds.critical, to: 100, cls: 'bg-deny/35 border-deny/50', label: 'critical' },
  ];
  return (
    <div>
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-3xl font-semibold tabular-nums">{score.toFixed(1)}</span>
        <RiskBadge score={score} level={level} />
      </div>
      <div
        className="relative mt-2 flex h-3 w-full overflow-visible"
        role="meter"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(clamped)}
        aria-label={`Risk score ${score.toFixed(1)} of 100, ${level}`}
      >
        {bands.map((band) => (
          <div
            key={band.label}
            className={`h-full border-y first:rounded-l-full first:border-l last:rounded-r-full last:border-r ${band.cls}`}
            style={{ width: `${band.to - band.from}%` }}
            title={`${band.label}: ${band.from}–${band.to}`}
          />
        ))}
        <div
          className="absolute -top-1 h-5 w-1 -translate-x-1/2 rounded-full bg-fg ring-2 ring-[var(--surface)]"
          style={{ left: `${clamped}%` }}
          aria-hidden
        />
      </div>
      <div className="mt-1 flex justify-between text-[10px] text-muted tabular-nums" aria-hidden>
        <span>0</span>
        <span>{thresholds.medium}</span>
        <span>{thresholds.high}</span>
        <span>{thresholds.critical}</span>
        <span>100</span>
      </div>
    </div>
  );
}

/** Factor values (0–100) and their weighted contributions to the score. */
export function RiskBreakdown({ risk }: { risk: RiskAssessment }) {
  const factorEntries = Object.entries(risk.factors) as [string, number][];
  const contributionKeys = Array.from(new Set([...factorEntries.map(([key]) => key), ...Object.keys(risk.contributions)]));
  const maxContribution = Math.max(1, ...Object.values(risk.contributions));
  return (
    <div className="flex flex-col gap-2">
      <table className="w-full text-[12px]">
        <caption className="sr-only">Risk factors and weighted contributions</caption>
        <thead className="text-[10.5px] text-muted uppercase">
          <tr>
            <th scope="col" className="pb-1 text-left font-semibold">Factor</th>
            <th scope="col" className="pb-1 text-right font-semibold">Value</th>
            <th scope="col" className="pb-1 pl-3 text-left font-semibold">Contribution</th>
          </tr>
        </thead>
        <tbody>
          {contributionKeys.map((key) => {
            const value = risk.factors[key as keyof typeof risk.factors];
            const contribution = risk.contributions[key] ?? 0;
            return (
              <tr key={key}>
                <th scope="row" className="py-1 pr-2 text-left font-normal text-fg-2">{humanize(key)}</th>
                <td className="py-1 text-right tabular-nums text-muted">{value === undefined ? '—' : value.toFixed(0)}</td>
                <td className="py-1 pl-3">
                  <div className="flex items-center gap-2">
                    <div className="h-2 flex-1 rounded-full bg-surface-3">
                      <div
                        className="h-2 rounded-full bg-[var(--series-1)]"
                        style={{ width: `${(contribution / maxContribution) * 100}%` }}
                      />
                    </div>
                    <span className="w-10 text-right tabular-nums">{contribution.toFixed(1)}</span>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {risk.notes.length ? (
        <ul className="list-disc pl-5 text-[12px] text-fg-2">
          {risk.notes.map((note) => (
            <li key={note}>{note}</li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
