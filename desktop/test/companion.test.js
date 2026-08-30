'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const {
  advanceCompanionDrag,
  advanceDragState,
  clampCompanionBounds,
  createDragState,
  dragDirectionForDelta,
  isDragMovement,
  normalizePlacementDocument,
  parseCompanionDescriptor,
  placementEntryForBounds,
  resizeCompanionBounds,
  restoreCompanionPlacement,
} = require('../src/companion.js')

test('accepts a descriptor hosted by the local Harness origin', () => {
  assert.deepEqual(parseCompanionDescriptor(JSON.stringify({
    id: 'pet', entryPath: '/__dsh/pet/overlay', width: 192, height: 208,
  }), 'http://127.0.0.1:3080'), {
    id: 'pet', entryUrl: 'http://127.0.0.1:3080/__dsh/pet/overlay', width: 192, height: 208,
  })
})

test('rejects a remote or malformed companion descriptor', () => {
  assert.throws(() => parseCompanionDescriptor(JSON.stringify({
    id: 'pet', entryPath: 'https://example.test/pet', width: 192, height: 208,
  }), 'http://127.0.0.1:3080'), /origin-relative pathname/)
  assert.throws(() => parseCompanionDescriptor('{', 'http://127.0.0.1:3080'), /valid JSON object/)
})

test('clamps a companion window into its display work area', () => {
  assert.deepEqual(clampCompanionBounds({ x: -99, y: 9999 }, { x: 0, y: 0, width: 1000, height: 800 }, 192, 208), {
    x: 0, y: 592, width: 192, height: 208,
  })
})

test('parses generic companion capabilities and preserves legacy descriptors', () => {
  assert.deepEqual(parseCompanionDescriptor(JSON.stringify({
    id: 'pet', entryPath: '/__dsh/pet/overlay', width: 192, height: 208,
    capabilities: {
      drag: true,
      pointerInteraction: true,
      resize: { minWidth: 128, maxWidth: 256, minHeight: 128, maxHeight: 256 },
    },
  }), 'http://127.0.0.1:3080').capabilities, {
    drag: true,
    pointerInteraction: true,
    resize: { minWidth: 128, maxWidth: 256, minHeight: 128, maxHeight: 256 },
  })
  assert.equal(parseCompanionDescriptor(JSON.stringify({
    id: 'pet', entryPath: '/__dsh/pet/overlay', width: 192, height: 208,
  }), 'http://127.0.0.1:3080').capabilities, undefined)
})

test('classifies clicks and ignores stale drag sequences', () => {
  const state = createDragState({
    dragId: 'drag-1', pointerId: 7, screen: { x: 110, y: 220 },
    origin: { x: 100, y: 200 }, size: { width: 192, height: 208 },
  })
  assert.equal(isDragMovement(2, 2), false)
  assert.equal(isDragMovement(5, 0), true)
  assert.equal(dragDirectionForDelta(-5), 'left')
  const moved = advanceDragState(state, { pointerId: 7, sequence: 2, screen: { x: 120, y: 230 } })
  assert.equal(moved.accepted, true)
  assert.equal(moved.direction, 'right')
  assert.deepEqual(moved.state.lastScreen, { x: 120, y: 230 })
  const stale = advanceDragState(moved.state, { pointerId: 7, sequence: 1, screen: { x: 90, y: 230 } })
  assert.equal(stale.accepted, false)
  assert.deepEqual(stale.state.lastScreen, { x: 120, y: 230 })
  const duplicate = advanceDragState(moved.state, { pointerId: 7, sequence: 2, screen: { x: 999, y: 999 } })
  assert.equal(duplicate.accepted, false)
  assert.deepEqual(duplicate.state.lastScreen, { x: 120, y: 230 })
})

test('a drag sample moves the window by the pointer delta from the previous sample', () => {
  const workArea = { x: 0, y: 0, width: 1000, height: 800 }
  const start = createDragState({
    dragId: 'drag-2', pointerId: 7, screen: { x: 110, y: 220 },
    origin: { x: 100, y: 200 }, size: { width: 192, height: 208 },
  })
  const first = advanceCompanionDrag(
    start,
    { pointerId: 7, sequence: 1, screen: { x: 140, y: 190 } },
    workArea,
  )
  assert.equal(first.accepted, true)
  assert.equal(first.direction, 'right')
  assert.deepEqual(first.bounds, { x: 130, y: 170, width: 192, height: 208 })
  const second = advanceCompanionDrag(
    first.state,
    { pointerId: 7, sequence: 2, screen: { x: 135, y: 185 } },
    workArea,
  )
  assert.deepEqual(second.bounds, { x: 125, y: 165, width: 192, height: 208 })
})

test('a rejected drag sample keeps the state and the current rectangle unchanged', () => {
  const workArea = { x: 0, y: 0, width: 1000, height: 800 }
  const start = createDragState({
    dragId: 'drag-2', pointerId: 7, screen: { x: 110, y: 220 },
    origin: { x: 100, y: 200 }, size: { width: 192, height: 208 },
  })
  const stale = advanceCompanionDrag(
    advanceCompanionDrag(start, { pointerId: 7, sequence: 3, screen: { x: 120, y: 220 } }, workArea).state,
    { pointerId: 7, sequence: 1, screen: { x: 900, y: 900 } },
    workArea,
  )
  assert.equal(stale.accepted, false)
  assert.deepEqual(stale.bounds, { x: 110, y: 200, width: 192, height: 208 })
})

test('drag movement clamps into the work area', () => {
  const workArea = { x: 0, y: 0, width: 1000, height: 800 }
  const start = createDragState({
    dragId: 'drag-4', pointerId: 2, screen: { x: 500, y: 400 },
    origin: { x: 400, y: 300 }, size: { width: 192, height: 208 },
  })
  const moved = advanceCompanionDrag(
    start,
    { pointerId: 2, sequence: 1, screen: { x: -50, y: 90_000 } },
    workArea,
  )
  assert.deepEqual(moved.bounds, { x: 0, y: 592, width: 192, height: 208 })
})

test('applies the observed four-CSS-pixel drag displacement', () => {
  const start = createDragState({
    dragId: 'codex-observed-drag', pointerId: 9, screen: { x: 113, y: 109 },
    origin: { x: 12, y: 0 }, size: { width: 202, height: 219 },
  })
  const moved = advanceCompanionDrag(
    start,
    { pointerId: 9, sequence: 1, screen: { x: 117, y: 109 } },
    { x: 0, y: 0, width: 1920, height: 1080 },
  )
  assert.equal(moved.accepted, true)
  assert.deepEqual(moved.bounds, { x: 16, y: 0, width: 202, height: 219 })
})

test('long upward drag accumulates no vertical drift', () => {
  // Drive the same per-sample loop the main process runs through the shared
  // production function. After many steps the window must sit exactly at the
  // initial position plus the total pointer displacement.
  const workArea = { x: 0, y: 0, width: 1000, height: 800 }
  let state = createDragState({
    dragId: 'drag-3', pointerId: 4, screen: { x: 500, y: 600 },
    origin: { x: 400, y: 500 }, size: { width: 192, height: 208 },
  })
  let bounds = { x: 400, y: 500, width: 192, height: 208 }
  let totalDeltaY = 0
  for (let step = 1; step <= 100; step++) {
    const advanced = advanceCompanionDrag(state, {
      pointerId: 4, sequence: step, screen: { x: 500 - step * 2, y: 600 - step * 3 },
    }, workArea)
    assert.equal(advanced.accepted, true)
    totalDeltaY += -3
    bounds = advanced.bounds
    state = advanced.state
  }
  assert.equal(bounds.y, 500 + totalDeltaY)
  assert.ok(bounds.y < 500, 'window moved up across the drag')
})

test('drag holds the grab-time size when the authoritative rectangle drifts', () => {
  // Windows fractional-scale displays can report a size one pixel larger per
  // setBounds round-trip. A drag that adopted the reported size would compound
  // the drift through the work-area clamp: the growing height lowers maxY and
  // creeps the window to the top edge. The session must keep its grab-time
  // size no matter what the live rectangle reports.
  const workArea = { x: 0, y: 0, width: 1000, height: 800 }
  let state = createDragState({
    dragId: 'drag-5', pointerId: 3, screen: { x: 500, y: 600 },
    origin: { x: 400, y: 500 }, size: { width: 192, height: 208 },
  })
  let live = { x: 400, y: 500, width: 192, height: 208 }
  for (let step = 1; step <= 100; step++) {
    const advanced = advanceCompanionDrag(state, {
      pointerId: 3, sequence: step, screen: { x: 500, y: 600 - step },
    }, workArea)
    assert.equal(advanced.accepted, true)
    assert.equal(advanced.bounds.width, 192)
    assert.equal(advanced.bounds.height, 208)
    live = { x: advanced.bounds.x, y: advanced.bounds.y, width: live.width + 1, height: live.height + 1 }
    state = advanced.state
  }
  assert.equal(live.y, 400)
})

test('fractional-scale tremor cannot ratchet the window away from the pointer', () => {
  // At 150% Windows scaling a real hand produces integer physical-pixel moves,
  // so every per-sample DIP delta carries a one-third fraction (1 phys px =
  // 0.667 DIP). Truncating each sample's target discarded those fractions
  // one-sidedly, and a hand that only trembled in place ratcheted the window
  // toward the screen origin at up to a pixel per sample. The session-owned
  // exact position must carry the sub-pixel remainder so the grab offset
  // stays within one pixel of its grab-time value.
  const workArea = { x: 0, y: 0, width: 1707, height: 1019 }
  const scale = 1.5
  const physical = { x: 853, y: 509 }
  const grabScreen = { x: physical.x / scale, y: physical.y / scale }
  let state = createDragState({
    dragId: 'drag-tremor', pointerId: 5, screen: grabScreen,
    origin: { x: 757, y: 405 }, size: { width: 196, height: 212 },
  })
  let bounds = { x: 757, y: 405, width: 196, height: 212 }
  const grabOffsetAtStart = grabScreen.y - bounds.y
  let maxDrift = 0
  let sequence = 0
  for (let step = 0; step < 600; step++) {
    physical.y += step % 2 === 0 ? 1 : -1
    sequence += 1
    const cursorY = physical.y / scale
    const advanced = advanceCompanionDrag(state, {
      pointerId: 5, sequence, screen: { x: physical.x / scale, y: cursorY },
    }, workArea)
    assert.equal(advanced.accepted, true)
    bounds = advanced.bounds
    state = advanced.state
    maxDrift = Math.max(maxDrift, Math.abs(cursorY - bounds.y - grabOffsetAtStart))
  }
  assert.equal(physical.y, 509, 'the tremor leaves the pointer where it grabbed')
  assert.ok(maxDrift < 1, `grab offset drifted by ${maxDrift}px under pure tremor`)
})

test('a slow fractional-scale drag tracks the full pointer displacement', () => {
  // Two physical pixels per sample at 150% scale are 1.333 DIP. Truncating
  // per sample dropped a third of a pixel every sample (200px over 600); the
  // carried remainder must land the window within one pixel of the total.
  // The tall work area keeps the 800px path away from the bottom clamp.
  const workArea = { x: 0, y: 0, width: 1707, height: 2400 }
  const scale = 1.5
  const physical = { x: 853, y: 509 }
  let state = createDragState({
    dragId: 'drag-slow', pointerId: 6, screen: { x: physical.x / scale, y: physical.y / scale },
    origin: { x: 757, y: 405 }, size: { width: 196, height: 212 },
  })
  let bounds = { x: 757, y: 405, width: 196, height: 212 }
  for (let step = 1; step <= 600; step++) {
    physical.y += 2
    const advanced = advanceCompanionDrag(state, {
      pointerId: 6, sequence: step, screen: { x: physical.x / scale, y: physical.y / scale },
    }, workArea)
    assert.equal(advanced.accepted, true)
    bounds = advanced.bounds
    state = advanced.state
  }
  const expectedY = 405 + 1200 / scale
  assert.ok(Math.abs(bounds.y - expectedY) < 1, `window at ${bounds.y}, expected ${expectedY} within 1px`)
})

test('dragging against the work-area edge leaves no reverse slack', () => {
  // The exact position must clamp together with the materialized rectangle:
  // samples that push far past the edge must not build up unclamped slack the
  // window would have to unwind before following a reversing pointer.
  const workArea = { x: 0, y: 0, width: 1000, height: 800 }
  let state = createDragState({
    dragId: 'drag-edge', pointerId: 8, screen: { x: 500, y: 400 },
    origin: { x: 400, y: 300 }, size: { width: 192, height: 208 },
  })
  let bounds = { x: 400, y: 300, width: 192, height: 208 }
  let sequence = 0
  for (let step = 1; step <= 20; step++) {
    sequence += 1
    const advanced = advanceCompanionDrag(state, {
      pointerId: 8, sequence, screen: { x: 500, y: 400 + step * 50_000 },
    }, workArea)
    bounds = advanced.bounds
    state = advanced.state
  }
  assert.equal(bounds.y, 592, 'the window rests on the bottom work-area edge')
  const pushedCursorY = 400 + 20 * 50_000
  for (let step = 1; step <= 50; step++) {
    sequence += 1
    const advanced = advanceCompanionDrag(state, {
      pointerId: 8, sequence, screen: { x: 500, y: pushedCursorY - step * 10 },
    }, workArea)
    bounds = advanced.bounds
    state = advanced.state
    if (step === 1) assert.equal(bounds.y, 582, 'the first reversing sample moves the window')
  }
  assert.equal(bounds.y, 592 - 500, 'the window follows the reverse immediately')
})

test('restores normalized placement across display changes and clamps resize', () => {
  const first = { id: 'display-a', workArea: { x: 0, y: 0, width: 1920, height: 1040 }, scaleFactor: 1 }
  const second = { id: 'display-b', workArea: { x: 1920, y: 0, width: 1280, height: 1040 }, scaleFactor: 1 }
  const entry = placementEntryForBounds('pet', { x: 960, y: 208, width: 104, height: 112 }, first)
  const document = normalizePlacementDocument({ version: 1, entries: { pet: entry } }, new Set(['pet']))
  assert.deepEqual(restoreCompanionPlacement(document.entries.pet, [first], first, 104, 112), {
    x: 960, y: 208, width: 104, height: 112,
  })
  assert.deepEqual(restoreCompanionPlacement(document.entries.pet, [second], second, 104, 112), {
    x: 2541, y: 208, width: 104, height: 112,
  })
  assert.deepEqual(resizeCompanionBounds({ x: 3000, y: 900, width: 104, height: 112 }, { width: 500, height: 500 }, {
    minWidth: 80, maxWidth: 256, minHeight: 80, maxHeight: 224,
  }, second.workArea), {
    x: 2944, y: 816, width: 256, height: 224,
  })
  assert.throws(() => normalizePlacementDocument({ version: 1, entries: { other: entry } }, new Set(['pet'])), /unknown/)
})
