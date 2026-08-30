/**
 * Generate the app icon: multi-size PNGs from build/icon.svg and a multi-size
 * .ico (PNG-compressed entries, supported since Windows Vista).
 *
 * Depends on sharp from the harness repo's node_modules; run from desktop/:
 *   node scripts/gen-icon.js
 */
'use strict'

const fs = require('node:fs')
const path = require('node:path')

const sharp = require(path.join(__dirname, '..', '..', 'packages', 'attachment', 'attachment-local', 'node_modules', 'sharp'))

const ROOT = path.join(__dirname, '..')
const SVG = path.join(ROOT, 'build', 'icon.svg')
const ICO = path.join(ROOT, 'build', 'icon.ico')
const PNG = path.join(ROOT, 'build', 'icon.png')
const SIZES = [16, 24, 32, 48, 64, 128, 256]

/** Pack PNG buffers into a multi-size ICO (ICONDIR + entries + PNG blobs). */
function packIco(pngs) {
  const count = pngs.length
  const header = Buffer.alloc(6)
  header.writeUInt16LE(0, 0) // reserved
  header.writeUInt16LE(1, 2) // type: icon
  header.writeUInt16LE(count, 4)
  const entries = []
  const blobs = []
  let offset = 6 + 16 * count
  for (const { size, data } of pngs) {
    const entry = Buffer.alloc(16)
    entry.writeUInt8(size >= 256 ? 0 : size, 0) // width; 0 means 256
    entry.writeUInt8(size >= 256 ? 0 : size, 1) // height
    entry.writeUInt8(0, 2) // palette
    entry.writeUInt8(0, 3) // reserved
    entry.writeUInt16LE(1, 4) // planes
    entry.writeUInt16LE(32, 6) // bit count
    entry.writeUInt32LE(data.length, 8)
    entry.writeUInt32LE(offset, 12)
    entries.push(entry)
    blobs.push(data)
    offset += data.length
  }
  return Buffer.concat([header, ...entries, ...blobs])
}

async function main() {
  const pngs = []
  for (const size of SIZES) {
    const data = await sharp(SVG).resize(size, size).png().toBuffer()
    pngs.push({ size, data })
  }
  fs.writeFileSync(ICO, packIco(pngs))
  fs.writeFileSync(PNG, await sharp(SVG).resize(512, 512).png().toBuffer())
  console.log(`wrote ${ICO} (${SIZES.join('/')}px) and ${PNG} (512px)`)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
