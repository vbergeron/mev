import { fmtRatio, ratioLevel, type Explain } from '../lib/explain'
import { fmtInt, fmtMs, LEVEL_CHIP } from '../lib/format'

export function SummaryBar({ explain }: { explain: Explain }) {
  const t = explain.totals
  return (
    <div className="flex flex-wrap items-center gap-x-6 gap-y-2 border-b border-stone-200 bg-card px-5 py-3">
      <div className="flex items-center gap-2">
        <Tag className="bg-mongo-950 text-mongo-50">{explain.kind}</Tag>
        <Tag className={explain.engine === 'sbe' ? 'bg-mongo-100 text-mongo-800' : 'bg-stone-100 text-stone-700'}>
          {explain.engine === 'sbe' ? 'SBE' : 'classic'}
        </Tag>
        {explain.namespace && <span className="font-mono text-sm text-stone-700">{explain.namespace}</span>}
        {explain.serverVersion && <span className="text-xs text-stone-400">MongoDB {explain.serverVersion}</span>}
      </div>
      <Metric label="Time" value={fmtMs(t.timeMs)} />
      <Metric label="Returned" value={fmtInt(t.nReturned)} />
      <Metric label="Docs examined" value={fmtInt(t.docsExamined)} />
      <Metric label="Keys examined" value={fmtInt(t.keysExamined)} />
      <Ratio label="Docs ÷ returned" r={t.docsRatio} />
      <Ratio label="Keys ÷ returned" r={t.keysRatio} />
      {explain.rejectedPlans > 0 && <Metric label="Rejected plans" value={String(explain.rejectedPlans)} />}
    </div>
  )
}

function Tag({ className, children }: { className: string; children: React.ReactNode }) {
  return <span className={`rounded px-2 py-0.5 text-xs font-semibold uppercase tracking-wide ${className}`}>{children}</span>
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="leading-tight">
      <div className="text-[11px] text-stone-400">{label}</div>
      <div className="font-mono text-sm tabular-nums text-stone-900">{value}</div>
    </div>
  )
}

function Ratio({ label, r }: { label: string; r: number | undefined }) {
  const level = ratioLevel(r)
  return (
    <div className="leading-tight">
      <div className="text-[11px] text-stone-400">{label}</div>
      {level ? (
        <span className={`inline-block rounded px-1.5 font-mono text-sm tabular-nums ring-1 ${LEVEL_CHIP[level]}`}>{fmtRatio(r)}</span>
      ) : (
        <div className="font-mono text-sm text-stone-400">–</div>
      )}
    </div>
  )
}
