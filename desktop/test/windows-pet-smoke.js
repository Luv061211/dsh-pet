'use strict'

const assert = require('node:assert/strict')
const {
  advanceCompanionDrag,
  createDragState,
  resizeCompanionBounds,
} = require('../src/companion.js')

/** Run deterministic DSH-owned geometry checks without launching Electron. */
function runWindowsPetSmoke() {
  const workArea = { x: 0, y: 0, width: 1920, height: 1040 }
  const start = createDragState({
    dragId: 'windows-smoke', pointerId: 1, screen: { x: 113, y: 109 },
    origin: { x: 12, y: 0 }, size: { width: 103, height: 112 },
  })
  const moved = advanceCompanionDrag(start, { pointerId: 1, sequence: 1, screen: { x: 117, y: 109 } }, workArea)
  assert.equal(moved.accepted, true)
  assert.deepEqual(moved.bounds, { x: 16, y: 0, width: 103, height: 112 })
  assert.deepEqual(resizeCompanionBounds(moved.bounds, { width: 500, height: 500 }, {
    minWidth: 74, maxWidth: 207, minHeight: 80, maxHeight: 224,
  }, workArea), { x: 16, y: 0, width: 207, height: 224 })
  return {
    formatVersion: 1,
    platform: process.platform,
    checks: { fourPixelDrag: true, displayClamp: true, resizeClamp: true },
  }
}

if (require.main === module) process.stdout.write(`${JSON.stringify(runWindowsPetSmoke(), null, 2)}\n`)

module.exports = { runWindowsPetSmoke }
