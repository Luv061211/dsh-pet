#!/usr/bin/env node
/** Build authoritative package tarballs and verify their public file targets. */

import { execFileSync } from 'node:child_process'
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { verifyPackedFiles } from './verify-packed-packages.mjs'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const output = join(root, '.artifacts')
const packageDirs = [
  'packages/pet/compat',
  'packages/desktop/companion',
  'packages/pet/pet',
  'packages/pet/command-pet',
  'packages/pet/tui',
  'packages/client/ui-pet',
  'packages/bundle/pet-desktop',
]

rmSync(output, { recursive: true, force: true })
mkdirSync(output, { recursive: true })

const pnpmEntry = process.env.npm_execpath
if (pnpmEntry === undefined) throw new Error('pack-all must run through pnpm')
const packages = []
for (const relativeDir of packageDirs) {
  const packageDir = join(root, relativeDir)
  const manifest = JSON.parse(readFileSync(join(packageDir, 'package.json'), 'utf8'))
  const raw = execFileSync(process.execPath, [pnpmEntry, 'pack', '--json', '--pack-destination', output], {
    cwd: packageDir,
    encoding: 'utf8',
  })
  const packed = JSON.parse(raw)
  const files = packed.files.map(file => file.path)
  verifyPackedFiles(manifest.name, manifest, files)
  packages.push({ name: manifest.name, version: manifest.version, filename: packed.filename, files })
  console.log(`${manifest.name}: ${String(files.length)} packed files verified`)
}
writeFileSync(join(output, 'pack-manifest.json'), JSON.stringify({ packages }, null, 2) + '\n')
console.log(`verified ${String(packages.length)} package tarballs in ${output}`)
