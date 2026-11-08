import { describe, expect, it } from 'vitest'
import { SAMPLES } from '../samples'
import { flatten, normalizeExplain, ratioLevel, ratioOf, type PlanNode } from './explain'
import { parseExplain } from './parse'

const load = (id: string) => normalizeExplain(parseExplain(SAMPLES.find((s) => s.id === id)!.text))
const stages = (root: PlanNode) => flatten(root).map((n) => n.stage)
const find = (root: PlanNode, stage: string) => flatten(root).find((n) => n.stage === stage)!

describe('ratios', () => {
  it('computes and grades examined/returned', () => {
    expect(ratioOf(200000, 50)).toBe(4000)
    expect(ratioOf(10, 0)).toBe(Infinity)
    expect(ratioOf(0, 0)).toBeUndefined()
    expect(ratioLevel(2)).toBe('ok')
    expect(ratioLevel(2.5)).toBe('warn')
    expect(ratioLevel(10)).toBe('warn')
    expect(ratioLevel(11)).toBe('bad')
    expect(ratioLevel(Infinity)).toBe('bad')
  })
})

describe('classic find', () => {
  it('builds the tree with inclusive and exclusive times', () => {
    const e = load('collscan-sort')
    expect(e.kind).toBe('find')
    expect(e.engine).toBe('classic')
    expect(stages(e.root)).toEqual(['SORT', 'COLLSCAN'])
    const sort = e.root
    const scan = find(e.root, 'COLLSCAN')
    expect(sort.timeIncl).toBe(131)
    expect(sort.timeExcl).toBe(13)
    expect(scan.timeExcl).toBe(118)
    expect(scan.nReturned).toBe(50113)
    expect(scan.ratio).toBeCloseTo(200000 / 50113)
    expect(e.totals).toMatchObject({ timeMs: 143, nReturned: 50, docsExamined: 200000, docsRatio: 4000 })
  })

  it('flags COLLSCAN and blocking sorts', () => {
    const e = load('collscan-sort')
    expect(find(e.root, 'COLLSCAN').warnings.map((w) => w.label)).toContain('Collection scan')
    expect(e.root.warnings.map((w) => w.label)).toContain('In-memory sort')
  })

  it('uses keys for IXSCAN and flags deep skips', () => {
    const e = load('skip-limit')
    expect(stages(e.root)).toEqual(['LIMIT', 'SKIP', 'FETCH', 'IXSCAN'])
    const ix = find(e.root, 'IXSCAN')
    expect(ix.unit).toBe('keys')
    expect(ix.subtitle).toBe('status_1_createdAt_-1')
    expect(ix.docsExamined).toBeUndefined()
    expect(ix.ratio).toBe(1)
    expect(find(e.root, 'SKIP').warnings.map((w) => w.label)).toContain('Deep skip')
    expect(e.rejectedPlans).toBe(1)
  })

  it('handles inputStages and disk spills', () => {
    const e = load('or-spill')
    expect(find(e.root, 'OR').children).toHaveLength(2)
    expect(e.root.warnings.map((w) => w.label)).toContain('Spilled to disk')
  })
})

describe('SBE', () => {
  it('maps slot-based stats onto the logical plan by planNodeId', () => {
    const e = load('sbe-group')
    expect(e.engine).toBe('sbe')
    expect(e.kind).toBe('aggregate')
    expect(stages(e.root)).toEqual(['GROUP', 'FETCH', 'IXSCAN'])
    const group = e.root
    const fetch = find(e.root, 'FETCH')
    const ix = find(e.root, 'IXSCAN')
    expect(group.nReturned).toBe(4)
    expect(group.timeIncl).toBe(92)
    expect(fetch.nReturned).toBe(101341)
    expect(fetch.timeIncl).toBe(80)
    expect(fetch.docsExamined).toBe(101341)
    expect(ix.keysExamined).toBe(101342)
    expect(ix.timeExcl).toBe(21)
    expect(fetch.timeExcl).toBe(59)
    expect(group.sbeStages?.map((s) => s.stage)).toEqual(['project', 'group', 'project'])
    expect(e.sbePlanText).toContain('ixseek')
  })
})

describe('aggregation pipeline', () => {
  it('stacks pipeline stages on top of the cursor tree with cumulative timings', () => {
    const e = load('agg-lookup')
    expect(e.kind).toBe('aggregate')
    expect(e.engine).toBe('classic')
    expect(stages(e.root)).toEqual(['$sort', '$group', '$lookup', 'PROJECTION_SIMPLE', 'FETCH', 'IXSCAN'])
    const lookup = find(e.root, '$lookup')
    expect(lookup.source).toBe('pipeline')
    expect(lookup.timeExcl).toBe(1702 - 60)
    expect(find(e.root, '$group').timeExcl).toBe(1861 - 1702)
    expect(e.root.timeExcl).toBe(0)
    expect(e.totals).toMatchObject({ timeMs: 1861, nReturned: 12, docsExamined: 19842 * 2 })
    expect(lookup.subtitle).toBe('from customers')
  })
})

describe('errors', () => {
  it('rejects documents that are not explains', () => {
    expect(() => normalizeExplain({ hello: 'world' })).toThrow(/queryPlanner/)
    expect(() => normalizeExplain({ shards: {} })).toThrow(/Sharded/)
  })
})
