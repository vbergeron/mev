import { fmtRatio, ratioLevel, type PlanNode } from '../lib/explain'
import type { Json } from '../lib/parse'
import { fmtInt, fmtMs, LEVEL_CHIP, LEVEL_TEXT } from '../lib/format'

export function DetailPanel({ node, onClose }: { node: PlanNode; onClose: () => void }) {
  const rl = ratioLevel(node.ratio)
  return (
    <aside className="flex h-full w-[380px] shrink-0 flex-col border-l border-stone-200 bg-card">
      <header className="flex items-start gap-2 border-b border-stone-200 px-4 py-3">
        <div className="min-w-0">
          <div className="font-mono text-base font-semibold text-stone-900">{node.stage}</div>
          {node.subtitle && <div className="truncate text-xs text-stone-500">{node.subtitle}</div>}
        </div>
        <button onClick={onClose} className="ml-auto rounded px-2 text-lg leading-none text-stone-400 hover:bg-stone-100 hover:text-stone-700" title="Close">
          ×
        </button>
      </header>

      <div className="flex-1 space-y-5 overflow-y-auto px-4 py-4 text-sm">
        {node.warnings.length > 0 && (
          <section className="space-y-2">
            {node.warnings.map((w) => (
              <div key={w.label} className={`rounded-md px-3 py-2 ring-1 ${LEVEL_CHIP[w.level]}`}>
                <div className="font-medium">{w.label}</div>
                <div className="text-xs opacity-90">{w.detail}</div>
              </div>
            ))}
          </section>
        )}

        <section>
          <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-stone-400">Statistics</h3>
          <table className="w-full text-[13px]">
            <tbody className="[&_td]:py-0.5 [&_td:last-child]:text-right [&_td:last-child]:font-mono [&_td:last-child]:tabular-nums">
              <tr><td className="text-stone-500">Returned</td><td>{fmtInt(node.nReturned)} {node.nReturned !== undefined && <span className="text-stone-400">{node.unit}</span>}</td></tr>
              <tr><td className="text-stone-500">Docs examined</td><td>{fmtInt(node.docsExamined)}</td></tr>
              <tr><td className="text-stone-500">Keys examined</td><td>{fmtInt(node.keysExamined)}</td></tr>
              <tr><td className="text-stone-500">Examined ÷ returned</td><td className={rl ? LEVEL_TEXT[rl] : ''}>{fmtRatio(node.ratio)}</td></tr>
              <tr><td className="text-stone-500">Time (exclusive)</td><td>{fmtMs(node.timeExcl)}</td></tr>
              <tr><td className="text-stone-500">Time (inclusive)</td><td>{fmtMs(node.timeIncl)}</td></tr>
            </tbody>
          </table>
          <p className="mt-1.5 text-[11px] text-stone-400">
            Times are MongoDB's millisecond estimates. Inclusive time contains the stages feeding this one.
          </p>
        </section>

        {node.details.length > 0 && (
          <section>
            <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-stone-400">Details</h3>
            <dl className="space-y-2">
              {node.details.map((d) => (
                <div key={d.label}>
                  <dt className="text-xs text-stone-500">{d.label}</dt>
                  <dd><Value v={d.value} /></dd>
                </div>
              ))}
            </dl>
          </section>
        )}

        {node.sbeStages && node.sbeStages.length > 0 && (
          <section>
            <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-stone-400">Slot-based stages</h3>
            <table className="w-full font-mono text-xs">
              <thead className="text-left text-stone-400">
                <tr><th className="font-normal">stage</th><th className="text-right font-normal">returned</th><th className="text-right font-normal">ms</th></tr>
              </thead>
              <tbody>
                {node.sbeStages.map((s, i) => (
                  <tr key={i}>
                    <td>{String(s.stage)}</td>
                    <td className="text-right tabular-nums">{fmtInt(typeof s.nReturned === 'number' ? s.nReturned : undefined)}</td>
                    <td className="text-right tabular-nums">{typeof s.executionTimeMillisEstimate === 'number' ? s.executionTimeMillisEstimate : '–'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        )}

        <section>
          <details>
            <summary className="cursor-pointer text-xs font-semibold uppercase tracking-wide text-stone-400">Raw stage</summary>
            <pre className="mt-2 overflow-x-auto rounded bg-stone-50 p-2 font-mono text-[11px] leading-snug text-stone-700">{JSON.stringify(node.raw, null, 2)}</pre>
          </details>
        </section>
      </div>
    </aside>
  )
}

function Value({ v }: { v: Json }) {
  if (v !== null && typeof v === 'object') {
    return <pre className="overflow-x-auto rounded bg-stone-50 px-2 py-1 font-mono text-[11px] leading-snug text-stone-700">{JSON.stringify(v, null, 2)}</pre>
  }
  return <span className="font-mono text-[13px] text-stone-800">{typeof v === 'number' ? fmtInt(v) : String(v)}</span>
}
