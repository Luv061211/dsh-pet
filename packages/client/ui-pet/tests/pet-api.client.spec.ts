import { afterEach, describe, expect, it, vi } from 'vitest'
import { createPetApi, startPetSnapshotPolling } from '../src/client/pet-api.ts'
import type { PetSnapshot } from '@luv1211/dsh-pet/client'

const snapshot: PetSnapshot = {
  preference: { version: 3, selectedPetId: 'deepseek-whale', awake: true, sizePx: 112 },
  catalog: { pets: [] }, petRoot: 'C:/pets',
  capabilities: { canImport: false, canOpenFolder: false }, activities: [],
}

afterEach(() => { vi.useRealTimers() })

describe('pet browser API', () => {
  it('reads the snapshot and sends every closed action', async () => {
    const fetchImpl = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      const value = init === undefined ? snapshot : JSON.parse(String(init.body))
      return new Response(JSON.stringify({ ok: true, value }), { status: 200, headers: { 'content-type': 'application/json' } })
    })
    const api = createPetApi(fetchImpl)

    await expect(api.getSnapshot()).resolves.toEqual(snapshot)
    await api.setAwake(false)
    await api.selectPet('whale')
    await api.setSize(144)
    await api.refreshCatalog()
    await api.importPetPackage()
    await api.updatePetPackage('otter')
    await api.openPetFolder()

    expect(fetchImpl.mock.calls.map(([, init]) => init === undefined ? undefined : JSON.parse(String(init.body)))).toEqual([
      undefined,
      { operation: 'set-awake', awake: false },
      { operation: 'select-pet', petId: 'whale' },
      { operation: 'set-size', sizePx: 144 },
      { operation: 'refresh-catalog' },
      { operation: 'import-pet-package' },
      { operation: 'update-pet-package', petId: 'otter' },
      { operation: 'open-pet-folder' },
    ])
  })

  it('rejects HTTP, protocol, and operation failures', async () => {
    const responses = [
      new Response('no', { status: 500 }),
      new Response('{}', { status: 200 }),
      new Response(JSON.stringify({ ok: false, error: { code: 'denied', message: 'Denied.' } }), { status: 400 }),
    ]
    const api = createPetApi(vi.fn(async () => responses.shift() as Response))
    await expect(api.getSnapshot()).rejects.toThrow('HTTP 500')
    await expect(api.getSnapshot()).rejects.toThrow('invalid response')
    await expect(api.setAwake(false)).rejects.toThrow('denied: Denied.')
  })

  it('polls immediately, retains the last value across failure, and stops cleanly', async () => {
    vi.useFakeTimers()
    const getSnapshot = vi.fn()
      .mockResolvedValueOnce(snapshot)
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce({ ...snapshot, preference: { ...snapshot.preference, awake: false } })
    const accept = vi.fn()
    const stop = startPetSnapshotPolling({ getSnapshot }, accept, 1_000)

    await vi.advanceTimersByTimeAsync(0)
    expect(accept).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(1_000)
    expect(accept).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(1_000)
    expect(accept).toHaveBeenLastCalledWith(expect.objectContaining({ preference: expect.objectContaining({ awake: false }) }))

    stop()
    await vi.advanceTimersByTimeAsync(2_000)
    expect(getSnapshot).toHaveBeenCalledTimes(3)
  })
})
