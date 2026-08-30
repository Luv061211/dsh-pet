/**
 * Client-namespace projection of the pet domain: a pure re-export of the
 * package's types outlet. Client code imports ONLY the client namespace
 * (repo discipline), so `./client` projects the same single-source content
 * `./types` serves to host consumers — zero duplication.
 * @module @deepseek-ai/dsh-pet/client
 */

export type * from './types.ts'
export type * from './renderer.ts'
export type { PetAnimationState, PetDragDirection, PetLookTarget, PetPresentation, PetPresentationInput } from './runtime.ts'
export {
  DEFAULT_PET_ID,
  DEFAULT_PET_SIZE_PX,
  MAX_PET_SIZE_PX,
  MIN_PET_SIZE_PX,
  PET_PREFERENCE_VERSION,
  PET_COMPAT_ATLAS,
  PetValidationError,
  comparePetActivities,
  defaultPetPreference,
  isDragMovement,
  petStatusForHostActivity,
  petWidthForSize,
  resolvePetPreference,
  selectLookDirection,
  selectPetPresentation,
  validatePetSize,
  validatePetPackage,
} from './runtime.ts'
export { petSpriteAvatar, petSpriteFrame } from './renderer.ts'
