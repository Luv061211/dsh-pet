/** Package-owned invariant companion for the desktop-pet bundle. */

import type { Context } from '@deepseek-ai/cordis'
import type { InvariantInstaller } from '@deepseek-ai/dsh-invariants'

const PACKAGE_NAME = '@luv061211/dsh-pet-desktop'

/** Cordis companion plugin name. */
export const name = 'pet-desktop-bundle-invariant'
/** Service required before the companion can register. */
export const inject = ['invariants']

/** No runtime invariant: the bundle declares profile rows only. */
const install: InvariantInstaller = () => {}

/** Register this package's invariant companion. */
export const apply = (ctx: Context): Promise<() => void> =>
  Promise.resolve(ctx.invariants.register(PACKAGE_NAME, install))
