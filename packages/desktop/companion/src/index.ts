/** Desktop companion discovery service for the DSH Web profile. */

import { Service, type Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-host-webserver'
import type { DesktopCompanionCapabilities, DesktopCompanionDescriptor, DesktopCompanionResizeCapability } from './types.ts'

export type { DesktopCompanionCapabilities, DesktopCompanionDescriptor, DesktopCompanionResizeCapability } from './types.ts'

declare module '@deepseek-ai/cordis' {
  interface Context {
    /** The optional renderer registered for the desktop companion window. */
    desktopCompanion: DesktopCompanion
  }
}

const MIN_DIMENSION = 64
const MAX_DIMENSION = 512

/**
 * Owns the one desktop-companion descriptor a Web composition may expose.
 * The Electron shell discovers the descriptor through the local route; a
 * feature plugin owns the renderer itself and releases it on disposal.
 */
export class DesktopCompanion extends Service {
  static inject = ['webServer']

  private current: DesktopCompanionDescriptor | undefined

  constructor(ctx: Context) {
    super(ctx, 'desktopCompanion')
    ctx.effect(() => ctx.webServer.register({
      kind: 'exact',
      path: '/__dsh/desktop/companion',
      handler: (_req, res) => {
        const descriptor = this.current
        if (descriptor === undefined) {
          res.writeHead(204)
          res.end()
          return
        }
        res.writeHead(200, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' })
        res.end(JSON.stringify(descriptor))
      },
    }), 'desktopCompanion: discovery route')
  }

  /**
   * Publish the renderer the Electron shell may host.
   * @param descriptor - fixed local renderer details.
   * @returns a disposer that removes this exact descriptor.
   */
  register(descriptor: DesktopCompanionDescriptor): () => void {
    const normalized = validateDescriptor(descriptor)
    if (this.current !== undefined) throw new Error('desktop companion is already registered')
    this.current = normalized
    return () => {
      if (this.current === normalized) this.current = undefined
    }
  }

  /**
   * Read the current descriptor without exposing mutable service state.
   * @returns the active descriptor, or undefined when no feature registered.
   */
  descriptor(): DesktopCompanionDescriptor | undefined {
    return this.current === undefined ? undefined : { ...this.current }
  }
}

/** Validate one feature-owned renderer descriptor before publication. */
function validateDescriptor(descriptor: DesktopCompanionDescriptor): DesktopCompanionDescriptor {
  if (!/^[a-z][a-z0-9-]{0,63}$/.test(descriptor.id)) {
    throw new Error('desktop companion id must be lowercase letters, digits, or hyphens')
  }
  if (!isOriginRelativePathname(descriptor.entryPath)) {
    throw new Error('desktop companion entryPath must be an origin-relative pathname')
  }
  validateDimension('width', descriptor.width)
  validateDimension('height', descriptor.height)
  const capabilities = descriptor.capabilities === undefined ? undefined : validateCapabilities(descriptor.capabilities)
  return Object.freeze({
    ...descriptor,
    ...(capabilities === undefined ? {} : { capabilities }),
  })
}

/** Validate and detach generic shell capabilities from a feature descriptor. */
function validateCapabilities(capabilities: DesktopCompanionCapabilities): DesktopCompanionCapabilities {
  if (capabilities.drag !== undefined && typeof capabilities.drag !== 'boolean') {
    throw new Error('desktop companion capabilities drag must be boolean')
  }
  if (capabilities.pointerInteraction !== undefined && typeof capabilities.pointerInteraction !== 'boolean') {
    throw new Error('desktop companion capabilities pointerInteraction must be boolean')
  }
  const resize = capabilities.resize === undefined ? undefined : validateResizeCapability(capabilities.resize)
  const normalizedResize = resize === undefined ? undefined : Object.freeze(resize)
  return Object.freeze({
    ...(capabilities.drag === undefined ? {} : { drag: capabilities.drag }),
    ...(capabilities.pointerInteraction === undefined ? {} : { pointerInteraction: capabilities.pointerInteraction }),
    ...(normalizedResize === undefined ? {} : { resize: normalizedResize }),
  })
}

/** Validate one optional resize range against the shell's existing dimensions. */
function validateResizeCapability(resize: DesktopCompanionResizeCapability): DesktopCompanionResizeCapability {
  for (const name of ['minWidth', 'maxWidth', 'minHeight', 'maxHeight'] as const) {
    validateDimension(`resize ${name}`, resize[name])
  }
  if (resize.minWidth > resize.maxWidth) throw new Error('desktop companion resize width range is reversed')
  if (resize.minHeight > resize.maxHeight) throw new Error('desktop companion resize height range is reversed')
  return {
    minWidth: resize.minWidth,
    maxWidth: resize.maxWidth,
    minHeight: resize.minHeight,
    maxHeight: resize.maxHeight,
  }
}

/** Return whether a string is a local absolute pathname with no query or fragment. */
function isOriginRelativePathname(value: string): boolean {
  if (!value.startsWith('/') || value.startsWith('//')) return false
  const parsed = new URL(value, 'http://dsh.local')
  return parsed.origin === 'http://dsh.local' && parsed.pathname === value && parsed.search === '' && parsed.hash === ''
}

/** Validate one fixed CSS-pixel dimension. */
function validateDimension(name: string, value: number): void {
  if (!Number.isSafeInteger(value) || value < MIN_DIMENSION || value > MAX_DIMENSION) {
    throw new Error(`desktop companion ${name} must be between ${MIN_DIMENSION} and ${MAX_DIMENSION}`)
  }
}

export default DesktopCompanion
