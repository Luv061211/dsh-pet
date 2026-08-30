/** Package-owned invariant companion. @module @luv1211/dsh-pet/invariant */

/* jscpd:ignore-start */
import type { Context } from '@deepseek-ai/cordis'
import type { InvariantInstaller } from '@deepseek-ai/dsh-invariants'

const PACKAGE_NAME = '@luv1211/dsh-pet'

/** Cordis companion plugin name. */
export const name = 'pet-invariant'
/** Service required before the companion can reserve package ownership. */
export const inject = ['invariants']

/**
 * No runtime invariant: the preference document persists through the
 * settings seam (schema-validated there), and activity records are
 * presentation state the service derives and owns alone, so a companion
 * would restate the service rather than check a relation another package
 * can violate.
 */
const install: InvariantInstaller = () => {}

/** Register this package's invariant companion. */
export const apply = (ctx: Context): Promise<() => void> =>
  Promise.resolve(ctx.invariants.register(PACKAGE_NAME, install))
/* jscpd:ignore-end */
