// @vitest-environment jsdom
/**
 * ui-pet browser half on a real cordis Context with fake slots/remote
 * faces: the plugin registers the settings section and the chat command
 * input, and the settings wake verb drives the same remote setAwake
 * mutation. The draggable sprite is not a web registration: it lives only in
 * the Electron companion window.
 */
import { Context, Service } from '@deepseek-ai/cordis'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup } from '@testing-library/react'
import { ConversationEventRegistry, SlotRegistry } from '@deepseek-ai/dsh-client-runtime/client'
import { LocaleRuntime } from '@deepseek-ai/dsh-client-locale/client'
import type { PetDescriptor, PetSnapshot } from '@luv1211/dsh-pet/client'
import { apply, inject } from '../src/client/index.ts'

const PET: PetDescriptor = {
  id: 'deepseek-whale',
  source: 'builtin',
  displayName: 'DeepSeek Whale',
  assetUrl: '/pet.webp',
  frame: { width: 192, height: 208, columns: 8, rows: 9 },
  animations: { idle: { frames: [{ spriteIndex: 0, durationMs: 1000 }], loopStart: 0, fallback: 'idle' } },
}

const SNAPSHOT: PetSnapshot = {
  preference: { version: 3, selectedPetId: 'deepseek-whale', awake: true, sizePx: 112 },
  catalog: { pets: [PET] },
  petRoot: '/home/tester/.dsh/pets',
  capabilities: { canImport: false, canOpenFolder: false },
  activities: [],
}

afterEach(cleanup)

/** Boot the plugin over fake remote/sessions faces and the slot registry. */
async function bench(): Promise<{
  slots: SlotRegistry
  setAwake: ReturnType<typeof vi.fn>
  definitions: () => readonly { kind: string }[]
}> {
  const ctx = new Context()
  const conversationEvents = new ConversationEventRegistry(ctx)
  const setAwake = vi.fn(async (awake: boolean) => ({
    ok: true,
    value: { ...SNAPSHOT, preference: { ...SNAPSHOT.preference, awake } },
  }))
  class RemoteService extends Service {
    readonly pets = {
      getSnapshot: async () => ({ ok: true, value: SNAPSHOT }),
      setAwake,
      selectPet: vi.fn(async () => ({ ok: true, value: SNAPSHOT })),
      setSize: vi.fn(async () => ({ ok: true, value: SNAPSHOT })),
      importPetPackage: vi.fn(async () => ({ ok: true, value: { outcome: 'host-unavailable' as const } })),
      updatePetPackage: vi.fn(async () => ({ ok: true, value: { outcome: 'host-unavailable' as const } })),
      refreshCatalog: vi.fn(async () => ({ ok: true, value: SNAPSHOT })),
      openPetFolder: vi.fn(async () => ({ ok: true, value: { outcome: 'host-unavailable' as const } })),
    }
    readonly $on = vi.fn(() => () => {})
    constructor(serviceCtx: Context) {
      super(serviceCtx, 'remote')
    }
  }
  const remote = new RemoteService(ctx)
  ctx.provide('remote.pets', remote.pets)
  ctx.provide('locale', new LocaleRuntime(ctx))
  await ctx.plugin(SlotRegistry).await()
  ctx.slots.register({
    name: 'root',
    children: {
      'conversation.chat.node': { kind: 'keyed', scope: 'session' },
      'settings.section': { kind: 'list', scope: 'root' },
    },
  } as never, (() => null) as never)
  await ctx.plugin({ inject: [...inject], apply }).await()
  return {
    slots: ctx.get('slots') as SlotRegistry,
    setAwake,
    definitions: () => conversationEvents.entries(),
  }
}

describe('ui-pet browser half', () => {
  it('registers the command input and the settings section', async () => {
    const { slots, definitions } = await bench()
    expect(slots.entries('settings.section')).toHaveLength(1)
    expect(slots.entries('settings.section')[0]?.options).toMatchObject({ id: 'pet', order: 20 })
    expect(definitions().map(definition => definition.kind)).toEqual(['pet-command-input'])
    expect(slots.entries('conversation.chat.node')[0]?.options).toMatchObject({
      key: 'pet-command-input',
    })
    expect(slots.entries('conversation.chat.node')[0]?.locale).toBe('pet')
  })

  it('tucks through the shared remote mutation from the settings wake verb', async () => {
    const { slots, setAwake } = await bench()
    const section = slots.entries('settings.section')[0]!
    const injected = (section.inject as unknown as () => { onToggleAwake: () => Promise<void> })()
    await injected.onToggleAwake()
    expect(setAwake).toHaveBeenCalledWith(false)
  })
})
