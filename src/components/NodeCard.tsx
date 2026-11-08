import { fmtRatio, ratioLevel, type PlanNode } from '../lib/explain'
import { fmtInt, fmtMs, LEVEL_BORDER, LEVEL_CHIP, LEVEL_TEXT, worst } from '../lib/format'
import { NODE_H, NODE_W } from '../lib/layout'

interface Props {
  node: PlanNode
  x: number
  y: number
  totalTime: number
  hottest: boolean
  selected: boolean
  onSelect: (id: string) => void
}

export function NodeCard({ node, x, y, totalTime, hottest, selected, onSelect }: Props) {
  const level = worst(node.warnings.map((w) => w.level))
  const examined = node.docsExamined ?? node.keysExamined
  const examinedUnit = node.docsExamined !== undefined ? 'docs' : 'keys'
  const rl = ratioLevel(node.ratio)
  const share = totalTime > 0 && node.timeExcl !== undefined ? node.timeExcl / totalTime : 0

  return (
    <button
      type="button"
      data-node={node.id}
      onClick={(e) => { e.stopPropagation(); onSelect(node.id) }}
      onPointerDown={(e) => e.stopPropagation()}
      style={{ left: x, top: y, width: NODE_W, height: NODE_H }}
      className={[
        'absolute flex flex-col overflow-hidden rounded-lg border bg-card px-3 py-2 text-left shadow-sm transition',
        'hover:shadow-md focus:outline-none',
        level ? LEVEL_BORDER[level] : 'border-stone-200',
        selected ? 'ring-2 ring-mongo-500 ring-offset-1' : '',
      ].join(' ')}
    >
      <div className="flex items-center gap-1.5">
        <span className="min-w-0 truncate font-mono text-[13px] font-semibold text-stone-900" title={node.stage}>{node.stage}</span>
        {hottest && (
          <span className="ml-auto shrink-0 rounded bg-mongo-800 px-1.5 py-px text-[10px] font-semibold uppercase tracking-wide text-mongo-50">
            slowest
          </span>
        )}
      </div>
      <div className="flex h-5 items-center gap-1">
        <span className="min-w-0 flex-1 truncate text-xs text-stone-500" title={node.subtitle}>{node.subtitle ?? '\u00a0'}</span>
        {node.warnings
          .filter((w) => w.level !== 'ok')
          .slice(0, 3)
          .map((w) => (
            <span key={w.label} title={w.detail} className={`shrink-0 rounded px-1.5 py-px text-[10px] font-medium ring-1 ${LEVEL_CHIP[w.level]}`}>
              {shortLabel(w.label)}
            </span>
          ))}
      </div>

      <dl className="mt-1.5 grid grid-cols-3 gap-x-2 text-[11px] leading-tight">
        <dt className="text-stone-400">returned</dt>
        <dt className="text-stone-400">examined</dt>
        <dt className="text-stone-400">ratio</dt>
        <dd className="font-mono tabular-nums text-stone-800">{fmtInt(node.nReturned)}</dd>
        <dd className="font-mono tabular-nums text-stone-800" title={examined !== undefined ? examinedUnit : undefined}>
          {examined !== undefined ? fmtInt(examined) : '–'}
          {examined !== undefined && <span className="ml-0.5 text-stone-400">{examinedUnit === 'docs' ? 'd' : 'k'}</span>}
        </dd>
        <dd className={`font-mono tabular-nums font-semibold ${rl ? LEVEL_TEXT[rl] : 'text-stone-400'}`}>
          {fmtRatio(node.ratio)}
        </dd>
      </dl>

      <div className="mt-auto">
        <div className="flex items-baseline justify-between text-[11px]">
          <span className="font-mono tabular-nums text-stone-800">{fmtMs(node.timeExcl)}</span>
          <span className="text-stone-400">
            {node.timeIncl !== undefined ? `incl. ${fmtMs(node.timeIncl)}` : 'no timing'}
          </span>
        </div>
        <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-stone-100">
          <div
            className={`h-full rounded-full ${hottest ? 'bg-mongo-700' : 'bg-mongo-300'}`}
            style={{ width: `${Math.max(share > 0 ? 3 : 0, share * 100)}%` }}
          />
        </div>
      </div>
    </button>
  )
}

function shortLabel(label: string): string {
  switch (label) {
    case 'Collection scan': return 'COLLSCAN'
    case 'In-memory sort': return 'mem sort'
    case 'Spilled to disk': return 'disk'
    case 'Examined ≫ returned': return 'ratio'
    case 'Deep skip': return 'skip'
    case 'Collection scans in $lookup': return 'COLLSCAN'
    default: return label
  }
}
