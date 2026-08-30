/** Checked-in compatible atlas and Codex-normalized animation tracks used by runtime tests. */

export const COMPAT_SPRITESHEET = Object.freeze({
  width: 1536,
  height: 1872,
  cellWidth: 192,
  cellHeight: 208,
  columns: 8,
  rows: 9,
})

export const COMPAT_ROW_COUNTS = Object.freeze([6, 8, 8, 4, 5, 8, 6, 6, 6])

const IDLE_FRAMES = Object.freeze([
  Object.freeze({ spriteIndex: 0, durationMs: 1680 }),
  Object.freeze({ spriteIndex: 1, durationMs: 660 }),
  Object.freeze({ spriteIndex: 2, durationMs: 660 }),
  Object.freeze({ spriteIndex: 3, durationMs: 840 }),
  Object.freeze({ spriteIndex: 4, durationMs: 840 }),
  Object.freeze({ spriteIndex: 5, durationMs: 1920 }),
])

function appStateFrames(
  row: number,
  count: number,
  durationMs: number,
  finalDurationMs: number,
): readonly { readonly spriteIndex: number; readonly durationMs: number }[] {
  const primary = Array.from({ length: count }, (_, column) => Object.freeze({
    spriteIndex: row * 8 + column,
    durationMs: column === count - 1 ? finalDurationMs : durationMs,
  }))
  return Object.freeze([...primary, ...primary, ...primary, ...IDLE_FRAMES])
}

function appState(
  row: number,
  count: number,
  durationMs: number,
  finalDurationMs: number,
): Readonly<{
  frames: readonly { readonly spriteIndex: number; readonly durationMs: number }[]
  loopStart: number
  fallback: string
}> {
  return Object.freeze({ frames: appStateFrames(row, count, durationMs, finalDurationMs), loopStart: count * 3, fallback: 'idle' })
}

/** Expected normalized defaults derived from Codex's `frames/fps/loop/fallback` defaults. */
export const COMPAT_ANIMATION_FIXTURE = Object.freeze({
  idle: Object.freeze({ frames: IDLE_FRAMES, loopStart: 0, fallback: 'idle' }),
  'running-right': appState(1, 8, 120, 220),
  'running-left': appState(2, 8, 120, 220),
  waving: appState(3, 4, 140, 280),
  jumping: appState(4, 5, 140, 280),
  failed: appState(5, 8, 140, 240),
  waiting: appState(6, 6, 150, 260),
  running: appState(7, 6, 120, 220),
  review: appState(8, 6, 150, 280),
})
