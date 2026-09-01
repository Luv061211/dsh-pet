import { createServer, type Server } from 'node:http'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { handlePetHttpRequest, PET_API_ACTION_PATH, PET_API_SNAPSHOT_PATH } from '../src/http-api.ts'
import type { PetSnapshot } from '../src/types.ts'

const snapshot: PetSnapshot = {
  preference: { version: 3, selectedPetId: 'deepseek-whale', awake: true, sizePx: 112 },
  catalog: { pets: [] },
  petRoot: 'C:/pets',
  capabilities: { canImport: true, canOpenFolder: true },
  activities: [],
}

function service() {
  return {
    getSnapshot: vi.fn(() => snapshot),
    setAwake: vi.fn(async () => snapshot),
    selectPet: vi.fn(async () => snapshot),
    setSize: vi.fn(async () => snapshot),
    refreshCatalog: vi.fn(() => snapshot),
    importPetPackage: vi.fn(async () => ({ outcome: 'cancelled' as const })),
    updatePetPackage: vi.fn(async () => ({ outcome: 'host-unavailable' as const })),
    openPetFolder: vi.fn(async () => ({ outcome: 'opened' as const })),
  }
}

const servers: Server[] = []

afterEach(async () => {
  await Promise.all(servers.splice(0).map(server => new Promise<void>((resolve, reject) => {
    server.close(error => { if (error === undefined) resolve(); else reject(error) })
  })))
})

async function endpoint(api = service()): Promise<{ base: string; api: ReturnType<typeof service> }> {
  const server = createServer((req, res) => { void handlePetHttpRequest(api, req, res) })
  servers.push(server)
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  const address = server.address()
  if (address === null || typeof address === 'string') throw new Error('test server has no TCP address')
  return { base: `http://127.0.0.1:${address.port}`, api }
}

describe('pet HTTP API', () => {
  it('serves the current snapshot only from the snapshot GET route', async () => {
    const { base, api } = await endpoint()
    const response = await fetch(base + PET_API_SNAPSHOT_PATH)
    expect(response.status).toBe(200)
    expect(response.headers.get('cache-control')).toBe('no-store')
    await expect(response.json()).resolves.toEqual({ ok: true, value: snapshot })
    expect(api.getSnapshot).toHaveBeenCalledOnce()

    expect((await fetch(base + PET_API_SNAPSHOT_PATH, { method: 'POST' })).status).toBe(405)
  })

  it.each([
    [{ operation: 'set-awake', awake: false }, 'setAwake', [false]],
    [{ operation: 'select-pet', petId: 'deepseek-whale' }, 'selectPet', ['deepseek-whale']],
    [{ operation: 'set-size', sizePx: 144 }, 'setSize', [144]],
    [{ operation: 'refresh-catalog' }, 'refreshCatalog', []],
    [{ operation: 'import-pet-package' }, 'importPetPackage', []],
    [{ operation: 'update-pet-package', petId: 'quiet-otter' }, 'updatePetPackage', ['quiet-otter']],
    [{ operation: 'open-pet-folder' }, 'openPetFolder', []],
  ] as const)('dispatches the closed action %j', async (body, method, args) => {
    const { base, api } = await endpoint()
    const response = await fetch(base + PET_API_ACTION_PATH, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    })
    expect(response.status).toBe(200)
    expect(api[method]).toHaveBeenCalledWith(...args)
    expect(await response.json()).toHaveProperty('ok', true)
  })

  it('rejects requests before dispatch when transport input is invalid', async () => {
    const { base, api } = await endpoint()
    const cases: RequestInit[] = [
      { method: 'GET' },
      { method: 'POST', headers: { 'content-type': 'text/plain' }, body: '{}' },
      { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{' },
      { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{"operation":"set-awake","awake":false,"extra":1}' },
      { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{"operation":"set-size","sizePx":"large"}' },
      { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ operation: 'set-awake', awake: false, padding: 'x'.repeat(5_000) }) },
    ]
    const expected = [405, 415, 400, 400, 400, 413]
    for (const [index, init] of cases.entries()) {
      expect((await fetch(base + PET_API_ACTION_PATH, init)).status).toBe(expected[index])
    }
    expect(api.setAwake).not.toHaveBeenCalled()
    expect(api.setSize).not.toHaveBeenCalled()
  })

  it('returns a stable failure without exposing a domain stack', async () => {
    const api = service()
    api.setSize.mockRejectedValueOnce(new Error('private stack detail'))
    const { base } = await endpoint(api)
    const response = await fetch(base + PET_API_ACTION_PATH, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ operation: 'set-size', sizePx: 144 }),
    })
    expect(response.status).toBe(400)
    expect(await response.json()).toEqual({ ok: false, error: { code: 'pet-operation-failed', message: 'Pet operation failed.' } })
  })
})
