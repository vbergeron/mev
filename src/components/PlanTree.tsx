import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { flatten, type PlanNode } from '../lib/explain'
import { fmtCompact, fmtInt } from '../lib/format'
import { edgeWidth, layoutTree, NODE_H, NODE_W } from '../lib/layout'
import { NodeCard } from './NodeCard'

interface Props {
  root: PlanNode
  totalTime: number
  selectedId?: string
  onSelect: (id: string | undefined) => void
}

const PAD = 48

export function PlanTree({ root, totalTime, selectedId, onSelect }: Props) {
  const layout = useMemo(() => layoutTree(root), [root])
  const all = useMemo(() => flatten(root), [root])
  const maxRows = useMemo(() => Math.max(0, ...all.map((n) => n.nReturned ?? 0)), [all])
  const hottestId = useMemo(() => {
    let best: PlanNode | undefined
    for (const n of all) if ((n.timeExcl ?? 0) > (best?.timeExcl ?? 0)) best = n
    return best?.id
  }, [all])

  const viewport = useRef<HTMLDivElement>(null)
  const [view, setView] = useState({ x: 0, y: 0, k: 1 })
  const drag = useRef<{ x: number; y: number; vx: number; vy: number; moved: boolean } | null>(null)

  const pipelineBox = useMemo(() => {
    const ps = layout.nodes.filter((p) => p.node.source === 'pipeline')
    if (!ps.length) return undefined
    const x0 = Math.min(...ps.map((p) => p.x))
    const x1 = Math.max(...ps.map((p) => p.x)) + NODE_W
    const y0 = Math.min(...ps.map((p) => p.y))
    const y1 = Math.max(...ps.map((p) => p.y)) + NODE_H
    return { left: PAD + x0 - 18, top: PAD + y0 - 34, width: x1 - x0 + 36, height: y1 - y0 + 52, count: ps.length }
  }, [layout])

  const contentW = layout.width + PAD * 2
  const contentH = layout.height + PAD * 2

  const fit = useCallback(() => {
    const el = viewport.current
    if (!el) return
    const { width, height } = el.getBoundingClientRect()
    // Fit the width; tall plans keep a readable scale and are panned vertically.
    const k = Math.max(0.5, Math.min(1, width / contentW, Math.max(0.85, height / contentH)))
    setView({ k, x: (width - contentW * k) / 2, y: 0 })
  }, [contentW, contentH])

  useLayoutEffect(fit, [fit])

  // Wheel zoom around the cursor (non-passive listener so we can preventDefault).
  useEffect(() => {
    const el = viewport.current
    if (!el) return
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      const r = el.getBoundingClientRect()
      const mx = e.clientX - r.left
      const my = e.clientY - r.top
      setView((v) => {
        const k = Math.min(2.5, Math.max(0.2, v.k * Math.exp(-e.deltaY * 0.0015)))
        return { k, x: mx - ((mx - v.x) * k) / v.k, y: my - ((my - v.y) * k) / v.k }
      })
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [])

  const zoomBy = (f: number) => {
    const el = viewport.current
    if (!el) return
    const { width, height } = el.getBoundingClientRect()
    setView((v) => {
      const k = Math.min(2.5, Math.max(0.2, v.k * f))
      return { k, x: width / 2 - ((width / 2 - v.x) * k) / v.k, y: height / 2 - ((height / 2 - v.y) * k) / v.k }
    })
  }

  return (
    <div
      ref={viewport}
      className="relative h-full w-full cursor-grab touch-none overflow-hidden bg-[radial-gradient(circle,#e4dccb_1px,transparent_1px)] [background-size:20px_20px] active:cursor-grabbing"
      onPointerDown={(e) => {
        drag.current = { x: e.clientX, y: e.clientY, vx: view.x, vy: view.y, moved: false }
        e.currentTarget.setPointerCapture(e.pointerId)
      }}
      onPointerMove={(e) => {
        const d = drag.current
        if (!d) return
        const dx = e.clientX - d.x
        const dy = e.clientY - d.y
        if (Math.abs(dx) + Math.abs(dy) > 3) d.moved = true
        setView((v) => ({ ...v, x: d.vx + dx, y: d.vy + dy }))
      }}
      // Focusing a card would scroll this overflow-hidden box; we pan with transforms only.
      onScroll={(e) => { e.currentTarget.scrollTop = 0; e.currentTarget.scrollLeft = 0 }}
      onPointerUp={() => {
        if (drag.current && !drag.current.moved) onSelect(undefined)
        drag.current = null
      }}
    >
      <div
        className="absolute left-0 top-0 origin-top-left"
        style={{ width: contentW, height: contentH, transform: `translate(${view.x}px, ${view.y}px) scale(${view.k})` }}
      >
        {pipelineBox && (
          <div
            className="absolute rounded-xl border border-dashed border-mongo-300 bg-mongo-50/60"
            style={{ left: pipelineBox.left, top: pipelineBox.top, width: pipelineBox.width, height: pipelineBox.height }}
          >
            <div className="flex items-baseline gap-2 whitespace-nowrap px-3 pt-1.5 text-[12px]" title="Stages run by the aggregation framework, fed by the query-engine plan below">
              <span className="font-semibold text-mongo-800">Aggregation pipeline</span>
              <span className="text-mongo-700/70">{pipelineBox.count} stage{pipelineBox.count > 1 ? 's' : ''}</span>
            </div>
          </div>
        )}
        <svg width={contentW} height={contentH} className="absolute left-0 top-0 overflow-visible">
          {layout.edges.map(({ from, to }) => {
            const siblings = to.node.children.length
            const idx = to.node.children.indexOf(from.node)
            const spread = Math.min(56, (NODE_W - 40) / Math.max(1, siblings))
            const x1 = PAD + from.x + NODE_W / 2
            const y1 = PAD + from.y
            const x2 = PAD + to.x + NODE_W / 2 + (idx - (siblings - 1) / 2) * spread
            const y2 = PAD + to.y + NODE_H
            const my = (y1 + y2) / 2
            const n = from.node.nReturned
            const w = edgeWidth(n, maxRows)
            const known = n !== undefined
            const label = known ? `${fmtCompact(n)} ${from.node.unit}` : 'no stats'
            return (
              <g key={`${from.node.id}-${to.node.id}`}>
                <title>{known ? `${fmtInt(n)} ${from.node.unit === 'keys' ? 'index keys' : 'documents'} passed up` : 'No row count for this stage'}</title>
                <path
                  d={`M ${x1} ${y1} C ${x1} ${my}, ${x2} ${my}, ${x2} ${y2}`}
                  fill="none"
                  stroke={known ? (from.node.unit === 'keys' ? '#6ccf9a' : '#a8a29e') : '#d6d3d1'}
                  strokeOpacity={0.75}
                  strokeWidth={w}
                  strokeDasharray={known ? undefined : '6 5'}
                  strokeLinecap="round"
                />
                <text
                  x={(x1 + x2) / 2 + w / 2 + 8}
                  y={my + 4}
                  className="fill-stone-600 font-mono text-[11px]"
                  stroke="#f6f2e9"
                  strokeWidth={4}
                  paintOrder="stroke"
                >
                  {label}
                </text>
              </g>
            )
          })}
        </svg>
        {layout.nodes.map((p) => (
          <NodeCard
            key={p.node.id}
            node={p.node}
            x={PAD + p.x}
            y={PAD + p.y}
            totalTime={totalTime}
            hottest={p.node.id === hottestId}
            selected={p.node.id === selectedId}
            onSelect={onSelect}
          />
        ))}
      </div>

      <div className="absolute bottom-3 left-3 flex items-center gap-3" onPointerDown={(e) => e.stopPropagation()}>
      <div className="flex overflow-hidden rounded-md border border-stone-200 bg-card text-sm shadow-sm">
        <button className="px-2.5 py-1 hover:bg-stone-50" onClick={() => zoomBy(1.2)} title="Zoom in">+</button>
        <button className="border-x border-stone-200 px-2.5 py-1 hover:bg-stone-50" onClick={() => zoomBy(1 / 1.2)} title="Zoom out">−</button>
        <button className="px-2.5 py-1 hover:bg-stone-50" onClick={fit} title="Fit to screen">Fit</button>
      </div>
      <Legend />
      </div>
    </div>
  )
}

function Legend() {
  return (
    <div className="pointer-events-none flex items-center gap-3 rounded-md border border-stone-200 bg-card/90 px-2.5 py-1.5 text-[11px] text-stone-500 shadow-sm">
      <span className="flex items-center gap-1.5">
        <svg width="22" height="8"><line x1="2" y1="4" x2="20" y2="4" stroke="#a8a29e" strokeWidth="5" strokeLinecap="round" /></svg>
        docs
      </span>
      <span className="flex items-center gap-1.5">
        <svg width="22" height="8"><line x1="2" y1="4" x2="20" y2="4" stroke="#6ccf9a" strokeWidth="5" strokeLinecap="round" /></svg>
        index keys
      </span>
      <span>width ∝ log(rows)</span>
      <span>
        ratio ≤2 <span className="text-emerald-700">ok</span> · ≤10 <span className="text-amber-700">warn</span> · &gt;10{' '}
        <span className="text-rose-700">bad</span>
      </span>
    </div>
  )
}
