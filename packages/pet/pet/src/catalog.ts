/** Host-side compatible pet catalog and transactional user-package storage. */

import { closeSync, existsSync, fstatSync, lstatSync, mkdirSync, openSync, readSync, realpathSync, readdirSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, isAbsolute, join, relative, resolve } from 'node:path'
import { randomUUID } from 'node:crypto'
import { resolveDshHome } from '@deepseek-ai/dsh-home-paths'
import {
  DEFAULT_PET_ID,
  petSpritesheetPath,
  validatePetPackageFiles,
  type PetPackageValidationOptions,
} from './runtime.ts'
import type { PetCatalog, PetDescriptor } from './types.ts'
import { decodeWebpDimensions } from './host-image.ts'

/** Configured filesystem limits and the one DSH-owned user package root. */
export interface PetCatalogOptions extends PetPackageValidationOptions {
  /** Explicit DSH home used when petRoot is absent. */
  readonly dshHome?: string
  /** One user-managed package root; defaults to `<dshHome>/pets`. */
  readonly petRoot?: string
  /** Maximum wall time for one complete user-image decode. */
  readonly decodeTimeoutMs?: number
}

interface PetRecord {
  readonly descriptor: PetDescriptor
  readonly spriteBytes: Uint8Array
  readonly source: 'builtin' | 'user'
}

/** One validated built-in or user package with detached client metadata. */
export class PetCatalogStore {
  /** Absolute DSH-owned directory for user-installed pet packages. */
  readonly petRoot: string
  private readonly options: PetCatalogOptions
  private readonly records = new Map<string, PetRecord>()
  private readonly listeners = new Set<(catalog: PetCatalog) => void>()

  /**
   * Load the embedded package and the configured DSH user root.
   * @param options - package root and validation limits.
   */
  constructor(options: PetCatalogOptions = {}) {
    this.options = { ...options }
    this.petRoot = resolve(options.petRoot ?? join(resolveDshHome(options.dshHome), 'pets'))
    this.reload()
  }

  /** Read a detached deterministic catalog.
   * @returns a stable descriptor list without filesystem references.
   */
  getCatalog(): PetCatalog {
    return Object.freeze({ pets: Object.freeze([...this.records.values()].map(record => ({ ...record.descriptor }))) })
  }

  /** Return a detached validated sprite for one catalog-owned id.
   * @param id - catalog id to resolve.
   * @returns a copied sprite byte array, or `undefined` for an unknown id.
   */
  getAsset(id: string): Uint8Array | undefined {
    const record = this.records.get(id)
    return record === undefined ? undefined : new Uint8Array(record.spriteBytes)
  }

  /** Subscribe to catalog publication and return its disposer.
   * @param listener - callback receiving each detached catalog.
   * @returns a disposer that removes the listener.
   */
  subscribe(listener: (catalog: PetCatalog) => void): () => void {
    this.listeners.add(listener)
    return () => { this.listeners.delete(listener) }
  }

  /** Check that an id names a loaded package.
   * @param id - catalog id to test.
   * @returns whether the id is currently loaded.
   */
  has(id: string): boolean {
    return this.records.has(id)
  }

  /** Create the configured user root before a host action opens it. */
  ensureRoot(): void {
    mkdirSync(this.petRoot, { recursive: true })
  }

  /**
   * Atomically publish one validated package under the user root.
   * @param manifestBytes - UTF-8 compatible pet.json bytes.
   * @param spritesheetBytes - validated WebP bytes.
   * @returns the newly published descriptor.
   */
  importPackage(manifestBytes: Uint8Array, spritesheetBytes: Uint8Array): PetDescriptor {
    const firstPass = validatePetPackageFiles(manifestBytes, spritesheetBytes, { ...this.options, assetUrl: '', source: 'user' })
    decodeWebpDimensions(spritesheetBytes, this.options.decodeTimeoutMs ?? 10_000)
    if (firstPass.descriptor.id === DEFAULT_PET_ID) throw new Error(`pet id ${DEFAULT_PET_ID} is reserved for the built-in package`)
    if (this.records.has(firstPass.descriptor.id)) throw new Error(`pet id ${firstPass.descriptor.id} is already registered`)
    mkdirSync(this.petRoot, { recursive: true })
    const target = join(this.petRoot, firstPass.descriptor.id)
    if (existsSync(target)) throw new Error(`pet package directory ${firstPass.descriptor.id} already exists`)
    const temporary = join(this.petRoot, `.${firstPass.descriptor.id}.${randomUUID()}.tmp`)
    try {
      mkdirSync(temporary)
      writeFileSync(join(temporary, 'pet.json'), manifestBytes, { flag: 'wx' })
      const spriteTarget = join(temporary, firstPass.spritesheetPath.replaceAll('\\', '/'))
      mkdirSync(dirname(spriteTarget), { recursive: true })
      writeFileSync(spriteTarget, spritesheetBytes, { flag: 'wx' })
      renameSync(temporary, target)
    } catch (error) {
      rmSync(temporary, { recursive: true, force: true })
      throw error
    }
    this.reload()
    const published = this.records.get(firstPass.descriptor.id)?.descriptor
    if (published === undefined) throw new Error(`pet package ${firstPass.descriptor.id} was not published after atomic rename`)
    return { ...published }
  }

  /**
   * Atomically replace one existing user package's content in place.
   * @param manifestBytes - UTF-8 compatible pet.json bytes whose id names a loaded user package.
   * @param spritesheetBytes - validated WebP bytes.
   * @returns the freshly published descriptor.
   */
  replacePackage(manifestBytes: Uint8Array, spritesheetBytes: Uint8Array): PetDescriptor {
    const firstPass = validatePetPackageFiles(manifestBytes, spritesheetBytes, { ...this.options, assetUrl: '', source: 'user' })
    decodeWebpDimensions(spritesheetBytes, this.options.decodeTimeoutMs ?? 10_000)
    const id = firstPass.descriptor.id
    if (this.records.get(id)?.source !== 'user') throw new TypeError(`pet package ${id} is not an updatable user package`)
    mkdirSync(this.petRoot, { recursive: true })
    this.sweepTemporaryDirectories(id)
    const target = join(this.petRoot, id)
    // renameSync cannot overwrite a non-empty directory (EPERM on Windows,
    // ENOTEMPTY on POSIX), so the swap is fixed at three renames. The target
    // is briefly absent between the first two; every interruption outside
    // that adjacent pair leaves either the complete old or complete new
    // content, and a crash inside it leaves only same-id `.tmp` residue.
    const staged = join(this.petRoot, `.${id}.${randomUUID()}.tmp`)
    const aside = join(this.petRoot, `.${id}.${randomUUID()}.tmp`)
    try {
      mkdirSync(staged)
      writeFileSync(join(staged, 'pet.json'), manifestBytes, { flag: 'wx' })
      const spriteTarget = join(staged, firstPass.spritesheetPath.replaceAll('\\', '/'))
      mkdirSync(dirname(spriteTarget), { recursive: true })
      writeFileSync(spriteTarget, spritesheetBytes, { flag: 'wx' })
      renameSync(target, aside)
      try {
        renameSync(staged, target)
      } catch (error) {
        renameSync(aside, target)
        throw error
      }
    } catch (error) {
      rmSync(staged, { recursive: true, force: true })
      throw error
    }
    rmSync(aside, { recursive: true, force: true })
    this.reload()
    const published = this.records.get(id)?.descriptor
    if (published === undefined) throw new Error(`pet package ${id} was not published after replacement`)
    return { ...published }
  }

  /** Dispose all update listeners owned by the catalog service. */
  dispose(): void {
    this.listeners.clear()
    this.records.clear()
  }

  /** Delete the `.tmp` residue of earlier interrupted imports or replacements of one id. */
  private sweepTemporaryDirectories(id: string): void {
    for (const entry of readdirSync(this.petRoot, { withFileTypes: true })) {
      if (entry.name.startsWith(`.${id}.`) && entry.name.endsWith('.tmp')) {
        rmSync(join(this.petRoot, entry.name), { recursive: true, force: true })
      }
    }
  }

  /** Reload validated package records from the embedded assets and the user root, then publish one detached catalog. */
  reload(): void {
    const next = new Map<string, PetRecord>()
    const builtin = readValidatedPackage(
      new URL('../assets/deepseek-whale/pet.json', import.meta.url),
      this.options,
      'builtin',
    )
    next.set(DEFAULT_PET_ID, builtin)
    if (existsSync(this.petRoot) && isDirectory(this.petRoot)) {
      for (const entry of readdirSync(this.petRoot, { withFileTypes: true })) {
        if (!entry.isDirectory() || entry.isSymbolicLink() || entry.name.startsWith('.')) continue
        const directory = join(this.petRoot, entry.name)
        if (entry.name === DEFAULT_PET_ID) continue
        try {
          const record = readValidatedPackage(join(directory, 'pet.json'), this.options, 'user')
          if (next.has(record.descriptor.id)) throw new Error(`pet id ${record.descriptor.id} is duplicated`)
          next.set(record.descriptor.id, record)
        } catch {
          // A malformed user package is excluded from the catalog. The next
          // explicit catalog read remains deterministic and never exposes its path.
        }
      }
    }
    this.records.clear()
    for (const id of [DEFAULT_PET_ID, ...[...next.keys()].filter(key => key !== DEFAULT_PET_ID).sort()]) {
      const record = next.get(id)
      if (record !== undefined) this.records.set(id, record)
    }
    const catalog = this.getCatalog()
    for (const listener of this.listeners) listener(catalog)
  }
}

function readValidatedPackage(
  manifest: string | URL,
  options: PetCatalogOptions,
  source: PetRecord['source'],
): PetRecord {
  const maxManifestBytes = options.maxManifestBytes ?? 16 * 1024
  const maxSpriteBytes = options.maxSpriteBytes ?? 16 * 1024 * 1024
  const manifestBytes = readRegularFile(manifest, 'pet manifest', maxManifestBytes)
  const relativeSprite = petSpritesheetPath(manifestBytes)
  const spriteLocation = manifest instanceof URL
    ? new URL(relativeSprite.replaceAll('\\', '/'), manifest)
    : join(dirname(manifest), relativeSprite.replaceAll('\\', '/'))
  if (typeof manifest === 'string' && typeof spriteLocation === 'string') assertContainedFile(dirname(manifest), spriteLocation)
  const spriteBytes = readRegularFile(spriteLocation, 'pet spritesheet', maxSpriteBytes)
  const validated = validatePetPackageFiles(manifestBytes, spriteBytes, {
    ...options,
    assetUrl: '',
    source,
  })
  if (source === 'user') decodeWebpDimensions(spriteBytes, options.decodeTimeoutMs ?? 10_000)
  const id = validated.descriptor.id
  const descriptor = Object.freeze({ ...validated.descriptor, assetUrl: `/__dsh/pet/assets/${id}/spritesheet.webp` })
  if (descriptor.id !== id) throw new Error(`pet package id ${descriptor.id} does not match its catalog key ${id}`)
  return { descriptor, spriteBytes, source }
}

function readRegularFile(path: string | URL, label: string, maxBytes: number): Uint8Array {
  if (!Number.isSafeInteger(maxBytes) || maxBytes <= 0) throw new Error(`${label} byte limit is invalid`)
  const stat = lstatSync(path)
  if (!stat.isFile() || stat.isSymbolicLink()) throw new Error(`${label} must be a regular file`)
  if (stat.size > maxBytes) throw new Error(`${label} exceeds the configured byte limit`)
  const handle = openSync(path, 'r')
  try {
    const openedStat = fstatSync(handle)
    if (!openedStat.isFile() || openedStat.size > maxBytes) throw new Error(`${label} exceeds the configured byte limit`)
    const bytes = new Uint8Array(openedStat.size + 1)
    let offset = 0
    while (offset < bytes.byteLength) {
      const count = readSync(handle, bytes, offset, bytes.byteLength - offset, null)
      if (count === 0) break
      offset += count
    }
    if (offset !== openedStat.size) throw new Error(`${label} changed while it was being read`)
    return bytes.subarray(0, offset)
  } finally {
    closeSync(handle)
  }
}

function assertContainedFile(packageRoot: string, candidate: string): void {
  const canonicalRoot = realpathSync(packageRoot)
  const canonicalCandidate = realpathSync(candidate)
  const fromRoot = relative(canonicalRoot, canonicalCandidate)
  if (fromRoot.startsWith(`..${process.platform === 'win32' ? '\\' : '/'}`) || fromRoot === '..' || isAbsolute(fromRoot)) {
    throw new Error('pet spritesheet must stay inside its package directory')
  }
}

function isDirectory(path: string): boolean {
  try {
    return lstatSync(path).isDirectory()
  } catch {
    return false
  }
}
