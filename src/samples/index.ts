// Built-in examples. These are hand-written approximations of real explain
// output (marked gitVersion: "synthetic"); they will be replaced by outputs
// captured from a live server.

import aggLookup from './classic-agg-lookup.mongosh.txt?raw'
import collscanSort from './classic-collscan-sort.json?raw'
import orSpill from './classic-or-spill.json?raw'
import skipLimit from './classic-skip-limit.json?raw'
import sbeGroup from './sbe-match-group.json?raw'

export interface Sample {
  id: string
  label: string
  text: string
}

export const SAMPLES: Sample[] = [
  { id: 'collscan-sort', label: 'find · COLLSCAN + top-k SORT (classic)', text: collscanSort },
  { id: 'skip-limit', label: 'find · deep skip pagination (classic)', text: skipLimit },
  { id: 'or-spill', label: 'find · $or + sort spilled to disk (classic)', text: orSpill },
  { id: 'sbe-group', label: 'aggregate · $match + $group pushed down (SBE)', text: sbeGroup },
  { id: 'agg-lookup', label: 'aggregate · $lookup + $group, mongosh format (classic)', text: aggLookup },
]
