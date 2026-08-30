import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { DirectoryPickerCapability } from '@deepseek-ai/dsh-host-directory-picker'
import { createPetNativeActions, type PetNativeActionInternals } from '../src/host-native.ts'

vi.mock('@deepseek-ai/dsh-native-command', () => ({
  openNativePath: vi.fn(async () => {}),
}))

/** A native picker capability that always reports the given selection. */
function nativePicker(selected: string | null): DirectoryPickerCapability {
  return { kind: 'native', pick: async () => selected }
}

/** One on-disk package directory with a manifest and a manifest-relative sprite. */
function writePackage(root: string, spritePath: string): string {
  const directory = join(root, 'quiet-otter')
  mkdirSync(join(directory, spritePath, '..'), { recursive: true })
  writeFileSync(join(directory, 'pet.json'), JSON.stringify({
    id: 'quiet-otter',
    displayName: 'Quiet Otter',
    spritesheetPath: spritePath,
    frame: { width: 192, height: 208, columns: 8, rows: 9 },
  }))
  writeFileSync(join(directory, spritePath), Uint8Array.of(1, 2, 3))
  return directory
}

const roots: string[] = []

afterEach(() => {
  while (roots.length > 0) rmSync(roots.pop()!, { recursive: true, force: true })
})

describe('createPetNativeActions', () => {
  it('assembles actions only for a native picker capability', () => {
    expect(createPetNativeActions(undefined)).toBeUndefined()
    expect(createPetNativeActions({ kind: 'browse' } as DirectoryPickerCapability)).toBeUndefined()
    expect(createPetNativeActions(nativePicker(null))).toBeDefined()
  })

  it('picks a package directory and reads the manifest-relative spritesheet', async () => {
    const root = mkdtempSync(join(tmpdir(), 'dsh-pet-native-dir-'))
    roots.push(root)
    const directory = writePackage(root, 'art/pet.webp')
    const actions = createPetNativeActions(nativePicker(directory))!

    const picked = await actions.pickPetPackage()
    expect(JSON.parse(new TextDecoder().decode(picked!.manifestBytes))).toMatchObject({ id: 'quiet-otter' })
    expect(picked!.spritesheetBytes).toEqual(Uint8Array.of(1, 2, 3))
  })

  it('resolves a pet.json file selection to its package directory', async () => {
    const root = mkdtempSync(join(tmpdir(), 'dsh-pet-native-manifest-'))
    roots.push(root)
    const directory = writePackage(root, 'spritesheet.webp')
    const actions = createPetNativeActions(nativePicker(join(directory, 'pet.json')))!

    await expect(actions.pickPetPackage()).resolves.toMatchObject({
      spritesheetBytes: Uint8Array.of(1, 2, 3),
    })
  })

  it('resolves a spritesheet file selection to its package directory', async () => {
    const root = mkdtempSync(join(tmpdir(), 'dsh-pet-native-sprite-'))
    roots.push(root)
    const directory = writePackage(root, 'spritesheet.webp')
    const actions = createPetNativeActions(nativePicker(join(directory, 'spritesheet.webp')))!

    await expect(actions.pickPetPackage()).resolves.toMatchObject({
      spritesheetBytes: Uint8Array.of(1, 2, 3),
    })
  })

  it('rejects a selection that names an unrelated file', async () => {
    const root = mkdtempSync(join(tmpdir(), 'dsh-pet-native-other-'))
    roots.push(root)
    const directory = writePackage(root, 'spritesheet.webp')
    const unrelated = join(directory, 'readme.txt')
    writeFileSync(unrelated, 'hello')
    const actions = createPetNativeActions(nativePicker(unrelated))!

    await expect(actions.pickPetPackage()).rejects.toThrow('pet package selection must name pet.json or spritesheet.webp')
  })

  it('returns null when the operator cancels the native picker', async () => {
    const actions = createPetNativeActions(nativePicker(null))!
    await expect(actions.pickPetPackage()).resolves.toBeNull()
  })

  it('rejects a symlinked selection instead of following it', async () => {
    const root = mkdtempSync(join(tmpdir(), 'dsh-pet-native-link-'))
    roots.push(root)
    const directory = writePackage(root, 'spritesheet.webp')
    const link = join(root, 'linked')
    symlinkSync(directory, link, process.platform === 'win32' ? 'junction' : 'dir')
    const actions = createPetNativeActions(nativePicker(link))!

    await expect(actions.pickPetPackage()).rejects.toThrow('pet package selection must be a directory or package file')
  })

  it('reports the injected read hook and opens folders through the injected opener', async () => {
    const root = mkdtempSync(join(tmpdir(), 'dsh-pet-native-inject-'))
    roots.push(root)
    const directory = writePackage(root, 'spritesheet.webp')
    const manifest = JSON.stringify({
      id: 'quiet-otter',
      displayName: 'Quiet Otter',
      spritesheetPath: 'spritesheet.webp',
      frame: { width: 192, height: 208, columns: 8, rows: 9 },
    })
    const reads: string[] = []
    const opened: string[] = []
    const internals: PetNativeActionInternals = {
      readFile: async (path) => {
        reads.push(path)
        return path.endsWith('pet.json')
          ? new TextEncoder().encode(manifest)
          : Uint8Array.of(9)
      },
      openPath: async (path) => { opened.push(path) },
    }
    const actions = createPetNativeActions(nativePicker(directory), internals)!

    await expect(actions.pickPetPackage()).resolves.toEqual({
      manifestBytes: new TextEncoder().encode(manifest),
      spritesheetBytes: Uint8Array.of(9),
    })
    expect(reads.map(path => path.slice(directory.length + 1))).toEqual(['pet.json', 'spritesheet.webp'])
    await actions.openPetFolder(join(root, 'pets'))
    expect(opened).toEqual([join(root, 'pets')])
  })
})
