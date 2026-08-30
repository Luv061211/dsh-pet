/** Host-native pet package and folder operations assembled from existing host seams. */

import { lstat, readFile } from 'node:fs/promises'
import { basename, dirname, join, resolve } from 'node:path'
import type { DirectoryPickerCapability } from '@deepseek-ai/dsh-host-directory-picker'
import { openNativePath } from './path-opener.ts'
import { petSpritesheetPath } from './runtime.ts'
import type { PetNativeActions, PetPackageBytes } from './types.ts'

/** Injectable filesystem/open hooks used by the host adapter tests. */
export interface PetNativeActionInternals {
  /** Read one selected package file. */
  readFile?: (path: string) => Promise<Uint8Array>
  /** Open one host path with its default application. */
  openPath?: (path: string) => Promise<void>
}

/** Assemble pet actions only when the composed directory picker is native.
 * @param capability - composed directory picker capability.
 * @param internals - optional filesystem and host-open test seams.
 * @returns native pet actions, or `undefined` for browser-only pickers.
 */
export function createPetNativeActions(
  capability: DirectoryPickerCapability | undefined,
  internals: PetNativeActionInternals = {},
): PetNativeActions | undefined {
  if (capability?.kind !== 'native') return undefined
  const read = internals.readFile ?? (async path => new Uint8Array(await readFile(path)))
  const open = internals.openPath ?? (path => openNativePath(path, new AbortController().signal))
  return {
    async pickPetPackage(): Promise<PetPackageBytes | null> {
      const selected = await capability.pick(new AbortController().signal)
      if (selected === null) return null
      const directory = await packageDirectory(selected)
      const manifestBytes = await read(join(directory, 'pet.json'))
      const spritesheetPath = petSpritesheetPath(manifestBytes)
      return {
        manifestBytes,
        spritesheetBytes: await read(join(directory, spritesheetPath.replaceAll('\\', '/'))),
      }
    },
    openPetFolder: open,
  }
}

/** Resolve a picker result to one package directory and reject links or unrelated files. */
async function packageDirectory(selected: string): Promise<string> {
  const target = resolve(selected)
  const targetStat = await lstat(target)
  if (targetStat.isDirectory() && !targetStat.isSymbolicLink()) return target
  if (!targetStat.isFile() || targetStat.isSymbolicLink()) throw new Error('pet package selection must be a directory or package file')
  const name = basename(target)
  if (name !== 'pet.json' && name !== 'spritesheet.webp') {
    throw new Error('pet package selection must name pet.json or spritesheet.webp')
  }
  const directory = dirname(target)
  const directoryStat = await lstat(directory)
  if (!directoryStat.isDirectory() || directoryStat.isSymbolicLink()) throw new Error('pet package directory is invalid')
  return directory
}
