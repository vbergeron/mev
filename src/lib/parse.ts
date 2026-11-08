// Tolerant parser for explain output.
//
// Accepts, in one grammar:
//   - strict JSON
//   - canonical / relaxed Extended JSON ({"$numberLong": "1"}, {"$date": ...}, ...)
//   - what mongosh prints: unquoted keys, single quotes, trailing commas, comments,
//     ObjectId('…'), new ObjectId("…"), ISODate('…'), Long('…'), NumberLong(…),
//     Int32(…), Double(…), Decimal128('…'), Timestamp({ t, i }), BinData(…), UUID(…),
//     MinKey / MaxKey, regex literals.
//
// BSON wrapper types are turned into plain JS values: numeric types become numbers,
// dates become ISO strings, the rest become readable strings (e.g. "ObjectId('…')").

export class ParseError extends Error {
  readonly line: number
  readonly column: number
  readonly offset: number
  constructor(message: string, offset: number, src: string) {
    const before = src.slice(0, offset)
    const line = before.split('\n').length
    const column = offset - before.lastIndexOf('\n')
    super(`${message} (line ${line}, column ${column})`)
    this.line = line
    this.column = column
    this.offset = offset
  }
}

export type Json = null | boolean | number | string | Json[] | { [k: string]: Json }

const NUMERIC_CTORS = new Set(['Long', 'NumberLong', 'Int32', 'NumberInt', 'Double', 'Int64'])
const DECIMAL_CTORS = new Set(['Decimal128', 'NumberDecimal'])
const DATE_CTORS = new Set(['ISODate', 'Date'])

class Parser {
  private i = 0
  private readonly s: string
  constructor(s: string) {
    this.s = s
  }

  fail(msg: string, at = this.i): never {
    throw new ParseError(msg, at, this.s)
  }

  skipWs() {
    const s = this.s
    for (;;) {
      const c = s[this.i]
      if (c === ' ' || c === '\n' || c === '\r' || c === '\t' || c === '﻿') {
        this.i++
      } else if (c === '/' && s[this.i + 1] === '/') {
        while (this.i < s.length && s[this.i] !== '\n') this.i++
      } else if (c === '/' && s[this.i + 1] === '*') {
        const end = s.indexOf('*/', this.i + 2)
        if (end < 0) this.fail('Unterminated comment')
        this.i = end + 2
      } else {
        return
      }
    }
  }

  peek() {
    this.skipWs()
    return this.s[this.i]
  }

  expect(ch: string) {
    if (this.peek() !== ch) this.fail(`Expected '${ch}' but found ${this.describe()}`)
    this.i++
  }

  describe() {
    const c = this.s[this.i]
    return c === undefined ? 'end of input' : `'${c}'`
  }

  parseDocument(): Json {
    const v = this.value()
    this.skipWs()
    // Allow a trailing semicolon, as in a copied shell statement.
    if (this.s[this.i] === ';') this.i++
    this.skipWs()
    if (this.i < this.s.length) this.fail(`Unexpected ${this.describe()} after the document`)
    return v
  }

  value(): Json {
    const c = this.peek()
    if (c === '{') return fromEjson(this.object())
    if (c === '[') return this.array()
    if (c === '"' || c === "'") return this.string()
    if (c === '/') return this.regex()
    if (c === '-' || c === '+' || c === '.' || (c >= '0' && c <= '9')) return this.number()
    if (c !== undefined && /[A-Za-z_$]/.test(c)) return this.identValue()
    return this.fail(`Unexpected ${this.describe()}`)
  }

  object(): { [k: string]: Json } {
    this.expect('{')
    const out: { [k: string]: Json } = {}
    for (;;) {
      const c = this.peek()
      if (c === '}') {
        this.i++
        return out
      }
      const key = c === '"' || c === "'" ? this.string() : this.ident()
      if (!key) this.fail(`Expected a key but found ${this.describe()}`)
      this.expect(':')
      out[key] = this.value()
      const n = this.peek()
      if (n === ',') this.i++
      else if (n !== '}') this.fail(`Expected ',' or '}' but found ${this.describe()}`)
    }
  }

  array(): Json[] {
    this.expect('[')
    const out: Json[] = []
    for (;;) {
      const c = this.peek()
      if (c === ']') {
        this.i++
        return out
      }
      out.push(this.value())
      const n = this.peek()
      if (n === ',') this.i++
      else if (n !== ']') this.fail(`Expected ',' or ']' but found ${this.describe()}`)
    }
  }

  string(): string {
    const s = this.s
    const q = s[this.i]
    const start = this.i
    this.i++
    let out = ''
    for (;;) {
      const c = s[this.i]
      if (c === undefined) this.fail('Unterminated string', start)
      if (c === q) {
        this.i++
        return out
      }
      if (c === '\\') {
        const e = s[this.i + 1]
        this.i += 2
        switch (e) {
          case 'n': out += '\n'; break
          case 't': out += '\t'; break
          case 'r': out += '\r'; break
          case 'b': out += '\b'; break
          case 'f': out += '\f'; break
          case 'u': {
            const hex = s.slice(this.i, this.i + 4)
            if (!/^[0-9a-fA-F]{4}$/.test(hex)) this.fail('Invalid \\u escape')
            out += String.fromCharCode(parseInt(hex, 16))
            this.i += 4
            break
          }
          default: out += e
        }
        continue
      }
      out += c
      this.i++
    }
  }

  number(): number {
    const m = /^[-+]?(?:Infinity|(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?)/.exec(this.s.slice(this.i))
    if (!m) this.fail(`Invalid number`)
    this.i += m[0].length
    return Number(m[0])
  }

  regex(): string {
    const s = this.s
    const start = this.i
    this.i++
    let inClass = false
    for (;;) {
      const c = s[this.i]
      if (c === undefined || c === '\n') this.fail('Unterminated regular expression', start)
      if (c === '\\') { this.i += 2; continue }
      if (c === '[') inClass = true
      else if (c === ']') inClass = false
      else if (c === '/' && !inClass) break
      this.i++
    }
    this.i++
    while (/[a-z]/.test(s[this.i] ?? '')) this.i++
    return s.slice(start, this.i)
  }

  ident(): string {
    this.skipWs()
    const m = /^[A-Za-z_$][\w$.]*/.exec(this.s.slice(this.i))
    if (!m) return ''
    this.i += m[0].length
    return m[0]
  }

  identValue(): Json {
    const start = this.i
    let name = this.ident()
    if (name === 'new') name = this.ident() || this.fail('Expected a constructor after new')
    switch (name) {
      case 'true': return true
      case 'false': return false
      case 'null':
      case 'undefined': return null
      case 'NaN': return NaN
      case 'Infinity': return Infinity
    }
    if (this.peek() !== '(') {
      // Bare identifiers: MinKey, MaxKey, or anything mongosh may print unquoted.
      return name
    }
    this.i++
    const args: Json[] = []
    while (this.peek() !== ')') {
      args.push(this.value())
      if (this.peek() === ',') this.i++
      else if (this.peek() !== ')') this.fail(`Expected ',' or ')' in ${name}(…)`)
    }
    this.i++
    return convertCtor(name, args, () => this.fail(`Invalid arguments to ${name}()`, start))
  }
}

function convertCtor(name: string, args: Json[], bad: () => never): Json {
  const a0 = args[0]
  if (NUMERIC_CTORS.has(name) || DECIMAL_CTORS.has(name)) {
    const n = typeof a0 === 'number' ? a0 : Number(a0)
    return Number.isNaN(n) ? bad() : n
  }
  if (DATE_CTORS.has(name)) {
    if (a0 === undefined) return name === 'Date' ? 'Date()' : bad()
    const d = new Date(a0 as string | number)
    return Number.isNaN(d.getTime()) ? String(a0) : d.toISOString()
  }
  if (name === 'ObjectId') return `ObjectId('${a0 ?? ''}')`
  if (name === 'Timestamp') {
    if (a0 && typeof a0 === 'object' && !Array.isArray(a0)) return `Timestamp(${a0.t}, ${a0.i})`
    return `Timestamp(${args.join(', ')})`
  }
  if (name === 'MinKey' || name === 'MaxKey') return name
  if (name === 'UUID') return `UUID('${a0 ?? ''}')`
  if (name === 'BinData') return `BinData(${args.map(String).join(', ')})`
  return `${name}(${args.map((a) => JSON.stringify(a)).join(', ')})`
}

/** Collapse an Extended JSON wrapper object into a plain value; leave other objects alone. */
function fromEjson(o: { [k: string]: Json }): Json {
  const keys = Object.keys(o)
  if (keys.length === 0 || keys[0][0] !== '$') return o
  const k = keys[0]
  const v = o[k]
  if (keys.length === 1) {
    switch (k) {
      case '$numberLong':
      case '$numberInt':
      case '$numberDouble':
      case '$numberDecimal':
        return Number(v)
      case '$date': {
        const raw = v !== null && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, Json>).$numberLong ?? v : v
        const d = new Date(typeof raw === 'string' && /^-?\d+$/.test(raw) ? Number(raw) : (raw as string | number))
        return Number.isNaN(d.getTime()) ? String(raw) : d.toISOString()
      }
      case '$oid':
        return `ObjectId('${v}')`
      case '$minKey':
        return 'MinKey'
      case '$maxKey':
        return 'MaxKey'
      case '$timestamp': {
        const t = v as Record<string, Json>
        return `Timestamp(${t.t}, ${t.i})`
      }
      case '$regularExpression': {
        const r = v as Record<string, Json>
        return `/${r.pattern}/${r.options ?? ''}`
      }
      case '$binary':
        return 'BinData(…)'
      case '$uuid':
        return `UUID('${v}')`
      case '$undefined':
        return null
    }
  }
  // Anything else starting with '$' is a query operator ({ $gt: 5 }, { $regex: … }): keep it.
  return o
}

export function parseExplain(text: string): Json {
  const trimmed = text.trim()
  if (!trimmed) throw new ParseError('Nothing to parse: paste an explain output', 0, text)
  return new Parser(text).parseDocument()
}
