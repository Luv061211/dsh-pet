/** Browser-safe sprite frame projection shared by Web and desktop documents. */

import { DEFAULT_PET_ANIMATIONS, frameAt } from '@luv1211/dsh-pet-compat'
import {
  PET_COMPAT_ATLAS,
  petWidthForSize,
  type PetAnimationState,
  type PetPresentation,
} from './runtime.ts'
import type { PetAnimation } from '@luv1211/dsh-pet-compat'

/** One CSS frame projection for the validated compatible atlas. */
export interface PetSpriteFrameStyle {
  /** Logical CSS width of one atlas cell. */
  readonly width: number
  /** Logical CSS height of one atlas cell. */
  readonly height: number
  /** Origin-relative or otherwise validated sprite URL supplied by the caller. */
  readonly backgroundImage: string
  /** CSS pixel offset of the selected atlas cell. */
  readonly backgroundPosition: string
  /** Full atlas size in logical CSS pixels. */
  readonly backgroundSize: string
}

/** Resolve one elapsed presentation into a frame and CSS background projection.
 * @param assetUrl - validated origin-relative sprite URL.
 * @param sizePx - validated logical CSS cell height.
 * @param presentation - renderer state selected for this update.
 * @param elapsedMs - elapsed time since the selected state began.
 * @param animations - validated package animation tracks, when available.
 * @returns the selected atlas cell and its CSS background projection.
 */
export function petSpriteFrame(
  assetUrl: string,
  sizePx: number,
  presentation: PetPresentation,
  elapsedMs: number,
  animations?: Readonly<Record<string, PetAnimation>>,
): { frame: { state: PetAnimationState; row: number; column: number; done: boolean }; style: PetSpriteFrameStyle } {
  const frame = presentation.state === 'tucked'
    ? { state: 'idle' as const, row: 0, column: 0, done: true }
    : (() => {
      const selection = frameAt(animations ?? DEFAULT_PET_ANIMATIONS, presentation.state, elapsedMs, !presentation.animate)
      const spriteIndex = selection?.spriteIndex ?? 0
      return {
        state: presentation.state,
        row: Math.floor(spriteIndex / PET_COMPAT_ATLAS.columns),
        column: spriteIndex % PET_COMPAT_ATLAS.columns,
        done: selection?.animation === 'idle' && presentation.state !== 'idle',
      }
    })()
  const width = petWidthForSize(sizePx)
  return {
    frame,
    style: {
      width,
      height: sizePx,
      backgroundImage: `url(${assetUrl})`,
      backgroundPosition: `${-frame.column * width}px ${-frame.row * sizePx}px`,
      backgroundSize: `${petWidthForSize(sizePx) * PET_COMPAT_ATLAS.columns}px ${sizePx * PET_COMPAT_ATLAS.rows}px`,
    },
  }
}

/** Resolve the static first atlas cell into a CSS background projection at any display height.
 * Unlike {@link petSpriteFrame} this projection is decoupled from the validated overlay size range,
 * so fixed-size list avatars can render smaller than the wake-state minimum.
 * @param assetUrl - validated origin-relative sprite URL.
 * @param heightPx - display cell height in CSS pixels, chosen by the caller.
 * @returns the frame-zero cell and its CSS background projection.
 */
export function petSpriteAvatar(assetUrl: string, heightPx: number): PetSpriteFrameStyle {
  const width = Math.round(heightPx * PET_COMPAT_ATLAS.cellWidth / PET_COMPAT_ATLAS.cellHeight)
  return {
    width,
    height: heightPx,
    backgroundImage: `url(${assetUrl})`,
    backgroundPosition: '0px 0px',
    backgroundSize: `${width * PET_COMPAT_ATLAS.columns}px ${heightPx * PET_COMPAT_ATLAS.rows}px`,
  }
}
