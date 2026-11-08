// Normalises a MongoDB explain("executionStats") document — classic engine,
// slot-based engine (SBE) or aggregation pipeline — into a single PlanNode tree.
//
// Data flows upward: the root is the last operation, leaves read the collection.
// Each node's nReturned is what it hands to its parent (drives the arrow width).

import type { Json } from './parse'

type Obj = { [k: string]: Json }

export type Level = 'ok' | 'warn' | 'bad'
export type Engine = 'classic' | 'sbe'

export interface Warning {
  level: Level
  label: string
  detail: string
}

export interface Detail {
  label: string
  value: Json
}

export interface PlanNode {
  id: string
  stage: string
  /** 'plan' = query-engine stage, 'pipeline' = aggregation stage on top of the cursor. */
  source: 'plan' | 'pipeline'
  /** Short secondary label: index name, namespace, sort pattern… */
  subtitle?: string
  /** What nReturned counts for this stage (IXSCAN hands record ids, i.e. index keys). */
  unit: 'docs' | 'keys'
  nReturned?: number
  timeIncl?: number
  timeExcl?: number
  docsExamined?: number
  keysExamined?: number
  /** examined / returned, using whichever examined count the stage reports. */
  ratio?: number
  warnings: Warning[]
  details: Detail[]
  children: PlanNode[]
  /** The stage object as found in the explain, without its child stages. */
  raw: Obj
  /** SBE: the slot-based stages merged into this logical node. */
  sbeStages?: Obj[]
}

export interface Totals {
  timeMs?: number
  nReturned?: number
  docsExamined?: number
  keysExamined?: number
  docsRatio?: number
  keysRatio?: number
}

export interface Explain {
  kind: 'find' | 'aggregate'
  engine: Engine
  explainVersion?: string
  namespace?: string
  serverVersion?: string
  command?: Json
  hasStats: boolean
  totals: Totals
  root: PlanNode
  /** SBE: raw slot-based execution tree and textual plan. */
  sbeTree?: Json
  sbePlanText?: string
  rejectedPlans: number
  notes: string[]
  raw: Json
}

export class ExplainError extends Error {}

// ------------------------------------------------------------------ utils ---

const CHILD_KEYS = ['inputStage', 'outerStage', 'innerStage', 'thenStage', 'elseStage'] as const
const CHILD_ARRAY_KEYS = ['inputStages'] as const

const isObj = (v: Json | undefined): v is Obj => v !== null && typeof v === 'object' && !Array.isArray(v)
const num = (v: Json | undefined): number | undefined => (typeof v === 'number' && Number.isFinite(v) ? v : undefined)
const str = (v: Json | undefined): string | undefined => (typeof v === 'string' ? v : undefined)

function childrenOf(stage: Obj): Obj[] {
  const out: Obj[] = []
  for (const k of CHILD_KEYS) if (isObj(stage[k])) out.push(stage[k] as Obj)
  for (const k of CHILD_ARRAY_KEYS) {
    const arr = stage[k]
    if (Array.isArray(arr)) for (const c of arr) if (isObj(c)) out.push(c)
  }
  return out
}

function withoutChildren(stage: Obj): Obj {
  const out: Obj = {}
  for (const [k, v] of Object.entries(stage)) {
    if ((CHILD_KEYS as readonly string[]).includes(k) || (CHILD_ARRAY_KEYS as readonly string[]).includes(k)) continue
    out[k] = v
  }
  return out
}

export function ratioOf(examined: number | undefined, returned: number | undefined): number | undefined {
  if (examined === undefined || returned === undefined) return undefined
  if (examined === 0) return returned === 0 ? undefined : 0
  return returned === 0 ? Infinity : examined / returned
}

export function ratioLevel(r: number | undefined): Level | undefined {
  if (r === undefined) return undefined
  if (r <= 2) return 'ok'
  if (r <= 10) return 'warn'
  return 'bad'
}

let seq = 0
const nextId = () => `n${++seq}`

// --------------------------------------------------------- stage details ---

const DETAIL_FIELDS: [string, string][] = [
  ['indexName', 'Index'],
  ['keyPattern', 'Key pattern'],
  ['indexBounds', 'Bounds'],
  ['direction', 'Direction'],
  ['isMultiKey', 'Multikey'],
  ['filter', 'Filter'],
  ['sortPattern', 'Sort pattern'],
  ['limitAmount', 'Limit'],
  ['skipAmount', 'Skip'],
  ['transformBy', 'Projection'],
  ['memLimit', 'Memory limit'],
  ['totalDataSizeSorted', 'Data sorted (bytes)'],
  ['usedDisk', 'Used disk'],
  ['spills', 'Spills'],
  ['spilledDataStorageSize', 'Spilled (bytes)'],
  ['type', 'Sort type'],
  ['foreignCollection', 'Foreign collection'],
  ['localField', 'Local field'],
  ['foreignField', 'Foreign field'],
  ['strategy', 'Strategy'],
  ['groupBySlots', 'Group by'],
  ['works', 'Works'],
  ['advanced', 'Advanced'],
  ['needTime', 'Need time'],
  ['needYield', 'Need yield'],
  ['seeks', 'Seeks'],
  ['dupsTested', 'Dups tested'],
  ['dupsDropped', 'Dups dropped'],
  ['alreadyHasObj', 'Already has obj'],
  ['restoreState', 'Restores'],
]

function stageDetails(stage: Obj): Detail[] {
  const out: Detail[] = []
  for (const [k, label] of DETAIL_FIELDS) if (stage[k] !== undefined) out.push({ label, value: stage[k] })
  return out
}

function subtitleOf(stage: Obj): string | undefined {
  const name = str(stage.stage) ?? ''
  if (str(stage.indexName)) return str(stage.indexName)
  if (name === 'COLLSCAN') return str(stage.direction) ? `${stage.direction} scan` : undefined
  if (isObj(stage.sortPattern)) return Object.entries(stage.sortPattern).map(([k, v]) => `${k}: ${v}`).join(', ')
  if (num(stage.limitAmount) !== undefined) return `limit ${stage.limitAmount}`
  if (num(stage.skipAmount) !== undefined) return `skip ${stage.skipAmount}`
  if (str(stage.foreignCollection)) return `from ${stage.foreignCollection}`
  return undefined
}

function stageWarnings(node: PlanNode, stage: Obj): Warning[] {
  const w: Warning[] = []
  const name = node.stage.toUpperCase()
  if (name === 'COLLSCAN') {
    w.push({ level: 'bad', label: 'Collection scan', detail: 'Every document of the collection is read: no index serves this predicate.' })
  }
  if (name === 'SORT' || name === '$SORT') {
    w.push({ level: 'warn', label: 'In-memory sort', detail: 'Blocking sort: all input is buffered before the first result. An index on the sort key avoids it.' })
  }
  if (stage.usedDisk === true || (num(stage.spills) ?? 0) > 0) {
    w.push({ level: 'bad', label: 'Spilled to disk', detail: 'The stage exceeded its memory budget and wrote temporary data to disk.' })
  }
  if (name === 'SKIP' && (num(stage.skipAmount) ?? 0) >= 1000) {
    w.push({ level: 'warn', label: 'Deep skip', detail: `${stage.skipAmount} results are produced then thrown away. Consider range-based pagination.` })
  }
  const level = ratioLevel(node.ratio)
  if (level && level !== 'ok') {
    const what = node.docsExamined !== undefined ? 'documents' : 'index keys'
    w.push({
      level,
      label: 'Examined ≫ returned',
      detail: `${fmtRatio(node.ratio)} ${what} examined per result returned.`,
    })
  }
  return w
}

export function fmtRatio(r: number | undefined): string {
  if (r === undefined) return '–'
  if (r === Infinity) return '∞'
  return r >= 100 ? Math.round(r).toLocaleString('en-US') : r.toFixed(r < 10 ? 2 : 1).replace(/\.?0+$/, '')
}

function finishNode(node: PlanNode, stage: Obj) {
  const examined = node.docsExamined ?? node.keysExamined
  node.ratio = ratioOf(examined, node.nReturned)
  // A pass-through stage (FETCH without filter, PROJECTION…) has nothing to report.
  if (node.docsExamined === undefined && node.keysExamined === undefined) node.ratio = undefined
  node.warnings = stageWarnings(node, stage)
}

function computeExclusive(node: PlanNode) {
  for (const c of node.children) computeExclusive(c)
  if (node.timeIncl === undefined) return
  const kids = node.children.reduce((s, c) => s + (c.timeIncl ?? 0), 0)
  node.timeExcl = Math.max(0, node.timeIncl - kids)
}

// ------------------------------------------------------- classic engine ---

function buildClassic(stage: Obj): PlanNode {
  const name = str(stage.stage) ?? '?'
  const isIndex = /SCAN$/.test(name) && name !== 'COLLSCAN'
  const node: PlanNode = {
    id: nextId(),
    stage: name,
    source: 'plan',
    subtitle: subtitleOf(stage),
    unit: isIndex ? 'keys' : 'docs',
    nReturned: num(stage.nReturned),
    timeIncl: num(stage.executionTimeMillisEstimate),
    docsExamined: num(stage.docsExamined),
    keysExamined: num(stage.keysExamined),
    warnings: [],
    details: stageDetails(stage),
    children: childrenOf(stage).map(buildClassic),
    raw: withoutChildren(stage),
  }
  // IXSCAN reports keysExamined; FETCH reports docsExamined. Keep only the meaningful one.
  if (isIndex) node.docsExamined = undefined
  finishNode(node, stage)
  return node
}

// ------------------------------------------------- slot-based engine ---

interface SbeStats {
  stages: Obj[]
  nReturned?: number
  time?: number
  docsRead: number
  keysRead: number
  hasDocs: boolean
  hasKeys: boolean
}

const SBE_DOC_READERS = /^(scan|seek|coscan|fetch|parallel_scan)$/i
const SBE_KEY_READERS = /^ix/i

/** Group SBE stages by the logical planNodeId they implement. */
function indexSbe(root: Obj): Map<number, SbeStats> {
  const map = new Map<number, SbeStats>()
  const walk = (s: Obj, parentId: number | undefined) => {
    const id = num(s.planNodeId)
    if (id !== undefined) {
      let e = map.get(id)
      if (!e) {
        e = { stages: [], docsRead: 0, keysRead: 0, hasDocs: false, hasKeys: false }
        map.set(id, e)
      }
      e.stages.push(withoutChildren(s))
      // The topmost SBE stage of a group is the logical node's output.
      if (parentId !== id) {
        const n = num(s.nReturned)
        const t = num(s.executionTimeMillisEstimate)
        if (n !== undefined) e.nReturned = (e.nReturned ?? 0) + n
        if (t !== undefined) e.time = Math.max(e.time ?? 0, t)
      }
      const name = str(s.stage) ?? ''
      const reads = num(s.numReads)
      if (reads !== undefined && SBE_KEY_READERS.test(name)) { e.keysRead += reads; e.hasKeys = true }
      else if (reads !== undefined && SBE_DOC_READERS.test(name)) { e.docsRead += reads; e.hasDocs = true }
    }
    for (const c of childrenOf(s)) walk(c, id ?? parentId)
  }
  walk(root, undefined)
  return map
}

function buildSbe(stage: Obj, stats: Map<number, SbeStats>): PlanNode {
  const name = str(stage.stage) ?? '?'
  const isIndex = /SCAN$/.test(name) && name !== 'COLLSCAN'
  const st = num(stage.planNodeId) !== undefined ? stats.get(num(stage.planNodeId)!) : undefined
  const node: PlanNode = {
    id: nextId(),
    stage: name,
    source: 'plan',
    subtitle: subtitleOf(stage),
    unit: isIndex ? 'keys' : 'docs',
    nReturned: st?.nReturned,
    timeIncl: st?.time,
    docsExamined: st?.hasDocs && !isIndex ? st.docsRead : undefined,
    keysExamined: st?.hasKeys ? st.keysRead : undefined,
    warnings: [],
    details: stageDetails(stage),
    children: childrenOf(stage).map((c) => buildSbe(c, stats)),
    raw: withoutChildren(stage),
    sbeStages: st?.stages,
  }
  // SBE has no spill flags on the logical node: look at the merged SBE stages.
  const merged: Obj = { ...stage }
  for (const s of st?.stages ?? []) {
    if (s.usedDisk === true) merged.usedDisk = true
    if ((num(s.spills) ?? 0) > 0) merged.spills = s.spills
  }
  finishNode(node, merged)
  return node
}

// ------------------------------------------------------- query cursors ---

interface CursorResult {
  engine: Engine
  root: PlanNode
  hasStats: boolean
  totals: Totals
  namespace?: string
  sbeTree?: Json
  sbePlanText?: string
  rejectedPlans: number
  notes: string[]
}

function fromQuery(qp: Obj, es: Obj | undefined, explainVersion: string | undefined): CursorResult {
  const wp = qp.winningPlan
  if (!isObj(wp)) throw new ExplainError('No queryPlanner.winningPlan found.')
  if (wp.shards !== undefined || str(wp.stage)?.startsWith('SHARD')) {
    throw new ExplainError('Sharded explain output is not supported yet.')
  }
  const notes: string[] = []
  const logical = isObj(wp.queryPlan) ? wp.queryPlan : wp
  const isSbe = explainVersion === '2' || isObj(wp.slotBasedPlan) || isObj(wp.queryPlan)
  const execStages = es && isObj(es.executionStages) ? es.executionStages : undefined

  let root: PlanNode
  if (isSbe) {
    root = buildSbe(logical, execStages ? indexSbe(execStages) : new Map())
  } else {
    root = buildClassic(execStages ?? wp)
  }
  if (!execStages) notes.push('No executionStats: run explain("executionStats") to get rows, timings and ratios.')

  const totals: Totals = es
    ? {
        timeMs: num(es.executionTimeMillis),
        nReturned: num(es.nReturned),
        docsExamined: num(es.totalDocsExamined),
        keysExamined: num(es.totalKeysExamined),
      }
    : {}
  // SBE: the root logical node may have no stats of its own if planNodeIds are absent.
  if (isSbe && root.nReturned === undefined && totals.nReturned !== undefined) {
    root.nReturned = totals.nReturned
    notes.push('Some SBE stages carry no planNodeId: per-stage statistics are partial.')
  }

  const sp = isObj(wp.slotBasedPlan) ? wp.slotBasedPlan : undefined
  return {
    engine: isSbe ? 'sbe' : 'classic',
    root,
    hasStats: !!execStages,
    totals,
    namespace: str(qp.namespace),
    sbeTree: isSbe ? execStages : undefined,
    sbePlanText: sp ? str(sp.stages) : undefined,
    rejectedPlans: Array.isArray(qp.rejectedPlans) ? qp.rejectedPlans.length : 0,
    notes,
  }
}

// --------------------------------------------------- aggregation stages ---

function stageName(s: Obj): string | undefined {
  return Object.keys(s).find((k) => k.startsWith('$'))
}

function pipelineSubtitle(name: string, spec: Json): string | undefined {
  if (!isObj(spec)) return undefined
  switch (name) {
    case '$lookup': return str(spec.from) ? `from ${spec.from}` : undefined
    case '$group': return spec._id !== undefined ? `by ${JSON.stringify(spec._id)}` : undefined
    case '$sort': {
      const key = isObj(spec.sortKey) ? spec.sortKey : spec
      const s = Object.entries(key).map(([k, v]) => `${k}: ${v}`).join(', ')
      return num(spec.limit) !== undefined ? `${s} · limit ${spec.limit}` : s
    }
    case '$unwind': return str(spec.path) ?? undefined
    default: return undefined
  }
}

function buildPipelineNode(s: Obj, name: string, child: PlanNode | undefined): PlanNode {
  const spec = s[name]
  const node: PlanNode = {
    id: nextId(),
    stage: name,
    source: 'pipeline',
    subtitle: pipelineSubtitle(name, spec),
    unit: 'docs',
    nReturned: num(s.nReturned),
    timeIncl: num(s.executionTimeMillisEstimate),
    docsExamined: num(s.totalDocsExamined),
    keysExamined: num(s.totalKeysExamined),
    warnings: [],
    details: [
      { label: 'Specification', value: spec },
      ...Object.entries(s)
        .filter(([k]) => k !== name && k !== 'nReturned' && k !== 'executionTimeMillisEstimate')
        .map(([k, v]) => ({ label: k, value: v })),
    ],
    children: child ? [child] : [],
    raw: s,
  }
  const flags: Obj = { ...s }
  if (isObj(spec) && spec.usedDisk !== undefined) flags.usedDisk = spec.usedDisk
  finishNode(node, flags)
  if (name === '$lookup' && (num(s.collectionScans) ?? 0) > 0) {
    node.warnings.push({
      level: 'bad',
      label: 'Collection scans in $lookup',
      detail: `${s.collectionScans} collection scan(s) on the foreign collection: index the foreignField.`,
    })
  }
  return node
}

// --------------------------------------------------------------- entry ---

export function normalizeExplain(raw: Json): Explain {
  seq = 0
  if (!isObj(raw)) throw new ExplainError('Expected an explain document (an object).')
  if (raw.shards !== undefined) throw new ExplainError('Sharded explain output is not supported yet.')
  const explainVersion = str(raw.explainVersion)
  const serverVersion = isObj(raw.serverInfo) ? str(raw.serverInfo.version) : undefined
  const command = raw.command

  // Aggregation with stages left in the pipeline.
  if (Array.isArray(raw.stages)) {
    const stages = raw.stages.filter(isObj)
    const first = stages[0]
    if (!first || !isObj(first.$cursor)) {
      throw new ExplainError('Aggregation explain without a $cursor stage is not supported yet.')
    }
    const cursor = first.$cursor
    if (!isObj(cursor.queryPlanner)) throw new ExplainError('No $cursor.queryPlanner found.')
    const res = fromQuery(
      cursor.queryPlanner,
      isObj(cursor.executionStats) ? cursor.executionStats : undefined,
      explainVersion,
    )
    // The $cursor entry's own counters describe what the cursor handed to the pipeline.
    if (res.root.nReturned === undefined) res.root.nReturned = num(first.nReturned)

    let top = res.root
    let prevTime = num(first.executionTimeMillisEstimate) ?? res.root.timeIncl
    let docs = res.totals.docsExamined
    let keys = res.totals.keysExamined
    for (const s of stages.slice(1)) {
      const name = stageName(s)
      if (!name) continue
      const node = buildPipelineNode(s, name, top)
      top = node
      if (node.docsExamined !== undefined) docs = (docs ?? 0) + node.docsExamined
      if (node.keysExamined !== undefined) keys = (keys ?? 0) + node.keysExamined
      // Pipeline timings are cumulative: each stage includes the ones feeding it.
      if (node.timeIncl !== undefined) {
        node.timeExcl = Math.max(0, node.timeIncl - (prevTime ?? 0))
        prevTime = node.timeIncl
      }
    }
    computeExclusive(res.root)

    const totals: Totals = {
      timeMs: top.timeIncl ?? res.totals.timeMs,
      nReturned: top.nReturned,
      docsExamined: docs,
      keysExamined: keys,
    }
    return finish({
      kind: 'aggregate', engine: res.engine, explainVersion, serverVersion, command,
      namespace: res.namespace, hasStats: res.hasStats, totals, root: top,
      sbeTree: res.sbeTree, sbePlanText: res.sbePlanText, rejectedPlans: res.rejectedPlans,
      notes: res.notes, raw,
    })
  }

  if (!isObj(raw.queryPlanner)) throw new ExplainError('No queryPlanner section found: is this an explain() output?')
  const res = fromQuery(raw.queryPlanner, isObj(raw.executionStats) ? raw.executionStats : undefined, explainVersion)
  computeExclusive(res.root)
  const cmd = isObj(command) ? command : undefined
  const kind = cmd && cmd.aggregate !== undefined ? 'aggregate' : 'find'
  return finish({
    kind, engine: res.engine, explainVersion, serverVersion, command,
    namespace: res.namespace, hasStats: res.hasStats, totals: res.totals, root: res.root,
    sbeTree: res.sbeTree, sbePlanText: res.sbePlanText, rejectedPlans: res.rejectedPlans,
    notes: res.notes, raw,
  })
}

function finish(e: Explain): Explain {
  e.totals.docsRatio = ratioOf(e.totals.docsExamined, e.totals.nReturned)
  e.totals.keysRatio = ratioOf(e.totals.keysExamined, e.totals.nReturned)
  return e
}

/** Depth-first list of all nodes. */
export function flatten(root: PlanNode): PlanNode[] {
  const out: PlanNode[] = []
  const walk = (n: PlanNode) => { out.push(n); n.children.forEach(walk) }
  walk(root)
  return out
}
