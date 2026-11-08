import type { Level } from './explain'

export const fmtInt = (n: number | undefined) => (n === undefined ? '–' : n.toLocaleString('en-US'))

export function fmtCompact(n: number | undefined): string {
  if (n === undefined) return '?'
  if (n < 1000) return String(n)
  if (n < 1e6) return `${(n / 1e3).toFixed(n < 1e4 ? 1 : 0).replace(/\.0$/, '')}k`
  if (n < 1e9) return `${(n / 1e6).toFixed(n < 1e7 ? 1 : 0).replace(/\.0$/, '')}M`
  return `${(n / 1e9).toFixed(1).replace(/\.0$/, '')}B`
}

export function fmtMs(ms: number | undefined): string {
  if (ms === undefined) return '–'
  if (ms >= 10000) return `${(ms / 1000).toFixed(1)} s`
  return `${ms.toLocaleString('en-US')} ms`
}

export const LEVEL_TEXT: Record<Level, string> = {
  ok: 'text-emerald-700',
  warn: 'text-amber-700',
  bad: 'text-rose-700',
}

export const LEVEL_CHIP: Record<Level, string> = {
  ok: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  warn: 'bg-amber-50 text-amber-800 ring-amber-200',
  bad: 'bg-rose-50 text-rose-700 ring-rose-200',
}

export const LEVEL_BORDER: Record<Level, string> = {
  ok: 'border-stone-200',
  warn: 'border-amber-300',
  bad: 'border-rose-300',
}

export function worst(levels: Level[]): Level | undefined {
  if (levels.includes('bad')) return 'bad'
  if (levels.includes('warn')) return 'warn'
  return levels.length ? 'ok' : undefined
}
