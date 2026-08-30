import type { SnapshotSelectorHook } from '@deepseek-ai/dsh-client-ui-slots'
import type { PetImportResult } from '@luv1211/dsh-pet/client'
import type { PetStoreState } from './store.ts'

/** Business actions supplied to the Pet settings page by the shared client plugin. */
export interface PetSettingsInjected {
  /** Selector hook over the shared pet snapshot. */
  usePetState: SnapshotSelectorHook<PetStoreState>
  /** Toggle the persisted awake preference. */
  onToggleAwake: () => Promise<void>
  /** Rescan the user package root and adopt the fresh snapshot. */
  onRefreshCatalog: () => Promise<void>
  /** Select one catalog pet. */
  onSelectPet: (petId: string) => Promise<void>
  /** Persist one logical sprite-cell height. */
  onSetSize: (sizePx: number) => Promise<void>
  /** Open the native picker and report its outcome. */
  onImportPet: () => Promise<PetImportResult>
  /** Replace one user package through the native picker and report its outcome. */
  onUpdatePet: (petId: string) => Promise<PetImportResult>
  /** Ask the host to open the DSH-owned pet directory. */
  onOpenPetFolder: () => Promise<void>
}
