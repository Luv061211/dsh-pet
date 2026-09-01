#!/usr/bin/env node
/** Validate that packed package files satisfy every concrete public target. */

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

/** Return normalized concrete runtime targets declared by a package manifest. */
export function declaredRuntimeTargets(manifest) {
  const targets = new Set()
  addTarget(targets, manifest.main)
  addTarget(targets, manifest.types)
  collectExportTargets(targets, manifest.exports)
  addTarget(targets, manifest.dsh?.bundle?.patch)
  return [...targets].sort()
}

/** Fail when a packed file list omits any declared runtime target. */
export function verifyPackedFiles(packageName, manifest, packedFiles) {
  const present = new Set(packedFiles.map(normalizeTarget))
  const missing = declaredRuntimeTargets(manifest).filter(target => !present.has(target))
  if (missing.length > 0) throw new Error(`${packageName} packed tarball is missing: ${missing.join(', ')}`)
}

function collectExportTargets(targets, value) {
  if (typeof value === 'string') {
    addTarget(targets, value)
    return
  }
  if (Array.isArray(value)) {
    for (const entry of value) collectExportTargets(targets, entry)
    return
  }
  if (value === null || typeof value !== 'object') return
  for (const entry of Object.values(value)) collectExportTargets(targets, entry)
}

function addTarget(targets, value) {
  if (typeof value !== 'string' || value.includes('*')) return
  targets.add(normalizeTarget(value))
}

function normalizeTarget(value) {
  return value.replace(/^\.\//, '').replaceAll('\\', '/')
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const manifestPath = process.argv[2]
  const filesPath = process.argv[3]
  if (manifestPath === undefined || filesPath === undefined) {
    console.error('Usage: node scripts/verify-packed-packages.mjs <package.json> <packed-files.json>')
    process.exit(1)
  }
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
  const files = JSON.parse(readFileSync(filesPath, 'utf8'))
  verifyPackedFiles(manifest.name ?? manifestPath, manifest, files)
  console.log(`${manifest.name ?? manifestPath}: packed targets verified`)
}
