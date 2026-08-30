'use strict'

const MIN_DIMENSION = 64
const MAX_DIMENSION = 512
const DRAG_THRESHOLD_PX = 4

/** Parse the local-server descriptor into a safe renderer URL. */
function parseCompanionDescriptor(body, origin) {
  let value
  try {
    value = JSON.parse(body)
  } catch {
    throw new Error('desktop companion descriptor must be a valid JSON object')
  }
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('desktop companion descriptor must be a valid JSON object')
  }
  if (typeof value.id !== 'string' || !/^[a-z][a-z0-9-]{0,63}$/.test(value.id)) {
    throw new Error('desktop companion descriptor id is invalid')
  }
  if (typeof value.entryPath !== 'string' || !isOriginRelativePathname(value.entryPath)) {
    throw new Error('desktop companion entryPath must be an origin-relative pathname')
  }
  assertDimension('width', value.width)
  assertDimension('height', value.height)
  const capabilities = value.capabilities === undefined ? undefined : validateCapabilities(value.capabilities)
  const entryUrl = new URL(value.entryPath, origin)
  if (entryUrl.origin !== new URL(origin).origin) {
    throw new Error('desktop companion entryPath must resolve to the Harness origin')
  }
  return {
    id: value.id,
    entryUrl: entryUrl.href,
    width: value.width,
    height: value.height,
    ...(capabilities === undefined ? {} : { capabilities }),
  }
}

/** Clamp a point into one display work area for a fixed-size window, keeping
 * fractional coordinates. Rounding is the caller's decision: one-shot callers
 * materialize integers immediately, while the drag session must carry the
 * sub-pixel remainder across samples. */
function clampPointIntoWorkArea(point, workArea, width, height) {
  const maxX = workArea.x + Math.max(0, workArea.width - width)
  const maxY = workArea.y + Math.max(0, workArea.height - height)
  return {
    x: Math.min(Math.max(point.x, workArea.x), maxX),
    y: Math.min(Math.max(point.y, workArea.y), maxY),
  }
}

/** Clamp a fixed-size companion window inside one display work area. */
function clampCompanionBounds(point, workArea, width, height) {
  const clamped = clampPointIntoWorkArea(point, workArea, width, height)
  return {
    x: Math.trunc(clamped.x),
    y: Math.trunc(clamped.y),
    width,
    height,
  }
}

function isOriginRelativePathname(value) {
  if (!value.startsWith('/') || value.startsWith('//')) return false
  const parsed = new URL(value, 'http://dsh.local')
  return parsed.origin === 'http://dsh.local' && parsed.pathname === value && parsed.search === '' && parsed.hash === ''
}

function assertDimension(name, value) {
  if (!Number.isSafeInteger(value) || value < MIN_DIMENSION || value > MAX_DIMENSION) {
    throw new Error(`desktop companion ${name} must be between ${MIN_DIMENSION} and ${MAX_DIMENSION}`)
  }
}

/** Validate and detach the generic shell capabilities from a discovery payload. */
function validateCapabilities(value) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('desktop companion capabilities must be an object')
  }
  if (value.drag !== undefined && typeof value.drag !== 'boolean') {
    throw new Error('desktop companion capabilities drag must be boolean')
  }
  if (value.pointerInteraction !== undefined && typeof value.pointerInteraction !== 'boolean') {
    throw new Error('desktop companion capabilities pointerInteraction must be boolean')
  }
  let resize
  if (value.resize !== undefined) {
    if (value.resize === null || typeof value.resize !== 'object' || Array.isArray(value.resize)) {
      throw new Error('desktop companion resize capability must be an object')
    }
    for (const name of ['minWidth', 'maxWidth', 'minHeight', 'maxHeight']) {
      assertDimension(`resize ${name}`, value.resize[name])
    }
    if (value.resize.minWidth > value.resize.maxWidth) {
      throw new Error('desktop companion resize width range is reversed')
    }
    if (value.resize.minHeight > value.resize.maxHeight) {
      throw new Error('desktop companion resize height range is reversed')
    }
    resize = Object.freeze({
      minWidth: value.resize.minWidth,
      maxWidth: value.resize.maxWidth,
      minHeight: value.resize.minHeight,
      maxHeight: value.resize.maxHeight,
    })
  }
  return Object.freeze({
    ...(value.drag === undefined ? {} : { drag: value.drag }),
    ...(value.pointerInteraction === undefined ? {} : { pointerInteraction: value.pointerInteraction }),
    ...(resize === undefined ? {} : { resize }),
  })
}

/** Return true after the renderer has moved more than the click threshold. */
function isDragMovement(deltaX, deltaY, threshold = DRAG_THRESHOLD_PX) {
  return Number.isFinite(deltaX) && Number.isFinite(deltaY)
    && Math.hypot(deltaX, deltaY) > threshold
}

/** Classify horizontal drag movement for presentation orientation. */
function dragDirectionForDelta(deltaX, threshold = DRAG_THRESHOLD_PX) {
  if (!Number.isFinite(deltaX) || Math.abs(deltaX) <= threshold) return 'neutral'
  return deltaX < 0 ? 'left' : 'right'
}

/**
 * Create the immutable main-process drag session state.
 * @param input - dragId, pointerId, the renderer screen sample at the grab,
 *   the grab-time window top-left (`origin`, seeding the exact position), and
 *   the authoritative window size to hold for the whole session.
 */
function createDragState(input) {
  if (!Number.isSafeInteger(input.pointerId) || input.pointerId < 0) throw new Error('drag pointerId is invalid')
  assertFinitePoint(input.screen, 'drag start screen')
  assertFinitePoint(input.origin, 'drag origin')
  assertPositiveSize(input.size, 'drag start size')
  return {
    dragId: input.dragId,
    pointerId: input.pointerId,
    sequence: 0,
    lastScreen: { x: input.screen.x, y: input.screen.y },
    direction: 'neutral',
    size: { width: input.size.width, height: input.size.height },
    exact: { x: input.origin.x, y: input.origin.y },
  }
}

/** Accept only a monotonic pointer sample and return the next immutable drag state. */
function advanceDragState(state, sample) {
  if (sample.pointerId !== state.pointerId) throw new Error('drag pointerId does not own the active session')
  if (!Number.isSafeInteger(sample.sequence) || sample.sequence <= 0) throw new Error('drag sequence is invalid')
  assertFinitePoint(sample.screen, 'drag screen point')
  if (sample.sequence <= state.sequence) return { accepted: false, state, direction: state.direction }
  const direction = dragDirectionForDelta(sample.screen.x - state.lastScreen.x)
  return {
    accepted: true,
    direction,
    state: {
      ...state,
      sequence: sample.sequence,
      lastScreen: { x: sample.screen.x, y: sample.screen.y },
      direction,
    },
  }
}

/** Materialize the integer rectangle a setBounds request carries. Rounding to
 * nearest keeps the rendered position within half a pixel of the exact one and
 * is stable when the exact position sits on an integer (a trembling hand
 * returns there constantly); truncating would flip one pixel on the session's
 * float-accumulation noise. */
function companionBoundsAt(exact, size) {
  return {
    x: Math.round(exact.x),
    y: Math.round(exact.y),
    width: size.width,
    height: size.height,
  }
}

/**
 * Advance one drag session by a pointer sample and compute the next window
 * rectangle. The session owns the exact (unrounded) window top-left: every
 * accepted sample adds the full-precision pointer displacement to it and the
 * sum is clamped into the work area, while only the rectangle materialized for
 * `setBounds` is rounded to integers. The sub-pixel remainder therefore
 * carries between samples, so on Windows fractional-scale displays the integer
 * window cannot ratchet away from the pointer the way a per-sample
 * `trunc(previous + delta)` does. Like the size, the position is session
 * state: the OS-reported rectangle never feeds back into it, so a lossy
 * setBounds→getBounds round-trip cannot compound. The displacement is captured
 * before advancing because `advanceDragState` replaces `lastScreen` with the
 * current sample.
 * @param state - current drag session state.
 * @param sample - validated pointer sample (`pointerId`, `sequence`, `screen`).
 * @param workArea - display work area to clamp the next rectangle into.
 * @returns acceptance, direction, next state, and next bounds; a rejected
 *   sample returns the state unchanged with the current rectangle.
 */
function advanceCompanionDrag(state, sample, workArea) {
  const previousExact = { x: state.exact.x, y: state.exact.y }
  const previousScreen = { x: state.lastScreen.x, y: state.lastScreen.y }
  const advanced = advanceDragState(state, sample)
  if (!advanced.accepted) {
    return {
      accepted: false,
      sequence: advanced.state.sequence,
      direction: advanced.direction,
      state,
      bounds: companionBoundsAt(previousExact, state.size),
    }
  }
  const exact = clampPointIntoWorkArea(
    {
      x: previousExact.x + (sample.screen.x - previousScreen.x),
      y: previousExact.y + (sample.screen.y - previousScreen.y),
    },
    workArea,
    state.size.width,
    state.size.height,
  )
  return {
    accepted: true,
    sequence: advanced.state.sequence,
    direction: advanced.direction,
    state: { ...advanced.state, exact },
    bounds: companionBoundsAt(exact, state.size),
  }
}

/** Resize a companion while preserving its top-left point and display clamp. */
function resizeCompanionBounds(bounds, requestedSize, capability, workArea) {
  assertFinitePoint(bounds, 'companion bounds')
  if (requestedSize === null || typeof requestedSize !== 'object') throw new Error('companion resize request is invalid')
  if (capability === undefined) throw new Error('desktop companion resize capability is unavailable')
  const width = clampInteger(requestedSize.width, capability.minWidth, capability.maxWidth)
  const height = clampInteger(requestedSize.height, capability.minHeight, capability.maxHeight)
  return clampCompanionBounds({ x: bounds.x, y: bounds.y }, workArea, width, height)
}

/** Parse and validate the versioned placement document before it reaches Electron bounds APIs. */
function normalizePlacementDocument(value, allowedIds) {
  if (value === null || typeof value !== 'object' || Array.isArray(value) || value.version !== 1
    || value.entries === null || typeof value.entries !== 'object' || Array.isArray(value.entries)) {
    throw new Error('desktop companion placement document is unsupported')
  }
  const entries = {}
  for (const [id, entry] of Object.entries(value.entries)) {
    if (allowedIds !== undefined && !allowedIds.has(id)) throw new Error(`desktop companion placement id ${id} is unknown`)
    entries[id] = normalizePlacementEntry(entry)
  }
  return { version: 1, entries }
}

/** Normalize one placement entry and reject unchecked dimensions. */
function normalizePlacementEntry(value) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) throw new Error('desktop companion placement entry is invalid')
  const bounds = value.bounds
  if (bounds === null || typeof bounds !== 'object' || Array.isArray(bounds)) throw new Error('desktop companion placement bounds are invalid')
  assertDimension('placement width', bounds.width)
  assertDimension('placement height', bounds.height)
  assertFiniteInteger('placement x', bounds.x)
  assertFiniteInteger('placement y', bounds.y)
  const anchor = value.anchor
  if (anchor === null || typeof anchor !== 'object' || Array.isArray(anchor)
    || !Number.isFinite(anchor.x) || !Number.isFinite(anchor.y) || anchor.x < 0 || anchor.x > 1 || anchor.y < 0 || anchor.y > 1) {
    throw new Error('desktop companion placement anchor is invalid')
  }
  const display = value.display
  if (display === null || typeof display !== 'object' || Array.isArray(display) || typeof display.id !== 'string' || display.id === '') {
    throw new Error('desktop companion placement display is invalid')
  }
  const workArea = display.workArea
  if (workArea === null || typeof workArea !== 'object' || Array.isArray(workArea)) throw new Error('desktop companion placement work area is invalid')
  assertFiniteInteger('placement work area x', workArea.x)
  assertFiniteInteger('placement work area y', workArea.y)
  if (!Number.isSafeInteger(workArea.width) || workArea.width <= 0 || !Number.isSafeInteger(workArea.height) || workArea.height <= 0) {
    throw new Error('desktop companion placement work area dimensions are invalid')
  }
  if (!Number.isFinite(display.scaleFactor) || display.scaleFactor <= 0) throw new Error('desktop companion placement scale factor is invalid')
  if (typeof value.resolutionKey !== 'string' || value.resolutionKey.length === 0) throw new Error('desktop companion placement resolution is invalid')
  assertDimension('placement size', value.sizePx)
  return {
    bounds: { x: bounds.x, y: bounds.y, width: bounds.width, height: bounds.height },
    anchor: { x: anchor.x, y: anchor.y },
    display: {
      id: display.id,
      workArea: { x: workArea.x, y: workArea.y, width: workArea.width, height: workArea.height },
      scaleFactor: display.scaleFactor,
    },
    resolutionKey: value.resolutionKey,
    sizePx: value.sizePx,
  }
}

/** Select and clamp one saved placement against the current display set. */
function restoreCompanionPlacement(entry, displays, fallbackDisplay, width, height) {
  if (entry === undefined) return clampCompanionBounds({ x: fallbackDisplay.workArea.x, y: fallbackDisplay.workArea.y }, fallbackDisplay.workArea, width, height)
  const selected = displays.find(display => display.id === entry.display.id) ?? fallbackDisplay
  const sameMetrics = selected.id === entry.display.id && displayMetricsEqual(selected, entry.display)
  const point = sameMetrics
    ? { x: entry.bounds.x, y: entry.bounds.y }
    : {
        x: selected.workArea.x + entry.anchor.x * Math.max(0, selected.workArea.width - width),
        y: selected.workArea.y + entry.anchor.y * Math.max(0, selected.workArea.height - height),
      }
  return clampCompanionBounds(point, selected.workArea, width, height)
}

/** Build one validated persistence entry from current Electron bounds and display facts. */
function placementEntryForBounds(id, bounds, display, sizePx = bounds.height) {
  assertDimension('placement width', bounds.width)
  assertDimension('placement height', bounds.height)
  const workArea = display.workArea
  const maxX = Math.max(0, workArea.width - bounds.width)
  const maxY = Math.max(0, workArea.height - bounds.height)
  return {
    bounds: { x: Math.trunc(bounds.x), y: Math.trunc(bounds.y), width: bounds.width, height: bounds.height },
    anchor: {
      x: maxX === 0 ? 0 : Math.min(1, Math.max(0, (bounds.x - workArea.x) / maxX)),
      y: maxY === 0 ? 0 : Math.min(1, Math.max(0, (bounds.y - workArea.y) / maxY)),
    },
    display: {
      id: String(display.id),
      workArea: { ...display.workArea },
      scaleFactor: display.scaleFactor,
    },
    resolutionKey: `${workArea.width}x${workArea.height}@${display.scaleFactor}`,
    sizePx,
  }
}

function displayMetricsEqual(left, right) {
  return left.workArea.x === right.workArea.x
    && left.workArea.y === right.workArea.y
    && left.workArea.width === right.workArea.width
    && left.workArea.height === right.workArea.height
    && left.scaleFactor === right.scaleFactor
}

function clampInteger(value, min, max) {
  if (!Number.isFinite(value)) throw new Error('companion resize request is invalid')
  return Math.min(max, Math.max(min, Math.trunc(value)))
}

function assertFinitePoint(value, name) {
  if (value === null || typeof value !== 'object' || !Number.isFinite(value.x) || !Number.isFinite(value.y)) {
    throw new Error(`${name} is invalid`)
  }
}

function assertPositiveSize(value, name) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)
    || !Number.isSafeInteger(value.width) || !Number.isSafeInteger(value.height)
    || value.width <= 0 || value.height <= 0) {
    throw new Error(`${name} is invalid`)
  }
}

function assertFiniteInteger(name, value) {
  if (!Number.isSafeInteger(value)) throw new Error(`${name} is invalid`)
}

module.exports = {
  clampCompanionBounds,
  advanceDragState,
  advanceCompanionDrag,
  createDragState,
  dragDirectionForDelta,
  DRAG_THRESHOLD_PX,
  isDragMovement,
  normalizePlacementDocument,
  parseCompanionDescriptor,
  placementEntryForBounds,
  resizeCompanionBounds,
  restoreCompanionPlacement,
}
