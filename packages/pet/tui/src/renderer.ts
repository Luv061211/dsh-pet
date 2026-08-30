/** Pure layout and fallback rendering for the terminal pet consumer. */

import { frameAt, notificationSpec, type PetNotification, type PetPackage } from '@luv1211/dsh-pet-compat'
import type {
  PetTuiAnchor,
  PetTuiConfig,
  PetTuiLayout,
  TuiDimensions,
} from './types.ts'

/**
 * Validate the TUI configuration before terminal state is changed.
 * @param value - untrusted configuration value.
 * @returns detached validated configuration.
 */
export function validatePetTuiConfig(value: unknown): PetTuiConfig {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) throw new TypeError('tui pet configuration is invalid')
  const candidate = value as Record<string, unknown>
  if (typeof candidate.pet !== 'boolean') throw new TypeError('tui.pet must be boolean')
  if (candidate.petAnchor !== 'composer' && candidate.petAnchor !== 'screen-bottom') throw new TypeError('tui.pet_anchor is invalid')
  if (typeof candidate.animations !== 'boolean') throw new TypeError('tui.animations must be boolean')
  if (typeof candidate.reserveColumns !== 'number' || !Number.isSafeInteger(candidate.reserveColumns) || candidate.reserveColumns < 0 || candidate.reserveColumns > 16) {
    throw new TypeError('tui.pet reserveColumns must be an integer from 0 through 16')
  }
  if (typeof candidate.imageEnabled !== 'boolean' || typeof candidate.reducedMotion !== 'boolean') {
    throw new TypeError('tui pet capability flags are invalid')
  }
  return Object.freeze({
    pet: candidate.pet,
    petAnchor: candidate.petAnchor,
    animations: candidate.animations,
    reserveColumns: candidate.reserveColumns,
    imageEnabled: candidate.imageEnabled,
    reducedMotion: candidate.reducedMotion,
  })
}

/**
 * Resolve an anchor and reserve columns without writing to a terminal.
 * @param dimensions - terminal dimensions in cells.
 * @param anchor - composer or screen-bottom placement.
 * @param reserveColumns - requested reserved columns.
 * @returns bounded layout coordinates and reservations.
 */
export function petLayout(
  dimensions: TuiDimensions,
  anchor: PetTuiAnchor,
  reserveColumns: number,
): PetTuiLayout {
  assertDimensions(dimensions)
  if (!Number.isSafeInteger(reserveColumns) || reserveColumns < 0) throw new TypeError('pet reserved columns are invalid')
  const reserved = Math.min(dimensions.columns, reserveColumns)
  const x = anchor === 'composer' ? Math.max(0, dimensions.columns - Math.max(1, reserved)) : 0
  const y = Math.max(0, dimensions.rows - 1)
  return Object.freeze({ anchor, x, y, reservedColumns: reserved, reservedRows: 1 })
}

/**
 * Select a frame and expose its terminal placement without scheduling a timer.
 * @param pet - validated package.
 * @param animation - preferred animation name.
 * @param elapsedMs - elapsed time in the selected animation.
 * @param config - animation and reduced-motion switches.
 * @returns selected frame, when the package has the requested animation.
 */
export function selectPetTuiFrame(
  pet: PetPackage,
  animation: string,
  elapsedMs: number,
  config: Pick<PetTuiConfig, 'animations' | 'reducedMotion'>,
): ReturnType<typeof frameAt> {
  return frameAt(pet.animations, animation, config.animations ? elapsedMs : 0, config.reducedMotion || !config.animations)
}

/**
 * Render a deterministic textual marker when graphics are disabled or fail.
 * @param pet - validated package.
 * @param animation - selected animation name.
 * @param spriteIndex - selected atlas cell.
 * @param layout - cursor placement.
 * @param notification - optional visible notification body to include in text fallback.
 * @returns one cursor-positioned text marker.
 */
export function renderPetTextFallback(
  pet: PetPackage,
  animation: string,
  spriteIndex: number,
  layout: PetTuiLayout,
  notification?: PetNotification,
): string {
  const notificationLabel = notification === undefined ? '' : `:${notification.body ?? notificationSpec(notification.kind).fallbackBody}`
  const label = `${pet.displayName}:${animation}:${spriteIndex}${notificationLabel}`.replace(/[\u0000-\u001f\u007f]/gu, '')
  return `\u001b[${layout.y + 1};${layout.x + 1}H[${label}]`
}

/** Keep layout inputs bounded before they reach cursor-position escapes. */
function assertDimensions(value: TuiDimensions): void {
  if (!Number.isSafeInteger(value.columns) || value.columns <= 0 || !Number.isSafeInteger(value.rows) || value.rows <= 0) {
    throw new TypeError('terminal dimensions are invalid')
  }
}
