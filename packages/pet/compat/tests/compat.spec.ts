import { readFile } from 'node:fs/promises'
import { execFileSync } from 'node:child_process'
import { runInNewContext } from 'node:vm'
import {
  FRAME_AT_SOURCE,
  PET_NOTIFICATION_SPECS,
  cacheKeyForSprite,
  createNotification,
  detectTerminalPetProtocol,
  frameAt,
  parsePetPackage,
  replaceNotification,
  visibleNotification,
} from '../src/index.ts'
import type { PetAnimation, PetNotificationKind, TerminalPetEnvironment, TerminalPetProtocolResult } from '../src/index.ts'
import { describe, expect, test } from 'vitest'

const fixtureDirectory = new URL('./fixtures/codex-26.818.5229.0/', import.meta.url)

interface ManifestFixture {
  readonly cases: readonly {
    readonly input: unknown
    readonly expected: { readonly accepted: boolean; readonly reason?: string; readonly frameCount?: number }
  }[]
  readonly cacheKey: {
    readonly input: {
      readonly contentDigest: string
      readonly frame: { readonly width: number; readonly height: number; readonly columns: number; readonly rows: number }
    }
    readonly expected: string
  }
}

interface AnimationFixture {
  readonly cases: readonly {
    readonly animation: FixtureAnimation
    readonly fallbackAnimation?: FixtureAnimation
    readonly samples?: readonly { readonly elapsedMs: number; readonly animation?: string; readonly spriteIndex: number }[]
    readonly expectedSpriteIndex?: number
  }[]
}

interface FixtureAnimation {
  readonly frames: readonly { readonly spriteIndex: number; readonly durationMs: number }[]
  readonly loopStart?: number | null
  readonly fallback?: string
}

interface NotificationFixture {
  readonly replacementCase: {
    readonly initial: { readonly kind: 'running' | 'waiting' | 'review' | 'failed'; readonly updatedAtMs: number }
    readonly incoming: { readonly kind: 'running' | 'waiting' | 'review' | 'failed'; readonly updatedAtMs: number }
    readonly expectedVisible: { readonly kind: 'running' | 'waiting' | 'review' | 'failed'; readonly updatedAtMs: number }
  }
}

interface TerminalFixture {
  readonly cases: readonly {
    readonly input: TerminalPetEnvironment
    readonly expected: TerminalPetProtocolResult
  }[]
}

/** Reads a DSH-owned compatibility fixture. */
async function readFixture<T>(name: string): Promise<T> {
  return JSON.parse(await readFile(new URL(name, fixtureDirectory), 'utf8')) as T
}

/** Normalizes a fixture track into the committed input accepted by the scheduler. */
function committedAnimation(animation: FixtureAnimation): PetAnimation {
  return {
    frames: animation.frames,
    loopStart: animation.loopStart === undefined ? 0 : animation.loopStart,
    fallback: animation.fallback ?? 'idle',
  }
}

describe('Codex-compatible pet runtime', () => {
  test('accepts manifest-relative spritesheets with the recorded or derived grid geometry', async () => {
    // Break caught: package parsing permits a sprite outside the package or accepts an atlas that cannot address every cell.
    const fixture = await readFixture<ManifestFixture>('manifest-cases.json')

    for (const entry of fixture.cases) {
      const result = parsePetPackage(entry.input)
      expect(result.accepted).toBe(entry.expected.accepted)
      if (result.accepted) expect(result.pet.frameCount).toBe(entry.expected.frameCount)
      else expect(result.reason).toBe(entry.expected.reason)
    }
  })

  test('rejects an atlas that tiles the sprite dimensions with non-Codex cell geometry', () => {
    // Break caught: a differently shaped grid is accepted merely because it fills the image,
    // making the fixed row-to-animation mapping unsafe.
    expect(parsePetPackage({
      id: 'wrong-cell-width',
      displayName: 'Wrong Cell Width',
      spritesheetPath: 'spritesheet.webp',
      frame: { width: 384, height: 208, columns: 4, rows: 9 },
      spritesheetDimensions: { width: 1536, height: 1872 },
    })).toEqual({ accepted: false, reason: 'frame-geometry-not-codex-compatible' })
  })

  test('uses the named fallback after a one-shot sequence ends', async () => {
    // Break caught: completed non-looping animations remain frozen instead of continuing with their fallback animation.
    const fixture = await readFixture<AnimationFixture>('animations.json')
    const entry = fixture.cases.find(candidate => candidate.fallbackAnimation !== undefined)
    if (entry === undefined || entry.fallbackAnimation === undefined || entry.samples === undefined) throw new Error('missing fallback fixture')
    const animations = { oneShot: committedAnimation(entry.animation), idle: committedAnimation(entry.fallbackAnimation) }

    for (const sample of entry.samples) {
      const frame = frameAt(animations, 'oneShot', sample.elapsedMs, false)
      expect(frame).toMatchObject({ animation: sample.animation ?? 'oneShot', spriteIndex: sample.spriteIndex })
    }
  })

  test('repeats a looping animation from its configured loop start', async () => {
    // Break caught: long-running ambient animations freeze on their final frame instead of repeating their configured loop.
    const fixture = await readFixture<AnimationFixture>('animations.json')
    const entry = fixture.cases.find(candidate => candidate.samples !== undefined && candidate.fallbackAnimation === undefined)
    if (entry === undefined || entry.samples === undefined) throw new Error('missing loop fixture')

    for (const sample of entry.samples) {
      expect(frameAt({ idle: committedAnimation(entry.animation) }, 'idle', sample.elapsedMs, false)).toMatchObject({
        animation: 'idle',
        spriteIndex: sample.spriteIndex,
      })
    }
  })

  test('holds the first animation frame when reduced motion is enabled', async () => {
    // Break caught: reduced-motion output advances through frames instead of remaining visually static.
    const fixture = await readFixture<AnimationFixture>('animations.json')
    const entry = fixture.cases.find(candidate => candidate.expectedSpriteIndex !== undefined)
    if (entry === undefined || entry.expectedSpriteIndex === undefined) throw new Error('missing reduced-motion fixture')

    expect(frameAt({ running: committedAnimation(entry.animation) }, 'running', 100_000, true)).toMatchObject({
      animation: 'running',
      spriteIndex: entry.expectedSpriteIndex,
    })
  })

  test('serializes the same self-contained selector used by the Electron overlay', () => {
    // Break caught: the inline Electron document drifts from the browser-safe animation scheduler.
    const serialized = runInNewContext(FRAME_AT_SOURCE, {}) as typeof frameAt
    const animations = {
      idle: committedAnimation({ frames: [{ spriteIndex: 0, durationMs: 100 }], loopStart: 0 }),
    }
    expect(serialized(animations, 'idle', 0, false)).toEqual(frameAt(animations, 'idle', 0, false))
  })

  test('serializes without tsx runtime helpers in a source launch', () => {
    // Break caught: tsx decorates nested functions with __name, which is absent in the inline Electron document.
    const sourceUrl = new URL('../src/index.ts', import.meta.url).href
    const serialized = execFileSync(process.execPath, [
      '--import', 'tsx/esm', '--input-type=module', '-e',
      `import { FRAME_AT_SOURCE } from ${JSON.stringify(sourceUrl)}; process.stdout.write(FRAME_AT_SOURCE)`,
    ], { encoding: 'utf8' })

    const selector = runInNewContext(serialized, {}) as typeof frameAt
    expect(() => selector({ idle: committedAnimation({ frames: [{ spriteIndex: 0, durationMs: 100 }], loopStart: 0 }) }, 'idle', 0, false)).not.toThrow()
  })

  test('replaces the visible notification with the most recently committed one', async () => {
    // Break caught: a stale running notification remains visible after a newer user-input notification is committed.
    const fixture = await readFixture<NotificationFixture>('notifications.json')

    expect(
      replaceNotification(fixture.replacementCase.initial, fixture.replacementCase.incoming),
    ).toEqual(fixture.replacementCase.expectedVisible)
  })

  test('applies the recorded notification labels, fallback bodies, and lifetimes', async () => {
    // Break caught: a notification selects the wrong animation or remains visible beyond the Codex lifetime.
    const fixture = await readFixture<{
      readonly kinds: readonly {
        readonly kind: PetNotificationKind
        readonly animation: string
        readonly label: string
        readonly fallbackBody: string
        readonly lifetimeMs: number
      }[]
    }>('notifications.json')
    for (const expected of fixture.kinds) {
      const spec = PET_NOTIFICATION_SPECS[expected.kind]
      expect(spec).toEqual({
        animation: expected.animation,
        label: expected.label,
        fallbackBody: expected.fallbackBody,
        lifetimeMs: expected.lifetimeMs,
      })
      const notification = createNotification(expected.kind, 1)
      expect(notification.body).toBe(expected.fallbackBody)
      expect(visibleNotification(notification, 1 + expected.lifetimeMs - 1)).toEqual(notification)
      expect(visibleNotification(notification, 1 + expected.lifetimeMs)).toBeUndefined()
    }
  })

  test('forms a stable frame-cache key from content digest and grid geometry', async () => {
    // Break caught: cache entries collide across sprite content or frame geometry, causing stale rendered frames.
    const fixture = await readFixture<ManifestFixture>('manifest-cases.json')

    expect(cacheKeyForSprite(fixture.cacheKey.input)).toBe(fixture.cacheKey.expected)
  })

  test('selects the recorded terminal protocol or the multiplexer-safe fallback', async () => {
    // Break caught: an unsupported multiplexer or terminal is sent graphics escape sequences, or a supported terminal gets text fallback.
    const fixture = await readFixture<TerminalFixture>('terminal-capabilities.json')

    for (const entry of fixture.cases) expect(detectTerminalPetProtocol(entry.input)).toEqual(entry.expected)
  })
})
