// Top-down tree layout: leaves are laid out left to right, each parent is
// centred over its children. Good enough for plan trees, which are narrow.

import type { PlanNode } from './explain'

export const NODE_W = 248
export const NODE_H = 128
const GAP_X = 36
const GAP_Y = 76

export interface Placed {
  node: PlanNode
  x: number
  y: number
  depth: number
}

export interface Edge {
  from: Placed // child (data source)
  to: Placed // parent (data consumer)
}

export interface Layout {
  nodes: Placed[]
  edges: Edge[]
  width: number
  height: number
}

export function layoutTree(root: PlanNode): Layout {
  const nodes: Placed[] = []
  const edges: Edge[] = []
  let nextLeaf = 0
  let maxDepth = 0

  const place = (n: PlanNode, depth: number): Placed => {
    maxDepth = Math.max(maxDepth, depth)
    const kids = n.children.map((c) => place(c, depth + 1))
    const x = kids.length
      ? (kids[0].x + kids[kids.length - 1].x) / 2
      : nextLeaf++ * (NODE_W + GAP_X)
    const p: Placed = { node: n, x, y: depth * (NODE_H + GAP_Y), depth }
    nodes.push(p)
    for (const k of kids) edges.push({ from: k, to: p })
    return p
  }
  place(root, 0)

  const minX = Math.min(...nodes.map((p) => p.x))
  for (const p of nodes) p.x -= minX
  const width = Math.max(...nodes.map((p) => p.x)) + NODE_W
  const height = (maxDepth + 1) * NODE_H + maxDepth * GAP_Y
  return { nodes, edges, width, height }
}

/** Arrow thickness: logarithmic in rows so 1 row and 1M rows both stay readable. */
export function edgeWidth(n: number | undefined, max: number): number {
  if (n === undefined) return 2
  const MIN = 2
  const MAX = 22
  if (max <= 0) return MIN
  return MIN + (MAX - MIN) * (Math.log10(n + 1) / Math.log10(max + 1))
}
