/** Browser transport for the Host-owned same-origin pet JSON API. */

import type { PetFolderResult, PetImportResult, PetSnapshot } from '@luv1211/dsh-pet/client'

const SNAPSHOT_PATH = '/__dsh/pet/api/snapshot'
const ACTION_PATH = '/__dsh/pet/api/action'

type Fetch = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>

export interface PetApi {
  getSnapshot(): Promise<PetSnapshot>
  setAwake(awake: boolean): Promise<PetSnapshot>
  selectPet(petId: string): Promise<PetSnapshot>
  setSize(sizePx: number): Promise<PetSnapshot>
  refreshCatalog(): Promise<PetSnapshot>
  importPetPackage(): Promise<PetImportResult>
  updatePetPackage(petId: string): Promise<PetImportResult>
  openPetFolder(): Promise<PetFolderResult>
}

/** Bind the pet API to a fetch implementation. */
export function createPetApi(fetchImpl: Fetch = fetch): PetApi {
  const action = <Result>(body: object): Promise<Result> => request<Result>(fetchImpl, ACTION_PATH, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
  return {
    getSnapshot: () => request(fetchImpl, SNAPSHOT_PATH),
    setAwake: awake => action({ operation: 'set-awake', awake }),
    selectPet: petId => action({ operation: 'select-pet', petId }),
    setSize: sizePx => action({ operation: 'set-size', sizePx }),
    refreshCatalog: () => action({ operation: 'refresh-catalog' }),
    importPetPackage: () => action({ operation: 'import-pet-package' }),
    updatePetPackage: petId => action({ operation: 'update-pet-package', petId }),
    openPetFolder: () => action({ operation: 'open-pet-folder' }),
  }
}

/** Poll snapshots immediately and at `intervalMs`; failures retain the last accepted value. */
export function startPetSnapshotPolling(
  api: Pick<PetApi, 'getSnapshot'>,
  accept: (snapshot: PetSnapshot) => void,
  intervalMs = 1_000,
): () => void {
  let active = true
  let pending = false
  const poll = async (): Promise<void> => {
    if (!active || pending) return
    pending = true
    try {
      const snapshot = await api.getSnapshot()
      if (active) accept(snapshot)
    } catch {
      // A later poll retries; the store retains its last validated snapshot.
    } finally {
      pending = false
    }
  }
  void poll()
  const timer = setInterval(() => { void poll() }, intervalMs)
  return () => {
    active = false
    clearInterval(timer)
  }
}

async function request<Result>(fetchImpl: Fetch, path: string, init?: RequestInit): Promise<Result> {
  const response = await fetchImpl(path, init)
  if (!response.ok) {
    const failure = await readEnvelope(response)
    if (failure !== undefined && failure.ok === false) throw new Error(`${failure.error.code}: ${failure.error.message}`)
    throw new Error(`Pet API HTTP ${String(response.status)}`)
  }
  const envelope = await readEnvelope(response)
  if (envelope === undefined || envelope.ok !== true || !('value' in envelope)) throw new Error('Pet API returned an invalid response')
  return envelope.value as Result
}

type Envelope =
  | { readonly ok: true; readonly value: unknown }
  | { readonly ok: false; readonly error: { readonly code: string; readonly message: string } }

async function readEnvelope(response: Response): Promise<Envelope | undefined> {
  let value: unknown
  try {
    value = await response.json()
  } catch {
    return undefined
  }
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return undefined
  const record = value as Record<string, unknown>
  if (record.ok === true && Object.hasOwn(record, 'value')) return { ok: true, value: record.value }
  if (record.ok !== false || record.error === null || typeof record.error !== 'object' || Array.isArray(record.error)) return undefined
  const error = record.error as Record<string, unknown>
  if (typeof error.code !== 'string' || typeof error.message !== 'string') return undefined
  return { ok: false, error: { code: error.code, message: error.message } }
}
