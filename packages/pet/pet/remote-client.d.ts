/**
 * Pets Remote client face — hand-maintained pending typert-generator
 * integration. Mirrors the generated remote-client artifact shape: the Host
 * `PetService` methods with positional arguments and `RemoteResult` wraps.
 * The harness integrator mounts the matching runtime contribution through
 * its api-remotes assembly (see the fork's `packages/api/remotes`).
 */
import type {
  RemoteResult,
  TypertRemoteContribution,
} from '@deepseek-ai/dsh-typert-protocol'
import type { PetCatalog, PetFolderResult, PetImportResult, PetSnapshot } from './src/types.ts'

declare module '@deepseek-ai/dsh-typert-protocol' {
  interface TypertRemoteNamespace$70657473 {
    getSnapshot: () => Promise<RemoteResult<PetSnapshot>>
    getCatalog: () => Promise<RemoteResult<PetCatalog>>
    importPetPackage: () => Promise<RemoteResult<PetImportResult>>
    refreshCatalog: () => Promise<RemoteResult<PetSnapshot>>
    updatePetPackage: (petId: string) => Promise<RemoteResult<PetImportResult>>
    openPetFolder: () => Promise<RemoteResult<PetFolderResult>>
    selectPet: (selectedPetId: string) => Promise<RemoteResult<PetSnapshot>>
    setSize: (sizePx: number) => Promise<RemoteResult<PetSnapshot>>
    setAwake: (awake: boolean) => Promise<RemoteResult<PetSnapshot>>
  }
  interface TypertRemoteMap {
    'pets/getSnapshot': () => Promise<RemoteResult<PetSnapshot>>
    'pets/getCatalog': () => Promise<RemoteResult<PetCatalog>>
    'pets/importPetPackage': () => Promise<RemoteResult<PetImportResult>>
    'pets/refreshCatalog': () => Promise<RemoteResult<PetSnapshot>>
    'pets/updatePetPackage': (petId: string) => Promise<RemoteResult<PetImportResult>>
    'pets/openPetFolder': () => Promise<RemoteResult<PetFolderResult>>
    'pets/selectPet': (selectedPetId: string) => Promise<RemoteResult<PetSnapshot>>
    'pets/setSize': (sizePx: number) => Promise<RemoteResult<PetSnapshot>>
    'pets/setAwake': (awake: boolean) => Promise<RemoteResult<PetSnapshot>>
  }
  interface TypertRemoteNamespaceMap {
    'pets': TypertRemoteNamespace$70657473
  }
}

export declare const TYPERT_REMOTE: TypertRemoteContribution
export default TYPERT_REMOTE
