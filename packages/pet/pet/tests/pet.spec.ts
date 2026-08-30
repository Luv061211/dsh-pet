import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, afterEach, describe, expect, it, vi } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import SessionStore, { SessionId } from '@deepseek-ai/dsh-session'
import PetService, { comparePetActivities } from '@deepseek-ai/dsh-pet'
import type { PetNativeActions, PetSessionActivity, PetSnapshot } from '@deepseek-ai/dsh-pet'
import { resolveDshHome } from '@deepseek-ai/dsh-home-paths'
import { SettingsProvider } from '@deepseek-ai/dsh-settings'
import type { SettingsNamespace } from '@deepseek-ai/dsh-settings'
import { WebServer } from '@deepseek-ai/dsh-host-webserver'
import DesktopCompanion from '@deepseek-ai/dsh-desktop-companion'
import { DEFAULT_PET_ANIMATIONS, frameAt } from '@deepseek-ai/dsh-pet-compat'
import { PetActivityProjection } from '../src/activity.ts'
import { PetCatalogStore } from '../src/catalog.ts'
import {
  DEFAULT_PET_SIZE_PX,
  PET_PREFERENCE_VERSION,
  petWidthForSize,
  resolvePetPreference,
  selectLookDirection,
  selectPetPresentation,
  validatePetSize,
  validatePetPackage,
} from '../src/runtime.ts'
import { petSpriteFrame } from '../src/renderer.ts'
import {
  COMPAT_ANIMATION_FIXTURE,
  COMPAT_ROW_COUNTS,
  COMPAT_SPRITESHEET,
} from './fixtures/pet-compat.ts'

// Deterministic interruption injection for the replacement swap: every test
// leaves `failOnCall` at zero, so the passthrough never fires outside the
// mid-swap failure case.
const renameState = vi.hoisted(() => ({ failOnCall: 0, calls: 0 }))
vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs')>()
  const renameSync = (from: Parameters<typeof actual.renameSync>[0], to: Parameters<typeof actual.renameSync>[1]): void => {
    renameState.calls += 1
    if (renameState.failOnCall === renameState.calls) throw new Error('simulated rename interruption')
    actual.renameSync(from, to)
  }
  return { ...actual, renameSync }
})

/** In-memory settings provider used to observe durable pet preference commits. */
class MemorySettingsProvider extends SettingsProvider {
  private stored: Record<string, unknown> = {}

  get writable(): boolean {
    return true
  }

  protected async load(): Promise<Record<string, unknown>> {
    return structuredClone(this.stored)
  }

  protected async persist(ns: SettingsNamespace, section: Record<string, unknown>): Promise<void> {
    this.stored[String(ns)] = structuredClone(section)
  }
}

/** Boot the pet domain over durable in-memory settings and live sessions. */
async function harness(
  activity?: PetActivityProjection,
  native?: PetNativeActions,
  config: { petRoot?: string; decodeTimeoutMs?: number } = {},
): Promise<Context> {
  const ctx = new Context()
  await ctx.plugin(MemorySettingsProvider)
  if (activity !== undefined) ctx.provide('petActivity', activity)
  if (native !== undefined) ctx.provide('petNative', native)
  await ctx.plugin(PetService, config)
  await ctx.plugin(SessionStore)
  return ctx
}

describe('PetService preferences', () => {
  it('rejects a zero image decode timeout during plugin setup', async () => {
    await expect(harness(undefined, undefined, { decodeTimeoutMs: 0 })).rejects.toThrow()
  })

  it('resolves the shipped awake mascot preference without stored settings', async () => {
    const root = mkdtempSync(join(tmpdir(), 'dsh-pet-default-'))
    const petRoot = join(root, 'pets')
    const ctx = await harness(undefined, undefined, { petRoot })

    const snapshot = ctx.pets.getSnapshot()
    expect(snapshot).toMatchObject({
      preference: { version: 3, selectedPetId: 'deepseek-whale', awake: true, sizePx: 112 },
      catalog: { pets: [{
        id: 'deepseek-whale',
        source: 'builtin',
        displayName: 'DeepSeek Whale',
        description: 'A pixel-art blue whale companion for DeepSeek Harness tasks.',
        frame: { width: 192, height: 208, columns: 8, rows: 9 },
        assetUrl: '/__dsh/pet/assets/deepseek-whale/spritesheet.webp',
      }] },
      petRoot,
      capabilities: { canImport: false, canOpenFolder: false },
      activities: [],
    })
    expect(snapshot.catalog.pets[0]?.animations).toHaveProperty('idle')
    expect(snapshot.catalog.pets[0]?.animations).toHaveProperty('running')
    rmSync(root, { recursive: true, force: true })
  })

  it('commits an awake change before returning the fresh snapshot', async () => {
    const ctx = await harness()

    await expect(ctx.pets.setAwake(false)).resolves.toMatchObject({
      preference: { version: 3, selectedPetId: 'deepseek-whale', awake: false, sizePx: 112 },
    })
    expect(ctx.pets.getSnapshot().preference.awake).toBe(false)
  })

  it('commits the selected built-in pet before returning the fresh snapshot', async () => {
    const ctx = await harness()

    await expect(ctx.pets.selectPet('deepseek-whale')).resolves.toMatchObject({
      preference: { version: 3, selectedPetId: 'deepseek-whale', awake: true, sizePx: 112 },
    })
    expect(ctx.pets.getSnapshot().preference.selectedPetId).toBe('deepseek-whale')
  })
})

describe('pet activity', () => {
  it('sorts status priority, newest transitions, and session ids deterministically', () => {
    const activity = (sessionId: string, status: PetSessionActivity['status'], since: number): PetSessionActivity => ({
      sessionId: SessionId(sessionId),
      title: sessionId,
      status,
      since,
    })

    expect([
      activity('run', 'running', 40),
      activity('ready', 'ready', 30),
      activity('blocked', 'blocked', 20),
      activity('input-newer', 'needs-input', 11),
      activity('input-earlier', 'needs-input', 10),
      activity('same-b', 'running', 5),
      activity('same-a', 'running', 5),
    ].sort(comparePetActivities).map(record => record.sessionId)).toEqual([
      SessionId('input-newer'),
      SessionId('input-earlier'),
      SessionId('blocked'),
      SessionId('ready'),
      SessionId('run'),
      SessionId('same-a'),
      SessionId('same-b'),
    ])
  })

  it('aggregates each session\'s live turn state into the global snapshot', async () => {
    const ctx = await harness()
    const running = ctx.sessions.create(SessionId('running'), { meta: { cwd: 'C:/pet-running' } })
    const blocked = ctx.sessions.create(SessionId('blocked'), { meta: { cwd: 'C:/pet-blocked' } })
    const ready = ctx.sessions.create(SessionId('ready'), { meta: { cwd: 'C:/pet-ready' } })

    running.append('turn/start', { turn: 1 })
    blocked.append('turn/start', { turn: 1 })
    blocked.append('turn/end', { turn: 1, reason: { kind: 'blocked' } })
    ready.append('turn/start', { turn: 1 })
    ready.append('turn/end', { turn: 1, reason: { kind: 'completed' } })

    expect(ctx.pets.getSnapshot().activities.map(record => [record.sessionId, record.status])).toEqual([
      [SessionId('blocked'), 'blocked'],
      [SessionId('ready'), 'ready'],
      [SessionId('running'), 'running'],
    ])
  })

  it('drops a session\'s activity record when the session is disposed', async () => {
    const ctx = await harness()
    const session = ctx.sessions.prepare(SessionId('leaving'), { meta: { cwd: 'C:/pet-leaving' } })
    const detach = ctx.sessions.enter(session)
    ctx.sessions.announce(session)
    session.append('turn/start', { turn: 1 })
    expect(ctx.pets.getSnapshot().activities).toHaveLength(1)

    detach()

    expect(ctx.pets.getSnapshot().activities).toEqual([])
  })

  it('maps the host activity projection without duplicating pending or completion state', async () => {
    const projection = new PetActivityProjection()
    const ctx = await harness(projection)
    projection.publish([
      { sessionId: SessionId('needs-input'), title: 'Input', status: 'running', since: 20, pendingInteraction: 'approval', completed: false },
      { sessionId: SessionId('blocked'), title: 'Blocked', status: 'blocked', since: 30, completed: false },
      { sessionId: SessionId('ready'), title: 'Ready', status: 'idle', since: 40, completed: true },
      { sessionId: SessionId('running'), title: 'Running', status: 'running', since: 50, completed: false },
      { sessionId: SessionId('idle'), title: 'Idle', status: 'idle', since: 60, completed: false },
    ])

    expect(ctx.pets.getSnapshot().activities.map(activity => [activity.sessionId, activity.status])).toEqual([
      [SessionId('needs-input'), 'needs-input'],
      [SessionId('blocked'), 'blocked'],
      [SessionId('ready'), 'ready'],
      [SessionId('running'), 'running'],
    ])
  })

  it('imports through native bytes and opens the host-owned pet folder without exposing a path', async () => {
    const petRoot = mkdtempSync(join(tmpdir(), 'dsh-pet-native-'))
    let openedPath: string | undefined
    const manifestBytes = new TextEncoder().encode(JSON.stringify({
      id: 'quiet-otter',
      displayName: 'Quiet Otter',
      spritesheetPath: 'spritesheet.webp',
      frame: { width: 192, height: 208, columns: 8, rows: 9 },
    }))
    const spritesheetBytes = new Uint8Array(readFileSync(new URL('../assets/deepseek-whale/spritesheet.webp', import.meta.url)))
    const native: PetNativeActions = {
      pickPetPackage: async () => ({ manifestBytes, spritesheetBytes }),
      openPetFolder: async (path) => { openedPath = path },
    }
    const ctx = await harness(undefined, native, { petRoot })
    try {
      await expect(ctx.pets.importPetPackage()).resolves.toMatchObject({
        outcome: 'published', pet: { id: 'quiet-otter', source: 'user' },
      })
      expect(ctx.pets.getCatalog().pets.map(pet => pet.id)).toEqual(['deepseek-whale', 'quiet-otter'])
      expect(ctx.pets.getSnapshot().petRoot).toBe(petRoot)
      await expect(ctx.pets.openPetFolder()).resolves.toEqual({ outcome: 'opened' })
      expect(openedPath).toBe(petRoot)
    } finally {
      await ctx.fiber.dispose()
      rmSync(petRoot, { recursive: true, force: true })
    }
  })

  it('reports native operations as unavailable in a browser-only composition', async () => {
    const ctx = await harness()
    await expect(ctx.pets.importPetPackage()).resolves.toEqual({ outcome: 'host-unavailable' })
    await expect(ctx.pets.updatePetPackage('quiet-otter')).resolves.toEqual({ outcome: 'host-unavailable' })
    await expect(ctx.pets.openPetFolder()).resolves.toEqual({ outcome: 'host-unavailable' })
  })

  it('reflects a native provider that mounts after the service instead of freezing an early absence', async () => {
    // The `petNative` provider is supplied by a later tree row than `dsh-pet`
    // (the API gateway), so the service must read the seam per access, never
    // capture it once at construction — otherwise the desktop host would report
    // browser-only capabilities even though its picker is native.
    let openedPath: string | undefined
    const native: PetNativeActions = {
      pickPetPackage: async () => null,
      openPetFolder: async (path) => { openedPath = path },
    }
    const ctx = await harness()
    expect(ctx.pets.getSnapshot().capabilities).toEqual({ canImport: false, canOpenFolder: false })

    ctx.provide('petNative', native)
    expect(ctx.pets.getSnapshot().capabilities).toEqual({ canImport: true, canOpenFolder: true })
    await expect(ctx.pets.openPetFolder()).resolves.toEqual({ outcome: 'opened' })
    expect(openedPath).toBe(join(resolveDshHome(), 'pets'))
  })
})

describe('pet catalog refresh and replacement', () => {
  /** Materialize one valid user package directory inside the given root. */
  function writeUserPackage(petRoot: string, id: string, displayName: string): void {
    mkdirSync(join(petRoot, id), { recursive: true })
    writeFileSync(join(petRoot, id, 'pet.json'), JSON.stringify({
      id,
      displayName,
      spritesheetPath: 'spritesheet.webp',
      frame: { width: 192, height: 208, columns: 8, rows: 9 },
    }))
    copyFileSync(new URL('../assets/deepseek-whale/spritesheet.webp', import.meta.url), join(petRoot, id, 'spritesheet.webp'))
  }

  /** Manifest bytes naming the given package id and display name. */
  function manifestBytes(id: string, displayName: string): Uint8Array {
    return new TextEncoder().encode(JSON.stringify({
      id,
      displayName,
      spritesheetPath: 'spritesheet.webp',
      frame: { width: 192, height: 208, columns: 8, rows: 9 },
    }))
  }

  it('rediscovers a package dropped into the user root through refreshCatalog', async () => {
    const petRoot = mkdtempSync(join(tmpdir(), 'dsh-pet-refresh-'))
    const updates: PetSnapshot[] = []
    const ctx = await harness(undefined, undefined, { petRoot })
    try {
      const off = ctx.on('pet/update', (snapshot) => { updates.push(snapshot) })
      expect(ctx.pets.getCatalog().pets.map(pet => pet.id)).toEqual(['deepseek-whale'])

      writeUserPackage(petRoot, 'quiet-otter', 'Quiet Otter')
      const fresh = ctx.pets.refreshCatalog()

      expect(fresh.petRoot).toBe(petRoot)
      expect(fresh.catalog.pets.map(pet => [pet.id, pet.source])).toEqual([
        ['deepseek-whale', 'builtin'],
        ['quiet-otter', 'user'],
      ])
      off()
      expect(updates.length).toBeGreaterThan(0)
      expect(updates.at(-1)?.catalog.pets.map(pet => pet.id)).toContain('quiet-otter')
    } finally {
      await ctx.fiber.dispose()
      rmSync(petRoot, { recursive: true, force: true })
    }
  })

  it('replaces an existing user package with the picked bytes and republishes it', async () => {
    const petRoot = mkdtempSync(join(tmpdir(), 'dsh-pet-replace-'))
    const native: PetNativeActions = {
      pickPetPackage: async () => ({
        manifestBytes: manifestBytes('quiet-otter', 'Louder Otter'),
        spritesheetBytes: new Uint8Array(readFileSync(new URL('../assets/deepseek-whale/spritesheet.webp', import.meta.url))),
      }),
      openPetFolder: async () => {},
    }
    try {
      writeUserPackage(petRoot, 'quiet-otter', 'Quiet Otter')
      const ctx = await harness(undefined, native, { petRoot })

      await expect(ctx.pets.updatePetPackage('quiet-otter')).resolves.toMatchObject({
        outcome: 'published', pet: { id: 'quiet-otter', source: 'user', displayName: 'Louder Otter' },
      })
      expect(JSON.parse(readFileSync(join(petRoot, 'quiet-otter', 'pet.json'), 'utf8'))).toMatchObject({ displayName: 'Louder Otter' })
      expect(ctx.pets.getCatalog().pets.find(pet => pet.id === 'quiet-otter')?.displayName).toBe('Louder Otter')
      expect(readdirSync(petRoot).filter(name => name.startsWith('.quiet-otter.'))).toEqual([])
    } finally {
      rmSync(petRoot, { recursive: true, force: true })
    }
  })

  it('returns cancelled when the picker is dismissed during an update', async () => {
    const petRoot = mkdtempSync(join(tmpdir(), 'dsh-pet-update-cancel-'))
    const native: PetNativeActions = {
      pickPetPackage: async () => null,
      openPetFolder: async () => {},
    }
    try {
      writeUserPackage(petRoot, 'quiet-otter', 'Quiet Otter')
      const ctx = await harness(undefined, native, { petRoot })

      await expect(ctx.pets.updatePetPackage('quiet-otter')).resolves.toEqual({ outcome: 'cancelled' })
      expect(readdirSync(petRoot)).toEqual(['quiet-otter'])
    } finally {
      rmSync(petRoot, { recursive: true, force: true })
    }
  })

  it('rejects a picked manifest whose id differs from the update target without changing anything', async () => {
    const petRoot = mkdtempSync(join(tmpdir(), 'dsh-pet-update-mismatch-'))
    const native: PetNativeActions = {
      pickPetPackage: async () => ({
        manifestBytes: manifestBytes('other-id', 'Other Pet'),
        spritesheetBytes: new Uint8Array(readFileSync(new URL('../assets/deepseek-whale/spritesheet.webp', import.meta.url))),
      }),
      openPetFolder: async () => {},
    }
    try {
      writeUserPackage(petRoot, 'quiet-otter', 'Quiet Otter')
      const ctx = await harness(undefined, native, { petRoot })

      await expect(ctx.pets.updatePetPackage('quiet-otter')).rejects.toThrow(/does not match update target quiet-otter/)
      expect(JSON.parse(readFileSync(join(petRoot, 'quiet-otter', 'pet.json'), 'utf8'))).toMatchObject({ displayName: 'Quiet Otter' })
      expect(existsSync(join(petRoot, 'other-id'))).toBe(false)
      expect(readdirSync(petRoot).filter(name => name.startsWith('.'))).toEqual([])
    } finally {
      rmSync(petRoot, { recursive: true, force: true })
    }
  })

  it('rejects the built-in package as an update target', async () => {
    const petRoot = mkdtempSync(join(tmpdir(), 'dsh-pet-update-builtin-'))
    const native: PetNativeActions = {
      pickPetPackage: async () => ({
        manifestBytes: manifestBytes('deepseek-whale', 'DeepSeek Whale'),
        spritesheetBytes: new Uint8Array(readFileSync(new URL('../assets/deepseek-whale/spritesheet.webp', import.meta.url))),
      }),
      openPetFolder: async () => {},
    }
    const ctx = await harness(undefined, native, { petRoot })
    try {
      await expect(ctx.pets.updatePetPackage('deepseek-whale')).rejects.toThrow(/not an updatable user package/)
      expect(ctx.pets.getCatalog().pets.map(pet => [pet.id, pet.source])).toEqual([['deepseek-whale', 'builtin']])
      expect(existsSync(petRoot) ? readdirSync(petRoot) : []).toEqual([])
    } finally {
      await ctx.fiber.dispose()
      rmSync(petRoot, { recursive: true, force: true })
    }
  })

  it('keeps the complete old content when the swap is interrupted and sweeps residue on the next replacement', async () => {
    const petRoot = mkdtempSync(join(tmpdir(), 'dsh-pet-update-interrupt-'))
    try {
      writeUserPackage(petRoot, 'quiet-otter', 'Quiet Otter')
      const store = new PetCatalogStore({ petRoot })
      const updatedManifest = manifestBytes('quiet-otter', 'Louder Otter')
      const spritesheet = new Uint8Array(readFileSync(new URL('../assets/deepseek-whale/spritesheet.webp', import.meta.url)))

      renameState.calls = 0
      renameState.failOnCall = 2
      try {
        expect(() => store.replacePackage(updatedManifest, spritesheet)).toThrow('simulated rename interruption')
      } finally {
        renameState.failOnCall = 0
      }
      expect(JSON.parse(readFileSync(join(petRoot, 'quiet-otter', 'pet.json'), 'utf8'))).toMatchObject({ displayName: 'Quiet Otter' })
      expect(store.getCatalog().pets.find(pet => pet.id === 'quiet-otter')?.displayName).toBe('Quiet Otter')
      expect(readdirSync(petRoot).filter(name => name.startsWith('.'))).toEqual([])

      mkdirSync(join(petRoot, '.quiet-otter.stale.tmp'), { recursive: true })
      writeFileSync(join(petRoot, '.quiet-otter.stale.tmp', 'pet.json'), '{}')
      const replaced = store.replacePackage(updatedManifest, spritesheet)
      expect(replaced.displayName).toBe('Louder Otter')
      expect(readdirSync(petRoot)).toEqual(['quiet-otter'])
    } finally {
      rmSync(petRoot, { recursive: true, force: true })
    }
  })
})

describe('pet companion overlay', () => {
  const contexts: Context[] = []
  const overlayRoot = mkdtempSync(join(tmpdir(), 'dsh-pet-overlay-'))

  afterEach(async () => {
    await Promise.all(contexts.splice(0).map(ctx => ctx.fiber.dispose()))
  })

  afterAll(() => { rmSync(overlayRoot, { recursive: true, force: true }) })

  /** Boot the pet domain over the web surface that hosts the companion. */
  async function overlayHarness(): Promise<{ ctx: Context; webServer: WebServer }> {
    const ctx = new Context()
    contexts.push(ctx)
    await ctx.plugin(MemorySettingsProvider)
    await ctx.plugin(WebServer, { host: '127.0.0.1', port: 0 })
    await ctx.plugin(DesktopCompanion)
    await ctx.plugin(PetService, { petRoot: join(overlayRoot, 'pets') })
    await ctx.plugin(SessionStore)
    return { ctx, webServer: ctx.get('webServer') as WebServer }
  }

  it('registers the companion descriptor and serves a safe state-fetching sprite page', async () => {
    const { ctx, webServer } = await overlayHarness()

    expect((ctx.get('desktopCompanion') as DesktopCompanion).descriptor()).toEqual({
      id: 'pet', entryPath: '/__dsh/pet/overlay', width: 103, height: 112,
      capabilities: {
        drag: true,
        pointerInteraction: true,
        resize: { minWidth: 74, maxWidth: 207, minHeight: 80, maxHeight: 224 },
      },
    })

    const response = await fetch(`http://127.0.0.1:${webServer.port}/__dsh/pet/overlay`)

    expect(response.status).toBe(200)
    expect(response.headers.get('cache-control')).toBe('no-store')
    const body = await response.text()
    expect(body).not.toContain('data:image/webp;base64,')
    expect(body).toContain('/__dsh/pet/overlay-state')
    expect(body).toContain('textContent')
    expect(body).toContain('startDrag')
    // The overlay reconciles the companion window height with sizePx; without
    // this call the sprite scales past the fixed window and is clipped.
    expect(body).toContain('api.resize({width:')
    expect(body).not.toContain('api.bounds()')
    expect(body).not.toContain('location.reload')
    expect(body).toContain('pointerdown')
    expect(body).toContain('event.button!==0')
    expect(body).toContain('contextmenu')
    expect(body).toContain('id="pet-menu"')
    expect(body).toContain('关闭宠物')
    expect(body).toContain("/__dsh/pet/overlay-awake'")
    expect(body).toContain('pet.animations')
    expect(body).toContain('const frameAt=')
    expect(body).toContain('nextFrameInMs')
    expect(body).not.toContain('frameDurationsMs')
    const state = await fetch(`http://127.0.0.1:${webServer.port}/__dsh/pet/overlay-state`)
    expect(state.headers.get('content-type')).toContain('application/json')
    await expect(state.json()).resolves.toMatchObject({
      preference: { awake: true },
      catalog: { pets: [{ id: 'deepseek-whale' }] },
    })
  })

  it('tucks the pet through the overlay awake write endpoint', async () => {
    const { webServer } = await overlayHarness()

    const response = await fetch(`http://127.0.0.1:${webServer.port}/__dsh/pet/overlay-awake`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ awake: false }),
    })

    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toContain('application/json')
    await expect(response.json()).resolves.toMatchObject({ preference: { awake: false } })
    const state = await fetch(`http://127.0.0.1:${webServer.port}/__dsh/pet/overlay-state`)
    await expect(state.json()).resolves.toMatchObject({ preference: { awake: false } })
  })

  it('rejects overlay awake writes off the strict JSON fence without committing', async () => {
    const { webServer } = await overlayHarness()
    const base = `http://127.0.0.1:${webServer.port}/__dsh/pet/overlay-awake`

    const form = await fetch(base, { method: 'POST', headers: { 'content-type': 'text/plain' }, body: '{"awake":false}' })
    expect(form.status).toBe(415)
    const read = await fetch(base)
    expect(read.status).toBe(405)
    const broken = await fetch(base, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{' })
    expect(broken.status).toBe(400)
    const shape = await fetch(base, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{"awake":"no"}' })
    expect(shape.status).toBe(400)
    const extra = await fetch(base, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{"awake":false,"x":1}' })
    expect(extra.status).toBe(400)
    const oversize = await fetch(base, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ awake: false, pad: 'x'.repeat(2048) }),
    })
    expect(oversize.status).toBe(413)

    const state = await fetch(`http://127.0.0.1:${webServer.port}/__dsh/pet/overlay-state`)
    await expect(state.json()).resolves.toMatchObject({ preference: { awake: true } })
  })

  it('publishes awake=false through the overlay state endpoint', async () => {
    const { ctx, webServer } = await overlayHarness()
    await ctx.pets.setAwake(false)

    const state = await fetch(`http://127.0.0.1:${webServer.port}/__dsh/pet/overlay-state`)

    await expect(state.json()).resolves.toMatchObject({ preference: { awake: false } })
  })
})

describe('browser-safe pet runtime', () => {
  it('rejects legacy preference versions instead of migrating old package selections', () => {
    expect(resolvePetPreference(undefined)).toEqual({
      version: PET_PREFERENCE_VERSION,
      selectedPetId: 'deepseek-whale',
      awake: true,
      sizePx: DEFAULT_PET_SIZE_PX,
    })
    expect(() => resolvePetPreference({ version: 1, selectedPetId: 'deepseek-whale', awake: false })).toThrow(/unsupported/)
    expect(() => resolvePetPreference({ version: 2, selectedPetId: 'deepseek-whale', awake: false, sizePx: 160 })).toThrow(/unsupported/)
    expect(() => resolvePetPreference({ version: 2, selectedPetId: 'quiet-otter', awake: false, sizePx: 112 })).toThrow(/unsupported/)
    expect(() => resolvePetPreference({ version: 4, selectedPetId: 'deepseek-whale', awake: true })).toThrow(/unsupported/)
  })

  it('validates the compatible size range and preserves the atlas aspect ratio', () => {
    expect(validatePetSize(80)).toBe(80)
    expect(validatePetSize(224)).toBe(224)
    expect(petWidthForSize(112)).toBe(103)
    expect(() => validatePetSize(79)).toThrow(/between 80 and 224/)
    expect(() => validatePetSize(225)).toThrow(/between 80 and 224/)
  })

  it('keeps the checked-in nine-row atlas and Codex animation tracks', () => {
    expect(COMPAT_SPRITESHEET).toEqual({ width: 1536, height: 1872, cellWidth: 192, cellHeight: 208, columns: 8, rows: 9 })
    expect([...COMPAT_ROW_COUNTS]).toEqual([6, 8, 8, 4, 5, 8, 6, 6, 6])
    for (const [state, fixture] of Object.entries(COMPAT_ANIMATION_FIXTURE)) {
      expect(DEFAULT_PET_ANIMATIONS[state]).toEqual(fixture)
    }
  })

  it('settles into the idle frames after the Codex activity prefix', () => {
    const running = DEFAULT_PET_ANIMATIONS.running!
    const primaryDuration = running.frames.slice(0, running.loopStart ?? 0).reduce((total, frame) => total + frame.durationMs, 0)
    expect(frameAt(DEFAULT_PET_ANIMATIONS, 'running', primaryDuration - 1, false)).toMatchObject({ animation: 'running', spriteIndex: 61 })
    expect(frameAt(DEFAULT_PET_ANIMATIONS, 'running', primaryDuration, false)).toMatchObject({ animation: 'running', spriteIndex: 0 })
  })

  it('selects activity presentation, reduced motion, and drag direction without host dependencies', () => {
    expect(selectPetPresentation({ awake: false, status: 'running', hover: false, reducedMotion: false })).toMatchObject({ state: 'tucked', frame: 0 })
    expect(selectPetPresentation({ awake: true, status: 'needs-input', hover: false, reducedMotion: true })).toMatchObject({ state: 'waiting', row: 6, frame: 0, animate: false })
    expect(selectPetPresentation({ awake: true, status: 'running', hover: false, dragDirection: 'left', reducedMotion: false })).toMatchObject({ state: 'running-left', row: 2 })
    expect(selectPetPresentation({ awake: true, status: 'ready', hover: true, reducedMotion: false })).toMatchObject({ state: 'jumping', row: 4 })
  })

  it('keeps idle presentation within the compatible atlas when a look target is present', () => {
    const presentation = selectPetPresentation({ awake: true, hover: false, reducedMotion: false, lookTarget: { x: 10, y: 0 } })
    expect(presentation).toMatchObject({ state: 'idle', lookDirection: 4, lookDirectionActive: false })
    expect(petSpriteFrame('/pet.webp', 112, presentation, 0)).toMatchObject({
      frame: { row: 0, column: 0 },
      style: { backgroundPosition: '0px 0px', backgroundSize: '824px 1008px' },
    })
  })

  it('renders a selected package animation through the shared compat scheduler', () => {
    const presentation = selectPetPresentation({ awake: true, hover: false, reducedMotion: false })
    expect(petSpriteFrame('/custom.webp', 112, presentation, 0, {
      idle: { frames: [{ spriteIndex: 8, durationMs: 100 }], loopStart: 0, fallback: 'idle' },
    })).toMatchObject({ frame: { row: 1, column: 0 }, style: { backgroundImage: 'url(/custom.webp)' } })
  })

  it('bins look targets clockwise from up and applies the neutral dead zone', () => {
    expect(selectLookDirection({ x: 0, y: 0 })).toBe(0)
    expect(selectLookDirection({ x: 1, y: 1 })).toBe(0)
    expect(selectLookDirection({ x: 0, y: -10 })).toBe(0)
    expect(selectLookDirection({ x: 10, y: 0 })).toBe(4)
    expect(selectLookDirection({ x: 0, y: 10 })).toBe(8)
    expect(selectLookDirection({ x: -10, y: 0 })).toBe(12)
  })

  it('accepts the Codex-compatible DSH package through the shared parser', () => {
    const manifest = new TextEncoder().encode(JSON.stringify({
      id: 'fixture-pet',
      displayName: ' Fixture Pet ',
      description: ' A fixture ',
      spritesheetPath: 'spritesheet.webp',
      frame: { width: 192, height: 208, columns: 8, rows: 9 },
    }))
    const spritesheet = new Uint8Array(readFileSync(new URL('../assets/deepseek-whale/spritesheet.webp', import.meta.url)))
    expect(validatePetPackage(manifest, spritesheet, {
      source: 'user',
      assetUrl: '/__dsh/pet/assets/fixture-pet/spritesheet.webp',
      maxManifestBytes: 4096,
      maxSpriteBytes: 4_000_000,
    })).toMatchObject({
      id: 'fixture-pet',
      displayName: 'Fixture Pet',
      description: 'A fixture',
      assetUrl: '/__dsh/pet/assets/fixture-pet/spritesheet.webp',
    })
  })

  it('accepts and publishes a safe manifest-relative spritesheet path', async () => {
    const petRoot = mkdtempSync(join(tmpdir(), 'dsh-pet-relative-sprite-'))
    const manifestBytes = new TextEncoder().encode(JSON.stringify({
      id: 'nested-sprite',
      displayName: 'Nested Sprite',
      spritesheetPath: 'art/pet.webp',
      frame: { width: 192, height: 208, columns: 8, rows: 9 },
    }))
    const spritesheetBytes = new Uint8Array(readFileSync(new URL('../assets/deepseek-whale/spritesheet.webp', import.meta.url)))
    const native: PetNativeActions = {
      pickPetPackage: async () => ({ manifestBytes, spritesheetBytes }),
      openPetFolder: async () => {},
    }
    const ctx = await harness(undefined, native, { petRoot })
    try {
      await expect(ctx.pets.importPetPackage()).resolves.toMatchObject({ outcome: 'published', pet: { id: 'nested-sprite' } })
      expect(existsSync(join(petRoot, 'nested-sprite', 'art', 'pet.webp'))).toBe(true)
    } finally {
      await ctx.fiber.dispose()
      rmSync(petRoot, { recursive: true, force: true })
    }
  })

  it('rejects a dimension-only VP8X header without image payload', () => {
    const manifest = new TextEncoder().encode(JSON.stringify({
      id: 'truncated-pet',
      displayName: 'Truncated Pet',
      spritesheetPath: 'spritesheet.webp',
      frame: { width: 192, height: 208, columns: 8, rows: 9 },
    }))
    expect(() => validatePetPackage(manifest, webpWithDimensions(1536, 1872), { source: 'user' })).toThrow(/valid WebP image/)
  })

  it('rejects a VP8X canvas followed only by an empty VP8 chunk', () => {
    const manifest = new TextEncoder().encode(JSON.stringify({
      id: 'empty-image-pet',
      displayName: 'Empty Image Pet',
      spritesheetPath: 'spritesheet.webp',
      frame: { width: 192, height: 208, columns: 8, rows: 9 },
    }))
    const bytes = new Uint8Array(38)
    bytes.set(webpWithDimensions(1536, 1872), 0)
    bytes[4] = 30
    bytes.set(new TextEncoder().encode('VP8 '), 30)
    expect(() => validatePetPackage(manifest, bytes, { source: 'user' })).toThrow(/valid WebP image/)
  })

  it('rejects a syntactically headed VP8 chunk with no decodable pixel stream before publication', () => {
    const manifest = new TextEncoder().encode(JSON.stringify({
      id: 'header-only-pet',
      displayName: 'Header Only Pet',
      spritesheetPath: 'spritesheet.webp',
      frame: { width: 192, height: 208, columns: 8, rows: 9 },
    }))
    const bytes = new Uint8Array(48)
    bytes.set(webpWithDimensions(1536, 1872), 0)
    bytes[4] = 40
    bytes.set(new TextEncoder().encode('VP8 '), 30)
    bytes[34] = 10
    bytes.set([16, 0, 0, 157, 1, 42, 0, 6, 80, 7], 38)
    const petRoot = mkdtempSync(join(tmpdir(), 'dsh-pet-undecodable-'))
    try {
      const store = new PetCatalogStore({ petRoot })
      expect(() => store.importPackage(manifest, bytes)).toThrow(/decodable WebP image/)
      expect(readdirSync(petRoot)).toEqual([])
    } finally {
      rmSync(petRoot, { recursive: true, force: true })
    }
  })

  it('excludes a package whose relative spritesheet traverses an intermediate link', () => {
    const root = mkdtempSync(join(tmpdir(), 'dsh-pet-linked-sprite-'))
    const petRoot = join(root, 'pets')
    const packageRoot = join(petRoot, 'linked-pet')
    const outside = join(root, 'outside')
    try {
      mkdirSync(packageRoot, { recursive: true })
      mkdirSync(outside)
      copyFileSync(new URL('../assets/deepseek-whale/spritesheet.webp', import.meta.url), join(outside, 'pet.webp'))
      writeFileSync(join(packageRoot, 'pet.json'), JSON.stringify({
        id: 'linked-pet',
        displayName: 'Linked Pet',
        spritesheetPath: 'art/pet.webp',
        frame: { width: 192, height: 208, columns: 8, rows: 9 },
      }))
      symlinkSync(outside, join(packageRoot, 'art'), process.platform === 'win32' ? 'junction' : 'dir')
      expect(new PetCatalogStore({ petRoot }).getCatalog().pets.map(pet => pet.id)).toEqual(['deepseek-whale'])
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it('excludes an existing user spritesheet whose disk size exceeds the configured read limit', () => {
    const root = mkdtempSync(join(tmpdir(), 'dsh-pet-oversized-sprite-'))
    const petRoot = join(root, 'pets')
    const packageRoot = join(petRoot, 'oversized-pet')
    try {
      mkdirSync(packageRoot, { recursive: true })
      writeFileSync(join(packageRoot, 'pet.json'), JSON.stringify({
        id: 'oversized-pet',
        displayName: 'Oversized Pet',
        spritesheetPath: 'spritesheet.webp',
        frame: { width: 192, height: 208, columns: 8, rows: 9 },
      }))
      writeFileSync(join(packageRoot, 'spritesheet.webp'), new Uint8Array(1_500_001))
      expect(new PetCatalogStore({ petRoot, maxSpriteBytes: 1_500_000 }).getCatalog().pets.map(pet => pet.id)).toEqual(['deepseek-whale'])
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it('imports an eleven-row v2 package with a bare Codex manifest', async () => {
    const petRoot = mkdtempSync(join(tmpdir(), 'dsh-pet-v2-import-'))
    const manifestBytes = new TextEncoder().encode(JSON.stringify({
      id: 'v2-pet',
      displayName: 'V2 Pet',
      kind: 'creature',
      spriteVersionNumber: 2,
      spritesheetPath: 'spritesheet.webp',
    }))
    const spritesheetBytes = readFileSync(new URL('./fixtures/eleven-row-v2.webp', import.meta.url))
    const native: PetNativeActions = {
      pickPetPackage: async () => ({ manifestBytes, spritesheetBytes }),
      openPetFolder: async () => {},
    }
    const ctx = await harness(undefined, native, { petRoot })
    try {
      const published = await ctx.pets.importPetPackage()
      expect(published).toMatchObject({
        outcome: 'published',
        pet: {
          id: 'v2-pet',
          source: 'user',
          displayName: 'V2 Pet',
          frame: { width: 192, height: 208, columns: 8, rows: 11 },
        },
      })
      expect(ctx.pets.getCatalog().pets.map(pet => pet.id)).toContain('v2-pet')
      expect(ctx.pets.getSnapshot().catalog.pets.find(pet => pet.id === 'v2-pet')?.frame).toEqual({
        width: 192, height: 208, columns: 8, rows: 11,
      })
    } finally {
      await ctx.fiber.dispose()
      rmSync(petRoot, { recursive: true, force: true })
    }
  })

  it('adopts a codex-format package from a <id>.codex-pet directory in the user root', () => {
    const root = mkdtempSync(join(tmpdir(), 'dsh-pet-codex-dir-'))
    const petRoot = join(root, 'pets')
    const packageRoot = join(petRoot, 'pinehuihui.codex-pet')
    try {
      mkdirSync(packageRoot, { recursive: true })
      writeFileSync(join(packageRoot, 'pet.json'), JSON.stringify({
        id: 'pinehuihui',
        displayName: 'Pine Huihui',
        description: 'A codex-format user package.',
        spritesheetPath: 'spritesheet.webp',
        kind: 'animal',
        spriteVersionNumber: 1,
      }))
      copyFileSync(new URL('../assets/deepseek-whale/spritesheet.webp', import.meta.url), join(packageRoot, 'spritesheet.webp'))
      const catalog = new PetCatalogStore({ petRoot }).getCatalog()
      expect(catalog.pets.map(pet => pet.id)).toContain('pinehuihui')
      const adopted = catalog.pets.find(pet => pet.id === 'pinehuihui')
      expect(adopted).toMatchObject({
        source: 'user',
        frame: { width: 192, height: 208, columns: 8, rows: 9 },
      })
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it('adopts an eleven-row v2 package dropped into the user root under any directory name', () => {
    const root = mkdtempSync(join(tmpdir(), 'dsh-pet-v2-dir-'))
    const petRoot = join(root, 'pets')
    const packageRoot = join(petRoot, '任意名字')
    try {
      mkdirSync(packageRoot, { recursive: true })
      writeFileSync(join(packageRoot, 'pet.json'), JSON.stringify({
        id: 'v2-user-pet',
        displayName: 'V2 User Pet',
        kind: 'animal',
        spriteVersionNumber: 2,
        spritesheetPath: 'spritesheet.webp',
      }))
      copyFileSync(new URL('./fixtures/eleven-row-v2.webp', import.meta.url), join(packageRoot, 'spritesheet.webp'))
      const pets = new PetCatalogStore({ petRoot }).getCatalog().pets
      expect(pets.map(pet => pet.id)).toContain('v2-user-pet')
      expect(pets.find(pet => pet.id === 'v2-user-pet')?.frame.rows).toBe(11)
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it('skips dot-prefixed directories and stale import residue without failing the catalog', () => {
    const root = mkdtempSync(join(tmpdir(), 'dsh-pet-dot-dir-'))
    const petRoot = join(root, 'pets')
    try {
      mkdirSync(join(petRoot, '.stale.v2-pet.uuid.tmp'), { recursive: true })
      writeFileSync(join(petRoot, '.stale.v2-pet.uuid.tmp', 'pet.json'), JSON.stringify({
        id: 'v2-pet',
        displayName: 'V2 Pet',
        spritesheetPath: 'spritesheet.webp',
      }))
      copyFileSync(new URL('./fixtures/eleven-row-v2.webp', import.meta.url), join(petRoot, '.stale.v2-pet.uuid.tmp', 'spritesheet.webp'))
      expect(new PetCatalogStore({ petRoot }).getCatalog().pets.map(pet => pet.id)).toEqual(['deepseek-whale'])
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })
})

/** Create the smallest VP8X byte sequence needed to carry deterministic dimensions. */
function webpWithDimensions(width: number, height: number): Uint8Array {
  const bytes = new Uint8Array(30)
  bytes.set(new TextEncoder().encode('RIFF'), 0)
  bytes.set(new TextEncoder().encode('WEBP'), 8)
  bytes.set(new TextEncoder().encode('VP8X'), 12)
  bytes[16] = 10
  const encodedWidth = width - 1
  const encodedHeight = height - 1
  bytes[24] = encodedWidth & 0xff
  bytes[25] = (encodedWidth >>> 8) & 0xff
  bytes[26] = (encodedWidth >>> 16) & 0xff
  bytes[27] = encodedHeight & 0xff
  bytes[28] = (encodedHeight >>> 8) & 0xff
  bytes[29] = (encodedHeight >>> 16) & 0xff
  return bytes
}
