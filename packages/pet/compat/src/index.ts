/** Browser-safe Codex-compatible pet package and rendering utilities. */

export { FRAME_AT_SOURCE, frameAt } from './animation.ts'
export { DEFAULT_PET_ANIMATIONS, parsePetPackage } from './manifest.ts'
export {
  PET_NOTIFICATION_SPECS,
  createNotification,
  notificationSpec,
  replaceNotification,
  visibleNotification,
} from './notification.ts'
export { detectTerminalPetProtocol } from './terminal.ts'
export type {
  PetAnimation,
  PetAnimationFrame,
  PetAnimationSelection,
  PetFrameGeometry,
  PetNotification,
  PetNotificationKind,
  PetNotificationSpec,
  PetPackage,
  PetPackageCandidate,
  PetPackageParseResult,
  PetPackageRejectionReason,
  PetSpriteCacheIdentity,
  PetSpritesheetDimensions,
  TerminalPetEnvironment,
  TerminalPetProtocol,
  TerminalPetProtocolResult,
} from './types.ts'

/**
 * Derive a content-and-geometry cache key without hashing filesystem data.
 * @param identity - host-calculated content digest and validated grid geometry.
 * @returns a deterministic frame-cache key.
 */
export function cacheKeyForSprite(identity: import('./types.ts').PetSpriteCacheIdentity): string {
  const { contentDigest, frame } = identity
  return `sha256-${contentDigest}-${frame.width}x${frame.height}-${frame.columns}x${frame.rows}`
}
