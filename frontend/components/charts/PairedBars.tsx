import { pct } from '@/lib/format';

export interface PairedDatum {
  label: string;
  note?: string;
  a: number | null;
  b: number | null;
}

export const SERIES = {
  a: { name: 'TrustGraph', color: 'var(--series-1)' },
  b: { name: 'Baseline RBAC', color: 'var(--series-2)' },
} as const;

export function SeriesLegend() {
  return (
    <div className="flex flex-wrap items-center gap-4 text-xs text-fg-2" aria-label="Legend">
      {(['a', 'b'] as const).map((key) => (
        <span key={key} className="inline-flex items-center gap-1.5">
          <span className="h-2.5 w-4 rounded-sm" style={{ background: SERIES[key].color }} aria-hidden />
          {SERIES[key].name}
        </span>
      ))}
    </div>
  );
}

function Bar({ value, color, series, label }: { value: number | null; color: string; series: string; label: string }) {
  const width = value === null ? 0 : Math.max(0, Math.min(1, value)) * 100;
  return (
    <div className="flex items-center gap-2" title={`${label} — ${series}: ${pct(value)}`}>
      <div className="h-3 flex-1 rounded-r bg-surface-3/60">
        {value === null ? null : (
          <div className="h-3 rounded-r-[4px]" style={{ width: `${width}%`, background: color, minWidth: value > 0 ? 2 : 0 }} />
        )}
      </div>
      <span className="w-14 text-right text-[11.5px] tabular-nums text-fg-2">{pct(value)}</span>
    </div>
  );
}

/**
 * Horizontal paired bars on a shared 0–100% axis (rates). Each row is a
 * metric; TrustGraph above, baseline below. A table fallback is exposed to
 * assistive technology via the caption-bearing table markup.
 */
export function PairedBars({ data, caption }: { data: PairedDatum[]; caption: string }) {
  return (
    <table className="w-full border-separate border-spacing-y-2 text-[12.5px]">
      <caption className="sr-only">{caption}</caption>
      <thead className="sr-only">
        <tr>
          <th scope="col">Metric</th>
          <th scope="col">{SERIES.a.name}</th>
          <th scope="col">{SERIES.b.name}</th>
        </tr>
      </thead>
      <tbody>
        {data.map((datum) => (
          <tr key={datum.label}>
            <th scope="row" className="w-[42%] pr-3 text-left align-middle font-normal text-fg-2">
              {datum.label}
              {datum.note ? <span className="block text-[10.5px] text-muted">{datum.note}</span> : null}
            </th>
            <td className="sr-only">{pct(datum.a)}</td>
            <td className="sr-only">{pct(datum.b)}</td>
            <td aria-hidden className="align-middle">
              <div className="flex flex-col gap-[2px]">
                <Bar value={datum.a} color={SERIES.a.color} series={SERIES.a.name} label={datum.label} />
                <Bar value={datum.b} color={SERIES.b.color} series={SERIES.b.name} label={datum.label} />
              </div>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
