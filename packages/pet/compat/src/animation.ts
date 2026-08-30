/** Pure frame scheduling for pet animation tracks. */

import type { PetAnimation, PetAnimationSelection } from './types.ts'

/**
 * Select a sprite frame without scheduling timers or accessing a clock.
 * @param animations - committed named animation tracks.
 * @param animationName - preferred track name.
 * @param elapsedMs - milliseconds since the current animation began.
 * @param reducedMotion - whether to hold the first preferred frame.
 * @returns the selected frame, or undefined when no track is available.
 */
export function frameAt(
  animations: Readonly<Record<string, PetAnimation>>,
  animationName: string,
  elapsedMs: number,
  reducedMotion: boolean,
): PetAnimationSelection | undefined {
  function selectFrame(
    tracks: Readonly<Record<string, PetAnimation>>,
    name: string,
    elapsed: number,
    holdFirstFrame: boolean,
    visited: ReadonlySet<string>,
  ): PetAnimationSelection | undefined {
    const animation = tracks[name]
    if (animation === undefined || animation.frames.length === 0) return undefined
    const first = animation.frames[0]
    if (first === undefined) return undefined
    if (holdFirstFrame) return { animation: name, spriteIndex: first.spriteIndex }
    const safeElapsed = Math.max(0, Number.isFinite(elapsed) ? elapsed : 0)
    const totalDurationMs = animation.frames.reduce((total, frame) => total + frame.durationMs, 0)
    if (animation.loopStart === null && safeElapsed >= totalDurationMs && !visited.has(name) && animation.fallback !== name) {
      const nextVisited = new Set(visited)
      nextVisited.add(name)
      const fallback = selectFrame(tracks, animation.fallback, safeElapsed, false, nextVisited)
      if (fallback !== undefined) return fallback
    }
    const loopStart = animation.loopStart
    let effectiveElapsed = safeElapsed
    if (loopStart !== null && loopStart >= 0 && loopStart < animation.frames.length && safeElapsed >= totalDurationMs) {
      const prefixDurationMs = animation.frames.slice(0, loopStart).reduce((total, frame) => total + frame.durationMs, 0)
      const loopDurationMs = animation.frames.slice(loopStart).reduce((total, frame) => total + frame.durationMs, 0)
      if (loopDurationMs > 0) effectiveElapsed = prefixDurationMs + (safeElapsed - prefixDurationMs) % loopDurationMs
    }
    let remaining = effectiveElapsed
    for (const frame of animation.frames) {
      if (remaining < frame.durationMs) {
        return {
          animation: name,
          spriteIndex: frame.spriteIndex,
          ...(animation.frames.length <= 1 ? {} : { nextFrameInMs: frame.durationMs - remaining }),
        }
      }
      remaining -= frame.durationMs
    }
    const last = animation.frames.at(-1)
    if (last === undefined) return undefined
    return { animation: name, spriteIndex: last.spriteIndex }
  }

  const resolvedName = animations[animationName] === undefined ? 'idle' : animationName
  return selectFrame(animations, resolvedName, elapsedMs, reducedMotion, new Set())
}

/**
 * Self-contained browser source for the shared frame selector.
 *
 * The Electron overlay is an inline document, so it cannot import an ESM
 * module at runtime. Keeping this source derived from `frameAt` prevents the
 * inline renderer from carrying a second animation algorithm.
 */
/** Serialize the selector without bundler-only name helpers for inline documents. */
export const FRAME_AT_SOURCE = `(${frameAt.toString().replace(/\s*__name\([^;]*\);\s*/g, '')})`
