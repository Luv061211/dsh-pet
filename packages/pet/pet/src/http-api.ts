/** Same-origin JSON transport for the browser pet controls. */

import type { IncomingMessage, ServerResponse } from 'node:http'
import type { PetFolderResult, PetImportResult, PetSnapshot } from './types.ts'

export const PET_API_SNAPSHOT_PATH = '/__dsh/pet/api/snapshot'
export const PET_API_ACTION_PATH = '/__dsh/pet/api/action'
export const PET_API_BODY_LIMIT_BYTES = 4_096

/** Pet operations exposed to the browser transport. */
export interface PetHttpService {
  getSnapshot(): PetSnapshot
  setAwake(awake: boolean): Promise<PetSnapshot>
  selectPet(petId: string): Promise<PetSnapshot>
  setSize(sizePx: number): Promise<PetSnapshot>
  refreshCatalog(): PetSnapshot
  importPetPackage(): Promise<PetImportResult>
  updatePetPackage(petId: string): Promise<PetImportResult>
  openPetFolder(): Promise<PetFolderResult>
}

type PetHttpAction =
  | { readonly operation: 'set-awake'; readonly awake: boolean }
  | { readonly operation: 'select-pet'; readonly petId: string }
  | { readonly operation: 'set-size'; readonly sizePx: number }
  | { readonly operation: 'refresh-catalog' }
  | { readonly operation: 'import-pet-package' }
  | { readonly operation: 'update-pet-package'; readonly petId: string }
  | { readonly operation: 'open-pet-folder' }

class BodyLimitError extends Error {}

/** Serve one request after the owning WebServer routes it to the pet API. */
export async function handlePetHttpRequest(
  service: PetHttpService,
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  const pathname = new URL(req.url ?? '/', 'http://dsh.local').pathname
  if (pathname === PET_API_SNAPSHOT_PATH) {
    if (req.method !== 'GET') return sendError(res, 405, 'method-not-allowed', 'Method not allowed.')
    return sendJson(res, 200, { ok: true, value: service.getSnapshot() })
  }
  if (pathname !== PET_API_ACTION_PATH) return sendError(res, 404, 'not-found', 'Pet API route not found.')
  if (req.method !== 'POST') return sendError(res, 405, 'method-not-allowed', 'Method not allowed.')
  const mediaType = req.headers['content-type']?.split(';', 1)[0]?.trim().toLowerCase()
  if (mediaType !== 'application/json') return sendError(res, 415, 'unsupported-media-type', 'Expected application/json.')

  let action: PetHttpAction
  try {
    action = parseAction(JSON.parse(await readBoundedBody(req, PET_API_BODY_LIMIT_BYTES)))
  } catch (error) {
    if (error instanceof BodyLimitError) return sendError(res, 413, 'body-too-large', 'Pet API request body is too large.')
    return sendError(res, 400, 'invalid-request', 'Pet API request is invalid.')
  }

  try {
    const value = await dispatchAction(service, action)
    sendJson(res, 200, { ok: true, value })
  } catch {
    sendError(res, 400, 'pet-operation-failed', 'Pet operation failed.')
  }
}

function parseAction(value: unknown): PetHttpAction {
  if (!isRecord(value) || typeof value.operation !== 'string') throw new TypeError('action must be an object')
  switch (value.operation) {
    case 'set-awake':
      requireKeys(value, ['operation', 'awake'])
      if (typeof value.awake !== 'boolean') throw new TypeError('awake must be boolean')
      return { operation: value.operation, awake: value.awake }
    case 'select-pet':
    case 'update-pet-package':
      requireKeys(value, ['operation', 'petId'])
      if (typeof value.petId !== 'string' || value.petId.length === 0 || value.petId.length > 64) throw new TypeError('petId is invalid')
      return { operation: value.operation, petId: value.petId }
    case 'set-size':
      requireKeys(value, ['operation', 'sizePx'])
      if (!Number.isSafeInteger(value.sizePx)) throw new TypeError('sizePx is invalid')
      return { operation: value.operation, sizePx: value.sizePx as number }
    case 'refresh-catalog':
    case 'import-pet-package':
    case 'open-pet-folder':
      requireKeys(value, ['operation'])
      return { operation: value.operation }
    default:
      throw new TypeError('operation is unsupported')
  }
}

function dispatchAction(service: PetHttpService, action: PetHttpAction): Promise<unknown> | unknown {
  switch (action.operation) {
    case 'set-awake': return service.setAwake(action.awake)
    case 'select-pet': return service.selectPet(action.petId)
    case 'set-size': return service.setSize(action.sizePx)
    case 'refresh-catalog': return service.refreshCatalog()
    case 'import-pet-package': return service.importPetPackage()
    case 'update-pet-package': return service.updatePetPackage(action.petId)
    case 'open-pet-folder': return service.openPetFolder()
  }
}

function requireKeys(value: Record<string, unknown>, expected: readonly string[]): void {
  const actual = Object.keys(value).sort()
  const wanted = [...expected].sort()
  if (actual.length !== wanted.length || actual.some((key, index) => key !== wanted[index])) throw new TypeError('action fields are invalid')
}

function sendError(res: ServerResponse, status: number, code: string, message: string): void {
  sendJson(res, status, { ok: false, error: { code, message } })
}

function sendJson(res: ServerResponse, status: number, value: unknown): void {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' })
  res.end(JSON.stringify(value))
}

function readBoundedBody(req: IncomingMessage, limitBytes: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    let total = 0
    let overLimit = false
    req.on('data', (chunk: Buffer) => {
      total += chunk.length
      if (total > limitBytes) overLimit = true
      else chunks.push(chunk)
    })
    req.on('end', () => {
      if (overLimit) reject(new BodyLimitError())
      else resolve(Buffer.concat(chunks).toString('utf8'))
    })
    req.on('error', reject)
  })
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}
