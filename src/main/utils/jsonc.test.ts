import { describe, it, expect } from 'vitest'
import { parseJsonc } from './jsonc'

describe('parseJsonc', () => {
  it('parses plain JSON', () => {
    expect(parseJsonc('{"a":1}')).toEqual({ a: 1 })
  })

  it('strips leading // line comments (the Copilot config.json banner case)', () => {
    const raw = '// This file is managed automatically.\n// Do not edit.\n{ "loggedInUsers": [1] }'
    expect(parseJsonc(raw)).toEqual({ loggedInUsers: [1] })
  })

  it('strips /* block */ comments', () => {
    expect(parseJsonc('{ /* hi */ "a": 2 }')).toEqual({ a: 2 })
  })

  it('does NOT clobber // inside string values (e.g. URLs)', () => {
    const raw = '{ "host": "https://github.com" }'
    expect(parseJsonc(raw)).toEqual({ host: 'https://github.com' })
  })

  it('preserves escaped quotes inside strings', () => {
    const raw = '{ "name": "a \\" b // c" }'
    expect(parseJsonc(raw)).toEqual({ name: 'a " b // c' })
  })

  it('throws on genuinely malformed JSON (so callers can treat it as a miss)', () => {
    expect(() => parseJsonc('not json{{{')).toThrow()
  })
})
