/** Browser-safe pet constants, validation, presentation selection, and timing. */

import { DEFAULT_PET_ANIMATIONS, parsePetPackage } from '@deepseek-ai/dsh-pet-compat'
import { imageDimensionsFromData } from 'image-dimensions'
import type {
  PetActivityStatus,
  PetDescriptor,
  PetHostActivityRecord,
  PetPreference,
} from './types.ts'
import type { PetSessionActivity } from './types.ts'

/** Version of the durable pet preference document. */
export const PET_PREFERENCE_VERSION = 3 as const

/** Built-in identifier selected by a fresh preference document. */
export const DEFAULT_PET_ID = 'deepseek-whale'

/** Default logical CSS height of one compatible atlas cell. */
export const DEFAULT_PET_SIZE_PX = 112

/** Minimum logical CSS height accepted by the pet preference validator. */
export const MIN_PET_SIZE_PX = 80

/** Maximum logical CSS height accepted by the pet preference validator. */
export const MAX_PET_SIZE_PX = 224

/** Compatible atlas geometry owned by the DSH renderer. */
export const PET_COMPAT_ATLAS = Object.freeze({
  width: 1536,
  height: 1872,
  cellWidth: 192,
  cellHeight: 208,
  columns: 8,
  rows: 9,
})

/** Base animation states with cells in rows 0 through 8. */
export type PetAnimationState =
  | 'idle'
  | 'running-right'
  | 'running-left'
  | 'waving'
  | 'jumping'
  | 'failed'
  | 'waiting'
  | 'running'
  | 'review'

/** Horizontal movement direction accepted by the presentation selector. */
export type PetDragDirection = 'left' | 'right'

/** Relative pointer target used for the 16 look-direction bins. */
export interface PetLookTarget {
  /** Horizontal target distance in CSS pixels. */
  readonly x: number
  /** Vertical target distance in CSS pixels. */
  readonly y: number
}

/** Presentation input shared by the browser and Electron renderers. */
export interface PetPresentationInput {
  /** Whether the companion is currently rendered. */
  readonly awake: boolean
  /** Highest-priority host activity, or undefined for idle. */
  readonly status?: PetActivityStatus
  /** Whether the pointer is hovering the companion. */
  readonly hover: boolean
  /** Accepted horizontal drag direction, when the pointer is being dragged. */
  readonly dragDirection?: PetDragDirection
  /** Whether animation timers must be suppressed. */
  readonly reducedMotion: boolean
  /** Relative pointer target for look-direction selection. */
  readonly lookTarget?: PetLookTarget
}

/** Presentation state selected for one renderer update. */
export interface PetPresentation {
  /** Domain-independent state used by CSS and animation lookup. */
  readonly state: PetAnimationState | 'tucked'
  /** Atlas row for the selected state. */
  readonly row: number
  /** First frame column for the selected state. */
  readonly frame: number
  /** One of the sixteen direction-row cells. */
  readonly lookDirection: number
  /** Whether the frame renderer should use the direction rows for this state. */
  readonly lookDirectionActive: boolean
  /** Whether the renderer should schedule future frames. */
  readonly animate: boolean
}

/** Validation limits supplied by the owning host configuration. */
export interface PetPackageValidationOptions {
  /** Optional origin-relative asset URL assigned by the catalog owner. */
  readonly assetUrl?: string
  /** Maximum UTF-8 manifest size. */
  readonly maxManifestBytes?: number
  /** Maximum spritesheet size. */
  readonly maxSpriteBytes?: number
}

/** Validation options that also name the catalog origin recorded on the descriptor. */
export interface PetPackageSourceOptions extends PetPackageValidationOptions {
  /** Origin written verbatim onto the returned descriptor's `source`. */
  readonly source: PetDescriptor['source']
}

/** Stable validation error that callers can diagnose without parsing messages. */
export class PetValidationError extends TypeError {
  /** Machine-readable validation category. */
  readonly code = 'invalid-pet-package'

  constructor(message: string) {
    super(message)
    this.name = 'PetValidationError'
  }
}

/** Numeric status precedence, where lower values are selected first. */
const ACTIVITY_PRIORITY: Readonly<Record<PetSessionActivity['status'], number>> = {
  'needs-input': 0,
  blocked: 1,
  ready: 2,
  running: 3,
}

/**
 * Sort activity records by user-action urgency, then newest state transition,
 * then their stable opaque session ids.
 * @param left - the first activity record.
 * @param right - the second activity record.
 * @returns a standard ascending sort comparison result.
 */
export function comparePetActivities(left: PetSessionActivity, right: PetSessionActivity): number {
  const priority = ACTIVITY_PRIORITY[left.status] - ACTIVITY_PRIORITY[right.status]
  if (priority !== 0) return priority
  if (left.since !== right.since) return right.since - left.since
  return left.sessionId < right.sessionId ? -1 : left.sessionId > right.sessionId ? 1 : 0
}

/** Resolve a missing preference or validate a current preference document.
 * @param value - decoded preference value from the settings provider.
 * @returns the validated v3 preference.
 */
export function resolvePetPreference(value: unknown): PetPreference {
  if (value === undefined || value === null) return defaultPetPreference()
  if (!isRecord(value) || typeof value.version !== 'number') throw new TypeError('pet preference must be an object with a numeric version')
  if (value.version !== PET_PREFERENCE_VERSION) {
    throw new TypeError(`pet preference version ${String(value.version)} is unsupported (expected ${PET_PREFERENCE_VERSION})`)
  }
  return {
    version: PET_PREFERENCE_VERSION,
    selectedPetId: requirePetId(value.selectedPetId),
    awake: requireBoolean(value.awake, 'awake'),
    sizePx: validatePetSize(value.sizePx),
  }
}

/** Return the fresh v3 preference defaults.
 * @returns a new v3 preference document.
 */
export function defaultPetPreference(): PetPreference {
  return { version: PET_PREFERENCE_VERSION, selectedPetId: DEFAULT_PET_ID, awake: true, sizePx: DEFAULT_PET_SIZE_PX }
}

/** Validate one logical CSS height.
 * @param sizePx - candidate logical CSS height.
 * @returns the validated height.
 */
export function validatePetSize(sizePx: unknown): number {
  if (typeof sizePx !== 'number' || !Number.isSafeInteger(sizePx) || sizePx < MIN_PET_SIZE_PX || sizePx > MAX_PET_SIZE_PX) {
    throw new TypeError(`pet preference sizePx must be between ${MIN_PET_SIZE_PX} and ${MAX_PET_SIZE_PX}`)
  }
  return sizePx
}

/** Return true only after pointer movement exceeds the shared four-pixel drag threshold.
 * @param deltaX - horizontal pointer displacement.
 * @param deltaY - vertical pointer displacement.
 * @param threshold - minimum Euclidean displacement.
 * @returns whether the displacement is a drag.
 */
export function isDragMovement(deltaX: number, deltaY: number, threshold = 4): boolean {
  return Number.isFinite(deltaX) && Number.isFinite(deltaY) && Number.isFinite(threshold)
    && threshold >= 0 && Math.hypot(deltaX, deltaY) > threshold
}

/** Derive the logical CSS width from one validated atlas-cell height.
 * @param sizePx - validated logical CSS height.
 * @returns the corresponding logical CSS width.
 */
export function petWidthForSize(sizePx: number): number {
  return Math.round(validatePetSize(sizePx) * PET_COMPAT_ATLAS.cellWidth / PET_COMPAT_ATLAS.cellHeight)
}

/** Pick one of sixteen clockwise look-direction cells from a relative target.
 * @param target - relative pointer target, or `undefined` for neutral direction.
 * @returns a direction index from zero through fifteen.
 */
export function selectLookDirection(target: PetLookTarget | undefined): number {
  if (target === undefined || !Number.isFinite(target.x) || !Number.isFinite(target.y)) return 0
  if (Math.abs(target.x) <= 1 && Math.abs(target.y) <= 1) return 0
  const angle = Math.atan2(target.x, -target.y)
  const normalized = angle < 0 ? angle + Math.PI * 2 : angle
  return Math.floor((normalized + Math.PI / 16) / (Math.PI / 8)) % 16
}

/** Select the state and first frame used to render one presentation update.
 * @param input - current host, pointer, motion, and wake state.
 * @returns the renderer-independent presentation selection.
 */
export function selectPetPresentation(input: PetPresentationInput): PetPresentation {
  const lookDirection = selectLookDirection(input.lookTarget)
  if (!input.awake) return { state: 'tucked', row: 0, frame: 0, lookDirection, lookDirectionActive: false, animate: false }
  let state: PetAnimationState = statusToAnimationState(input.status)
  if (input.hover) state = 'jumping'
  else if (input.status === 'running' && input.dragDirection === 'left') state = 'running-left'
  else if (input.status === 'running' && input.dragDirection === 'right') state = 'running-right'
  const spriteIndex = DEFAULT_PET_ANIMATIONS[state]?.frames[0]?.spriteIndex ?? 0
  return {
    state,
    row: Math.floor(spriteIndex / PET_COMPAT_ATLAS.columns),
    frame: spriteIndex % PET_COMPAT_ATLAS.columns,
    lookDirection,
    lookDirectionActive: false,
    animate: !input.reducedMotion,
  }
}

/** Validate a compatible manifest and its WebP dimensions without Node or filesystem APIs.
 * @param manifestBytes - UTF-8 pet.json bytes.
 * @param spritesheetBytes - WebP atlas bytes.
 * @param options - catalog origin, optional asset URL, and byte limits.
 * @returns a sanitized descriptor suitable for client transport.
 */
export function validatePetPackage(
  manifestBytes: Uint8Array,
  spritesheetBytes: Uint8Array,
  options: PetPackageSourceOptions,
): PetDescriptor {
  return validatePetPackageFiles(manifestBytes, spritesheetBytes, options).descriptor
}

/** Validate package bytes and retain the manifest-relative asset location for host storage.
 * @param manifestBytes - UTF-8 pet.json bytes.
 * @param spritesheetBytes - WebP atlas bytes.
 * @param options - catalog origin, optional asset URL, and byte limits.
 * @returns sanitized client metadata and the validated relative spritesheet path.
 */
export function validatePetPackageFiles(
  manifestBytes: Uint8Array,
  spritesheetBytes: Uint8Array,
  options: PetPackageSourceOptions,
): { readonly descriptor: PetDescriptor; readonly spritesheetPath: string } {
  const maxManifestBytes = options.maxManifestBytes ?? 16 * 1024
  const maxSpriteBytes = options.maxSpriteBytes ?? 16 * 1024 * 1024
  if (!Number.isSafeInteger(maxManifestBytes) || maxManifestBytes <= 0) throw new PetValidationError('manifest byte limit is invalid')
  if (!Number.isSafeInteger(maxSpriteBytes) || maxSpriteBytes <= 0) throw new PetValidationError('spritesheet byte limit is invalid')
  if (manifestBytes.byteLength > maxManifestBytes) throw new PetValidationError('pet manifest exceeds the configured byte limit')
  if (spritesheetBytes.byteLength === 0 || spritesheetBytes.byteLength > maxSpriteBytes) throw new PetValidationError('pet spritesheet exceeds the configured byte limit')
  parseManifest(manifestBytes, { width: PET_COMPAT_ATLAS.width, height: PET_COMPAT_ATLAS.height })
  const dimensions = webpDimensions(spritesheetBytes)
  const pet = parseManifest(manifestBytes, dimensions)
  const assetUrl = options.assetUrl ?? ''
  if (assetUrl !== '' && !isOriginRelativePathname(assetUrl)) throw new PetValidationError('pet assetUrl must be an origin-relative pathname')
  const descriptor = Object.freeze({
    id: pet.id,
    source: options.source,
    displayName: pet.displayName,
    ...(pet.description === '' ? {} : { description: pet.description }),
    frame: pet.frame,
    animations: pet.animations,
    assetUrl,
  })
  return Object.freeze({ descriptor, spritesheetPath: pet.spritesheetPath })
}

/** Resolve the safe relative spritesheet location before reading the image file.
 * @param manifestBytes - bounded UTF-8 pet.json bytes.
 * @returns the manifest-relative spritesheet path.
 */
export function petSpritesheetPath(manifestBytes: Uint8Array): string {
  return parseManifest(manifestBytes, {
    width: PET_COMPAT_ATLAS.width,
    height: PET_COMPAT_ATLAS.height,
  }).spritesheetPath
}

/** Convert a host activity record into the pet's display status.
 * @param record - detached host activity record.
 * @returns the display status, or `undefined` when the record is idle.
 */
export function petStatusForHostActivity(record: PetHostActivityRecord): PetActivityStatus | undefined {
  if (record.pendingInteraction !== undefined) return 'needs-input'
  if (record.status === 'blocked') return 'blocked'
  if (record.completed) return 'ready'
  if (record.status === 'running') return 'running'
  return undefined
}

function statusToAnimationState(status: PetActivityStatus | undefined): PetAnimationState {
  switch (status) {
    case 'needs-input': return 'waiting'
    case 'blocked': return 'failed'
    case 'ready': return 'review'
    case 'running': return 'running'
    default: return 'idle'
  }
}

function requirePetId(value: unknown): string {
  if (typeof value !== 'string' || value.length === 0 || value.length > 64) throw new TypeError('pet preference selectedPetId must be a non-empty string')
  return value
}

function requireBoolean(value: unknown, name: string): boolean {
  if (typeof value !== 'boolean') throw new TypeError(`pet preference ${name} must be boolean`)
  return value
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function webpDimensions(bytes: Uint8Array): { width: number; height: number } {
  assertCompleteWebp(bytes)
  const dimensions = imageDimensionsFromData(bytes)
  if (dimensions?.type !== 'webp') throw new PetValidationError('pet spritesheet must be a valid WebP image')
  return { width: dimensions.width, height: dimensions.height }
}

function assertCompleteWebp(bytes: Uint8Array): void {
  if (bytes.length < 20 || ascii(bytes, 0, 4) !== 'RIFF' || ascii(bytes, 8, 4) !== 'WEBP') {
    throw new PetValidationError('pet spritesheet must be a valid WebP image')
  }
  if (readUint32(bytes, 4) + 8 !== bytes.length) throw new PetValidationError('pet spritesheet must be a valid WebP image')
  let offset = 12
  let hasImagePayload = false
  while (offset + 8 <= bytes.length) {
    const chunk = ascii(bytes, offset, 4)
    const size = readUint32(bytes, offset + 4)
    const data = offset + 8
    if (data + size > bytes.length) throw new PetValidationError('pet spritesheet must be a valid WebP image')
    if (chunk === 'VP8 ' && size >= 10 && (readByte(bytes, data) & 1) === 0
      && bytes[data + 3] === 0x9d && bytes[data + 4] === 0x01 && bytes[data + 5] === 0x2a) hasImagePayload = true
    if (chunk === 'VP8L' && size >= 5 && bytes[data] === 0x2f) hasImagePayload = true
    offset = data + size + (size % 2)
  }
  if (offset !== bytes.length || !hasImagePayload) throw new PetValidationError('pet spritesheet must be a valid WebP image')
}

function parseManifest(manifestBytes: Uint8Array, dimensions: { readonly width: number; readonly height: number }) {
  let value: unknown
  try {
    value = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(manifestBytes))
  } catch {
    throw new PetValidationError('pet manifest must be valid UTF-8 JSON')
  }
  if (!isRecord(value) || Array.isArray(value)) throw new PetValidationError('pet manifest must be a JSON object')
  const allowed = new Set(['id', 'displayName', 'description', 'spritesheetPath', 'frame', 'animations', 'kind', 'spriteVersionNumber'])
  for (const key of Object.keys(value)) if (!allowed.has(key)) throw new PetValidationError(`pet manifest contains unsupported field ${key}`)
  const id = value.id
  if (typeof id !== 'string' || !/^[\p{L}][\p{L}\p{N}._-]{0,63}$/u.test(id)) throw new PetValidationError('pet manifest id is invalid')
  const displayName = value.displayName
  if (typeof displayName !== 'string' || displayName.length === 0 || displayName.length > 80) throw new PetValidationError('pet manifest displayName is invalid')
  const description = value.description
  if (description !== undefined && (typeof description !== 'string' || description.length > 500)) throw new PetValidationError('pet manifest description is invalid')
  const parsed = parsePetPackage({ ...value, spritesheetDimensions: dimensions })
  if (!parsed.accepted) throw new PetValidationError(`pet package is incompatible: ${parsed.reason}`)
  return parsed.pet
}

function ascii(bytes: Uint8Array, offset: number, length: number): string {
  return String.fromCharCode(...bytes.subarray(offset, offset + length))
}

function readUint32(bytes: Uint8Array, offset: number): number {
  return readByte(bytes, offset)
    + (readByte(bytes, offset + 1) << 8)
    + (readByte(bytes, offset + 2) << 16)
    + (readByte(bytes, offset + 3) * 0x1000000)
}

function readByte(bytes: Uint8Array, offset: number): number {
  const value = bytes[offset]
  if (value === undefined) throw new PetValidationError('pet spritesheet has a truncated chunk')
  return value
}

function isOriginRelativePathname(value: string): boolean {
  if (!value.startsWith('/') || value.startsWith('//')) return false
  const parsed = new URL(value, 'http://dsh.local')
  return parsed.origin === 'http://dsh.local' && parsed.pathname === value && parsed.search === '' && parsed.hash === ''
}
