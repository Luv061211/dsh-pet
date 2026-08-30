/**
 * The bundle's substance is its patch file plus the dependency that makes the
 * draggable companion window reachable. Two coupled facts keep the pet surface
 * draggable in a profile that adds this bundle:
 *   - `@luv061211/dsh-desktop-companion` is a real dependency (not a peer),
 *     so profiles that do not run the flat-module fallback still install it.
 *   - the patch list inserts the `desktop-companion` row before `pet`, so the
 *     Service loads and `ctx.get('desktopCompanion')` resolves before `pet`
 *     reads it; without the row the draggable window never registers even when
 *     the package is installed.
 */

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import * as yaml from 'js-yaml'
import { entryListSchema } from '@deepseek-ai/cordis-plugin-include'

interface PatchRow {
  insert?: { id?: string; name?: string }[]
}

describe('dsh-pet-desktop bundle', () => {
  const root = fileURLToPath(new URL('..', import.meta.url))
  const manifest = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8')) as {
    dependencies?: Record<string, string>
    peerDependencies?: Record<string, string>
    dsh?: { bundle?: { patch?: string } }
  }

  it('declares a parseable patch list through the dsh.bundle.patch manifest field', () => {
    expect(manifest.dsh?.bundle?.patch).toBe('./cordis.patch.yml')
    const parsed = yaml.load(
      readFileSync(resolve(root, manifest.dsh!.bundle!.patch!), 'utf8'),
      { schema: entryListSchema },
    )
    expect(Array.isArray(parsed)).toBe(true)
  })

  it('depends on @luv061211/dsh-desktop-companion so profiles install the service', () => {
    // A peer would not be installed by pnpm into a profile's node_modules and
    // leaves profiles that bypass the flat-module fallback without the service.
    expect(manifest.dependencies).toHaveProperty('@luv061211/dsh-desktop-companion')
    expect(manifest.peerDependencies).not.toHaveProperty('@luv061211/dsh-desktop-companion')
  })

  it('loads the desktop-companion plugin before pet so pet can register its window', () => {
    const parsed = yaml.load(
      readFileSync(resolve(root, 'cordis.patch.yml'), 'utf8'),
      { schema: entryListSchema },
    ) as PatchRow[]
    const inserts = parsed.flatMap(patch => patch.insert ?? [])
    const ids = inserts.map(row => row.id)
    const companionIndex = ids.indexOf('desktop-companion')
    const petIndex = ids.indexOf('pet')
    expect(companionIndex).toBeGreaterThanOrEqual(0)
    expect(petIndex).toBeGreaterThanOrEqual(0)
    expect(companionIndex).toBeLessThan(petIndex)
    const companionRow = inserts[companionIndex]
    expect(companionRow?.name).toBe('@luv061211/dsh-desktop-companion')
  })
})
