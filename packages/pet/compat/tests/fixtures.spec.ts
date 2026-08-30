import { readFile } from 'node:fs/promises'
import { describe, expect, test } from 'vitest'

const fixtureDirectory = new URL('./fixtures/codex-26.818.5229.0/', import.meta.url)
const fixtureNames = [
  'manifest-cases.json',
  'animations.json',
  'notifications.json',
  'terminal-capabilities.json',
  'desktop-observations.json',
] as const

/** Reads a DSH-owned JSON parity record without importing any development observer. */
async function readFixture(name: typeof fixtureNames[number]): Promise<unknown> {
  return JSON.parse(await readFile(new URL(name, fixtureDirectory), 'utf8')) as unknown
}

/** Finds every string value nested inside a JSON-compatible value. */
function stringsIn(value: unknown): string[] {
  if (typeof value === 'string') return [value]
  if (Array.isArray(value)) return value.flatMap(stringsIn)
  if (typeof value !== 'object' || value === null) return []
  return Object.values(value).flatMap(stringsIn)
}

describe('Codex 26.818.5229.0 compatibility fixtures', () => {
  test('record provenance without Codex paths or image payloads', async () => {
    // Break caught: a fixture accidentally captures a machine-specific Codex path or binary artwork.
    const fixtures = await Promise.all(fixtureNames.map(readFixture))

    for (const fixture of fixtures) {
      expect(fixture).toMatchObject({
        formatVersion: 1,
        provenance: {
          codexDesktopVersion: '26.818.5229.0',
          ownership: 'dsh-normalized-fixture',
        },
      })
    }

    const contents = fixtures.flatMap(stringsIn)
    for (const value of contents) {
      expect(value).not.toMatch(/^[A-Za-z]:[\\/]/)
      expect(value).not.toMatch(/^\//)
      expect(value).not.toMatch(/(?:data:image\/|base64|iVBORw0KGgo)/i)
    }
  })

  test('preserve the observed four-CSS-pixel drag displacement', async () => {
    // Break caught: desktop parity loses the measured movement that distinguishes a drag from a click.
    const fixture = await readFixture('desktop-observations.json') as {
      observations?: readonly {
        operation?: string
        input?: { deltaCssPx?: { x?: number; y?: number } }
        expected?: { positionDeltaCssPx?: { x?: number; y?: number } }
      }[]
    }
    const drag = fixture.observations?.find(observation => observation.operation === 'drag')

    expect(drag).toEqual({
      operation: 'drag',
      input: { deltaCssPx: { x: 4, y: 0 } },
      expected: { positionDeltaCssPx: { x: 4, y: 0 } },
    })
  })
})
