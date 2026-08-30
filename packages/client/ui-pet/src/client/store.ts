import { defineStore } from '@deepseek-ai/dsh-client-runtime/client'
import type { EngineStoreHandle } from '@deepseek-ai/dsh-client-runtime/client'
import type { PetSnapshot } from '@deepseek-ai/dsh-pet/client'

/** Shared client read model for the latest detached pet snapshot. */
export interface PetStoreState { snapshot: PetSnapshot | null }

/** Mutations accepted by the shared pet read model. */
export type PetStoreActions = { setSnapshot: (draft: PetStoreState, snapshot: PetSnapshot) => void }

/** Create the shared read model for the optional pet UI.
 * @returns the engine store handle used by pet renderers and subscriptions.
 */
export function createPetStore(): EngineStoreHandle<PetStoreState, PetStoreActions> {
  return defineStore({ init: () => ({ snapshot: null }), actions: { setSnapshot: (draft, snapshot) => { draft.snapshot = snapshot } } })
}
