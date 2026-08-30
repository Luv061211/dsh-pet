/** Browser-safe parser for the Codex-compatible pet package format. */

import type {
  PetAnimation,
  PetAnimationFrame,
  PetFrameGeometry,
  PetPackageCandidate,
  PetPackageParseResult,
  PetPackageRejectionReason,
  PetSpritesheetDimensions,
} from './types.ts'

const DEFAULT_CELL = Object.freeze({ width: 192, height: 208 })
const DEFAULT_FRAME = Object.freeze({ width: 192, height: 208, columns: 8, rows: 9 })
const MAX_PET_FRAMES = 256
const MAX_ANIMATION_FPS = 60
const DEFAULT_ANIMATION_FPS = 8

/**
 * Parse host-normalized manifest data without reading files or decoding image bytes.
 * @param candidate - JSON-compatible manifest fields plus host-decoded dimensions.
 * @returns a resolved package or a stable rejection reason.
 */
export function parsePetPackage(candidate: unknown): PetPackageParseResult {
  if (!isRecord(candidate)) return rejected('manifest-not-object')
  const input = candidate as PetPackageCandidate
  const id = parseId(input.id)
  if (id === undefined) return rejected('manifest-id-invalid')
  const displayName = parseDisplayName(input.displayName, id)
  if (displayName === undefined) return rejected('manifest-display-name-invalid')
  const spritesheetPath = parseSpritesheetPath(input.spritesheetPath, input.spritesheetPathKind)
  if (spritesheetPath === undefined) return rejected('spritesheet-path-outside-pet-directory')
  const dimensions = parseDimensions(input.spritesheetDimensions)
  if (
    dimensions === undefined
    || dimensions.width % DEFAULT_CELL.width !== 0
    || dimensions.height % DEFAULT_CELL.height !== 0
  ) {
    return rejected('spritesheet-dimensions-invalid')
  }
  const columns = dimensions.width / DEFAULT_CELL.width
  const rows = dimensions.height / DEFAULT_CELL.height
  const explicitFrame = input.frame === undefined ? undefined : parseFrame(input.frame)
  if (input.frame !== undefined && explicitFrame === undefined) return rejected('frame-geometry-not-codex-compatible')
  if (explicitFrame !== undefined) {
    if (explicitFrame.width !== DEFAULT_CELL.width || explicitFrame.height !== DEFAULT_CELL.height) {
      return rejected('frame-geometry-not-codex-compatible')
    }
    if (explicitFrame.columns !== columns || explicitFrame.rows !== rows) return rejected('frame-grid-does-not-cover-spritesheet')
  }
  const frame = explicitFrame ?? Object.freeze({ width: DEFAULT_CELL.width, height: DEFAULT_CELL.height, columns, rows })
  const frameCount = frame.columns * frame.rows
  if (frameCount > MAX_PET_FRAMES) return rejected('frame-count-exceeds-maximum')
  const animations = parseAnimations(input.animations, frameCount)
  if (!animations.accepted) return animations
  return {
    accepted: true,
    pet: Object.freeze({
      id,
      displayName,
      description: parseDescription(input.description),
      spritesheetPath,
      frame: Object.freeze(frame),
      frameCount,
      animations: animations.value,
    }),
  }
}

function parseId(value: unknown): string | undefined {
  if (value === undefined) return 'pet'
  if (typeof value !== 'string') return undefined
  const id = value.trim()
  return id.length === 0 ? undefined : id
}

function parseDisplayName(value: unknown, fallback: string): string | undefined {
  if (value === undefined) return fallback
  if (typeof value !== 'string') return undefined
  const name = value.trim()
  return name.length === 0 ? fallback : name
}

function parseDescription(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function parseSpritesheetPath(value: unknown, kind: unknown): string | undefined {
  if (kind === 'absolute') return undefined
  if (value !== undefined && typeof value !== 'string') return undefined
  const path = (value ?? 'spritesheet.webp').trim()
  if (path.length === 0) return 'spritesheet.webp'
  const components = path.split(/[\\/]+/)
  if (path.startsWith('/') || path.startsWith('\\') || /^[A-Za-z]:/.test(path) || path.includes(':') || components.includes('..')) return undefined
  return path
}

function parseDimensions(value: unknown): PetSpritesheetDimensions | undefined {
  if (!isRecord(value) || !isPositiveInteger(value.width) || !isPositiveInteger(value.height)) return undefined
  return { width: value.width, height: value.height }
}

function parseFrame(value: unknown): PetFrameGeometry | undefined {
  if (value === undefined) return { ...DEFAULT_FRAME }
  if (
    !isRecord(value)
    || !isPositiveInteger(value.width)
    || !isPositiveInteger(value.height)
    || !isPositiveInteger(value.columns)
    || !isPositiveInteger(value.rows)
  ) return undefined
  return { width: value.width, height: value.height, columns: value.columns, rows: value.rows }
}

function parseAnimations(
  value: unknown,
  frameCount: number,
):
  | { readonly accepted: true; readonly value: Readonly<Record<string, PetAnimation>> }
  | { readonly accepted: false; readonly reason: PetPackageRejectionReason } {
  if (value !== undefined && !isRecord(value)) return rejected('animation-invalid')
  const animations: Record<string, PetAnimation> = { ...DEFAULT_PET_ANIMATIONS }
  if (value !== undefined) {
    for (const [name, specification] of Object.entries(value)) {
      const animation = parseAnimation(specification)
      if (animation === undefined) return rejected('animation-invalid')
      animations[name] = animation
    }
  }
  for (const animation of Object.values(animations)) {
    if (animation.frames.some(frame => frame.spriteIndex >= frameCount)) return rejected('animation-frame-out-of-range')
    if (animations[animation.fallback] === undefined) return rejected('animation-fallback-missing')
  }
  return { accepted: true, value: Object.freeze(animations) }
}

function parseAnimation(value: unknown): PetAnimation | undefined {
  if (!isRecord(value) || !Array.isArray(value.frames) || value.frames.length === 0) return undefined
  if (value.fps !== undefined && (!isFinitePositiveNumber(value.fps) || value.fps > MAX_ANIMATION_FPS)) return undefined
  if (value.loop !== undefined && typeof value.loop !== 'boolean') return undefined
  if (value.fallback !== undefined && typeof value.fallback !== 'string') return undefined
  const frames: PetAnimationFrame[] = []
  for (const spriteIndex of value.frames) {
    if (!isNonNegativeInteger(spriteIndex)) return undefined
    frames.push(Object.freeze({ spriteIndex, durationMs: 1000 / (value.fps ?? DEFAULT_ANIMATION_FPS) }))
  }
  return Object.freeze({
    frames: Object.freeze(frames),
    loopStart: (value.loop ?? true) ? 0 : null,
    fallback: value.fallback === undefined || value.fallback.length === 0 ? 'idle' : value.fallback,
  })
}

function defaultAnimations(): Record<string, PetAnimation> {
  const idle = animationFromDurations([[0, 1680], [1, 660], [2, 660], [3, 840], [4, 840], [5, 1920]], 0)
  return {
    idle,
    'running-right': appStateAnimation(1, 8, 120, 220, idle),
    'running-left': appStateAnimation(2, 8, 120, 220, idle),
    waving: appStateAnimation(3, 4, 140, 280, idle),
    jumping: appStateAnimation(4, 5, 140, 280, idle),
    failed: appStateAnimation(5, 8, 140, 240, idle),
    waiting: appStateAnimation(6, 6, 150, 260, idle),
    running: appStateAnimation(7, 6, 120, 220, idle),
    review: appStateAnimation(8, 6, 150, 280, idle),
    move_right: appStateAnimation(1, 8, 120, 220, idle),
    move_left: appStateAnimation(2, 8, 120, 220, idle),
    wave: appStateAnimation(3, 4, 140, 280, idle),
    bounce: appStateAnimation(4, 5, 140, 280, idle),
    sad: appStateAnimation(5, 8, 140, 240, idle),
  }
}

/**
 * Codex-compatible default animation tracks used when a manifest omits a track.
 * The values are normalized from the manifest vocabulary into per-frame timing
 * and loop-start metadata shared by every DSH renderer.
 */
export const DEFAULT_PET_ANIMATIONS: Readonly<Record<string, PetAnimation>> = Object.freeze(defaultAnimations())

function appStateAnimation(
  row: number,
  count: number,
  durationMs: number,
  finalDurationMs: number,
  idle: PetAnimation,
): PetAnimation {
  const primary = Array.from(
    { length: count },
    (_, column) => [row * DEFAULT_FRAME.columns + column, column === count - 1 ? finalDurationMs : durationMs] as const,
  )
  const repeated = [...primary, ...primary, ...primary]
  return animationFromDurations([...repeated, ...idle.frames.map(frame => [frame.spriteIndex, frame.durationMs] as const)], repeated.length)
}

function animationFromDurations(frames: readonly (readonly [number, number])[], loopStart: number): PetAnimation {
  return Object.freeze({
    frames: Object.freeze(frames.map(([spriteIndex, durationMs]) => Object.freeze({ spriteIndex, durationMs }))),
    loopStart,
    fallback: 'idle',
  })
}

function rejected(reason: PetPackageRejectionReason): { readonly accepted: false; readonly reason: PetPackageRejectionReason } {
  return { accepted: false, reason }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function isPositiveInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0
}

function isNonNegativeInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0
}

function isFinitePositiveNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0
}
