/**
 * Pet surface plugin, browser half: the settings section and the chat command
 * input. One pet-store instance is created here and bound into a `usePetState`
 * hook; all registrations receive the same hook and the mutation verbs through
 * their inject faces. The draggable sprite lives only in the Electron companion
 * window (`createPetOverlayHtml` in `dsh-pet`), never as a web overlay.
 */
import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
import { bindSnapshotSelector } from './bind-snapshot.ts'
// Type-only: pulls the generated pets Remote API, the pet/update event
// signature, and the sidebar.footer.action SlotMap merges.
import type {} from '@deepseek-ai/dsh-api-remotes/client'
// Type-only: pulls the pets Remote namespace merge (the shared remote face).
import type {} from '@deepseek-ai/dsh-pet/remote'
import type { RemoteResult } from '@deepseek-ai/dsh-typert-protocol'
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import type {} from '@deepseek-ai/dsh-client-ui-layout/client'
import type {} from '@deepseek-ai/dsh-client-ui-sidebar/client'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'
import { PetCommandInputView } from './PetCommandInputView.tsx'
import { PetSettingsSection } from './PetSettingsSection.tsx'
import { en, zh, type PetKey } from './locales.ts'
import { petCommandInputDefinition } from './pet-command-input.ts'
import { createPetStore } from './store.ts'
import type { PetImportResult, PetSnapshot } from '@deepseek-ai/dsh-pet/client'
import type { PetSettingsInjected } from './slots.ts'

export type { PetSettingsInjected } from './slots.ts'
export type { PetSettingsSectionProps } from './PetSettingsSection.tsx'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** The pet surface's copy. */
    pet: PetKey
  }
}

/** Dictionary namespace owned by this plugin. */
const NS = 'pet'

/** Required services for the command projection, settings mutations, and copy. */
export const inject = [
  'slots', 'remote', 'remote.pets', 'locale', 'conversationEvents',
]

/**
 * Client plugin body: the shared pet store plus the registrations.
 * @param ctx - client root context.
 */
export function apply(ctx: ClientContext): void {
  ctx.conversationEvents.register(petCommandInputDefinition)
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'ui-pet: dictionaries')
  const t = ctx.locale.bind(NS)
  const store = createPetStore().create()
  const usePetState = bindSnapshotSelector(store)
  // Seed the profile from the host; the forwarded event keeps it current.
  void ctx.remote.pets.getSnapshot().then((result) => {
    if (result.ok) store.actions.setSnapshot(result.value)
  }).catch(() => { /* seed is best-effort; pet/update or the next mutation converges */ })
  ctx.effect(() => ctx.remote.$on('pet/update', (snapshot) => {
    store.actions.setSnapshot(snapshot)
  }), 'ui-pet: pet/update')

  const pets = ctx.remote.pets
  const adopt = (result: RemoteResult<PetSnapshot>): void => {
    if (result.ok) store.actions.setSnapshot(result.value)
  }
  const toggleAwake = async (): Promise<void> => {
    const result = await pets.setAwake(!(store.getSnapshot().snapshot?.preference.awake ?? false))
    adopt(result)
  }
  const selectPet = async (petId: string): Promise<void> => {
    adopt(await pets.selectPet(petId))
  }
  const setSize = async (sizePx: number): Promise<void> => {
    adopt(await pets.setSize(sizePx))
  }
  const importPetPackage = async (): Promise<PetImportResult> => {
    const result = await pets.importPetPackage()
    if (!result.ok) throw new Error(`${result.error.code}: ${result.error.message}`)
    if (result.value.outcome === 'published') adopt(await pets.getSnapshot())
    return result.value
  }
  const updatePetPackage = async (petId: string): Promise<PetImportResult> => {
    const result = await pets.updatePetPackage(petId)
    if (!result.ok) throw new Error(`${result.error.code}: ${result.error.message}`)
    if (result.value.outcome === 'published') adopt(await pets.getSnapshot())
    return result.value
  }
  const refreshCatalog = async (): Promise<void> => {
    adopt(await pets.refreshCatalog())
  }
  const openPetFolder = async (): Promise<void> => {
    await pets.openPetFolder()
  }

  ctx.slots.inject('conversation.chat.node', () => ctx.slots.register({
    name: 'conversation.chat.node',
    key: 'pet-command-input',
    locale: NS,
  }, PetCommandInputView))

  const injectSettings = (): PetSettingsInjected => ({
    usePetState,
    onToggleAwake: toggleAwake,
    onRefreshCatalog: refreshCatalog,
    onSelectPet: selectPet,
    onSetSize: setSize,
    onImportPet: importPetPackage,
    onUpdatePet: updatePetPackage,
    onOpenPetFolder: openPetFolder,
  })
  ctx.slots.inject('settings.section', () => ctx.slots.register({
    name: 'settings.section',
    id: 'pet',
    order: 20,
    label: () => t('settings.nav'),
    locale: NS,
    inject: injectSettings,
  }, PetSettingsSection))
}
