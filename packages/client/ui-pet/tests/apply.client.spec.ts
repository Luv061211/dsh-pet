// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import type { PetDescriptor } from '@deepseek-ai/dsh-pet/client'
import { createPetStore } from '../src/client/store.ts'

const PET: PetDescriptor = {
  id: 'deepseek-whale',
  source: 'builtin',
  displayName: 'DeepSeek Whale',
  assetUrl: '/pet.webp',
  frame: { width: 192, height: 208, columns: 8, rows: 9 },
  animations: { idle: { frames: [{ spriteIndex: 0, durationMs: 1000 }], loopStart: 0, fallback: 'idle' } },
}

describe('pet UI store', () => {
  it('holds the remote snapshot as one coherent view', () => {
    const store = createPetStore().create()
    store.actions.setSnapshot({
      preference: { version: 3, selectedPetId: 'deepseek-whale', awake: true, sizePx: 112 },
      catalog: { pets: [PET] },
      petRoot: '/home/tester/.dsh/pets',
      capabilities: { canImport: false, canOpenFolder: false },
      activities: [],
    })
    expect(store.getSnapshot().snapshot?.preference).toEqual({ version: 3, selectedPetId: 'deepseek-whale', awake: true, sizePx: 112 })
  })
})
