import { describe, expect, it } from 'vitest'
import { ParseError, parseExplain } from './parse'

describe('parseExplain', () => {
  it('parses strict JSON', () => {
    expect(parseExplain('{"a": [1, 2.5, -3e2], "b": "x\\ny", "c": null, "d": true}')).toEqual({
      a: [1, 2.5, -300], b: 'x\ny', c: null, d: true,
    })
  })

  it('collapses Extended JSON wrappers', () => {
    const v = parseExplain(`{
      "n": {"$numberLong": "9007"}, "i": {"$numberInt": "3"}, "dec": {"$numberDecimal": "1.5"},
      "d": {"$date": "2025-06-01T00:00:00Z"}, "d2": {"$date": {"$numberLong": "0"}},
      "id": {"$oid": "65a1"}, "lo": {"$minKey": 1}, "hi": {"$maxKey": 1},
      "re": {"$regularExpression": {"pattern": "^a", "options": "i"}},
      "q": {"$gte": 5}
    }`)
    expect(v).toEqual({
      n: 9007, i: 3, dec: 1.5,
      d: '2025-06-01T00:00:00.000Z', d2: '1970-01-01T00:00:00.000Z',
      id: "ObjectId('65a1')", lo: 'MinKey', hi: 'MaxKey', re: '/^a/i',
      q: { $gte: 5 },
    })
  })

  it('parses mongosh output', () => {
    const v = parseExplain(`{
      explainVersion: '2',
      queryPlanner: { namespace: 'mev.orders', parsedQuery: { customerId: { '$eq': 1234 } } },
      _id: new ObjectId("65a1f0"),
      createdAt: ISODate('2025-06-01T00:00:00.000Z'),
      n: Long('200000'), k: NumberLong(12), j: Int32(4), x: Decimal128('2.50'),
      ts: Timestamp({ t: 1730000000, i: 3 }),
      re: /^anna\\./i,
      bounds: [ MinKey, MaxKey ],
      trailing: [1, 2,],
      // a comment
      ok: 1,
    }`)
    expect(v).toMatchObject({
      explainVersion: '2',
      queryPlanner: { namespace: 'mev.orders', parsedQuery: { customerId: { $eq: 1234 } } },
      _id: "ObjectId('65a1f0')",
      createdAt: '2025-06-01T00:00:00.000Z',
      n: 200000, k: 12, j: 4, x: 2.5,
      ts: 'Timestamp(1730000000, 3)',
      re: '/^anna\\./i',
      bounds: ['MinKey', 'MaxKey'],
      trailing: [1, 2],
      ok: 1,
    })
  })

  it('accepts a trailing semicolon and BOM', () => {
    expect(parseExplain('﻿{ a: 1 };')).toEqual({ a: 1 })
  })

  it('reports the position of errors', () => {
    try {
      parseExplain('{\n  a: 1\n  b: 2\n}')
      expect.unreachable()
    } catch (e) {
      expect(e).toBeInstanceOf(ParseError)
      expect((e as ParseError).line).toBe(3)
    }
  })

  it('rejects empty input', () => {
    expect(() => parseExplain('   ')).toThrow(ParseError)
  })
})
