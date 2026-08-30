/** Standalone minimal DSH TUI host and Codex-compatible pet consumer. */

import {
  detectTerminalPetProtocol,
  frameAt,
  notificationSpec,
  replaceNotification,
  visibleNotification,
  type PetPackage,
  type PetNotification,
  type TerminalPetEnvironment,
} from '@luv061211/dsh-pet-compat'
import { PetPicker, parsePetsCommand } from './picker.ts'
import {
  DEFAULT_PET_TUI_CONFIG,
  type PetTuiCommand,
  type PetTuiConfigInput,
  type PetTuiFramePayload,
  type PetTuiInputEvent,
  type PetTuiSnapshot,
  type PetTuiStartResult,
  type PetTuiTerminal,
  type TuiDimensions,
} from './types.ts'
import { petLayout, renderPetTextFallback, selectPetTuiFrame, validatePetTuiConfig } from './renderer.ts'
import { TerminalLifecycle, writePetFrame } from './terminal-output.ts'

export * from './picker.ts'
export * from './renderer.ts'
export * from './terminal-output.ts'
export type * from './types.ts'

/** Input-independent frame conversion owned by the host that decodes WebP. */
export type PetTuiFrameProvider = (
  selection: NonNullable<ReturnType<typeof frameAt>>,
  pet: PetPackage,
) => PetTuiFramePayload | Promise<PetTuiFramePayload | undefined> | undefined

/** Options for one minimal host instance. */
export interface PetTuiHostOptions {
  readonly terminal: PetTuiTerminal
  readonly pet: PetPackage
  /** Optional catalog shown by `/pets`; defaults to the configured package. */
  readonly pets?: readonly PetPackage[]
  readonly environment: TerminalPetEnvironment
  readonly dimensions: TuiDimensions
  readonly config?: PetTuiConfigInput
  readonly frameProvider?: PetTuiFrameProvider
  readonly animation?: string
  /** Optional initial Codex-style ambient notification. */
  readonly notification?: PetNotification
}

/** Public operations owned by one TUI host. */
export interface PetTuiHost {
  readonly picker: PetPicker
  readonly lifecycle: TerminalLifecycle
  start(): Promise<PetTuiStartResult>
  dispatch(event: PetTuiInputEvent): Promise<void>
  dispatchLine(line: string): Promise<void>
  registerCommand(command: PetTuiCommand): () => void
  setNotification(notification: PetNotification): Promise<void>
  clearNotification(): Promise<void>
  requestRedraw(): Promise<void>
  snapshot(): PetTuiSnapshot
  dispose(): Promise<void>
}

/**
 * Create a host that owns exactly one terminal lifecycle and one redraw queue.
 * @param options - terminal, package, capability, and rendering inputs.
 * @returns the host API for one terminal lifetime.
 */
export function createPetTuiHost(options: PetTuiHostOptions): PetTuiHost {
  const inputConfig = options.config ?? {}
  const config = validatePetTuiConfig({
    ...DEFAULT_PET_TUI_CONFIG,
    ...inputConfig,
    ...(inputConfig.pet_anchor === undefined ? {} : { petAnchor: inputConfig.pet_anchor }),
  })
  const lifecycle = new TerminalLifecycle(options.terminal)
  const picker = new PetPicker(options.pets === undefined || options.pets.length === 0 ? [options.pet] : options.pets)
  const commands = new Map<string, PetTuiCommand>()
  const protocolResult = detectTerminalPetProtocol(options.environment)
  let dimensions = options.dimensions
  let animation = options.animation ?? 'idle'
  let notification = options.notification
  let currentPet = options.pet
  let animationStartedAtMs = Date.now()
  let elapsedMs = 0
  let pickerOpen = false
  let graphicsDisabled = false
  let disposed = false
  let redrawQueued: Promise<void> | undefined
  let redrawRequested = false
  let animationTimer: ReturnType<typeof setTimeout> | undefined
  let animationTimerVersion = 0
  let notificationTimer: ReturnType<typeof setTimeout> | undefined
  let notificationTimerVersion = 0
  let detachData: (() => void) | undefined
  let detachResize: (() => void) | undefined

  const resetAnimationClock = (): void => {
    animationStartedAtMs = Date.now()
    elapsedMs = 0
    if (animationTimer !== undefined) clearTimeout(animationTimer)
    animationTimer = undefined
    animationTimerVersion += 1
  }

  const clearNotificationTimer = (): void => {
    if (notificationTimer !== undefined) clearTimeout(notificationTimer)
    notificationTimer = undefined
    notificationTimerVersion += 1
  }

  const activeNotification = (): PetNotification | undefined => visibleNotification(notification, Date.now())

  const scheduleNotificationExpiry = (): void => {
    clearNotificationTimer()
    if (notification === undefined) return
    const remainingMs = notification.updatedAtMs + notificationSpec(notification.kind).lifetimeMs - Date.now()
    if (remainingMs <= 0) {
      notification = undefined
      resetAnimationClock()
      return
    }
    const version = ++notificationTimerVersion
    notificationTimer = setTimeout(() => {
      if (version !== notificationTimerVersion || disposed) return
      notificationTimer = undefined
      if (activeNotification() === undefined) {
        notification = undefined
        resetAnimationClock()
        void requestRedraw()
      } else {
        scheduleNotificationExpiry()
      }
    }, Math.max(0, Math.ceil(remainingMs)))
  }

  const scheduleAnimation = (nextFrameInMs: number | undefined): void => {
    if (
      disposed
      || pickerOpen
      || !config.animations
      || config.reducedMotion
      || nextFrameInMs === undefined
      || !Number.isFinite(nextFrameInMs)
    ) return
    if (animationTimer !== undefined) clearTimeout(animationTimer)
    const version = ++animationTimerVersion
    animationTimer = setTimeout(() => {
      if (version !== animationTimerVersion || disposed) return
      animationTimer = undefined
      elapsedMs = Math.max(0, Date.now() - animationStartedAtMs)
      void requestRedraw()
    }, Math.max(0, Math.ceil(nextFrameInMs)))
  }

  const snapshot = (): PetTuiSnapshot => {
    const currentNotification = activeNotification()
    return Object.freeze({
      pet: currentPet,
      config,
      dimensions,
      environment: options.environment,
      protocol: protocolResult.supported && config.imageEnabled && !graphicsDisabled ? protocolResult.protocol : undefined,
      animation: currentNotification === undefined ? animation : notificationSpec(currentNotification.kind).animation,
      elapsedMs,
      notification: currentNotification,
      layout: petLayout(dimensions, config.petAnchor, config.reserveColumns),
      pickerOpen,
      pickerIndex: picker.selectedIndex,
    })
  }

  const render = async (): Promise<void> => {
    if (!lifecycle.isEntered || disposed || !config.pet) return
    const current = snapshot()
    if (current.pickerOpen) {
      if (animationTimer !== undefined) clearTimeout(animationTimer)
      animationTimer = undefined
      await options.terminal.write(`\u001b[2J\u001b[H${picker.render()}\n`)
      return
    }
    elapsedMs = Math.max(0, Date.now() - animationStartedAtMs)
    const currentNotification = activeNotification()
    if (notification !== undefined && currentNotification === undefined) {
      notification = undefined
      clearNotificationTimer()
      resetAnimationClock()
    }
    const selectedAnimation = currentNotification === undefined ? animation : notificationSpec(currentNotification.kind).animation
    const selection = selectPetTuiFrame(currentPet, selectedAnimation, elapsedMs, config)
    if (selection === undefined) return
    const layout = current.layout
    if (current.protocol !== undefined && options.frameProvider !== undefined) {
      const frame = await options.frameProvider(selection, currentPet)
      if (frame !== undefined && await writePetFrame(options.terminal, current.protocol, frame, layout)) {
        scheduleAnimation(selection.nextFrameInMs)
        return
      }
      if (frame !== undefined) graphicsDisabled = true
    }
    await options.terminal.write(renderPetTextFallback(currentPet, selection.animation, selection.spriteIndex, layout, currentNotification))
    scheduleAnimation(selection.nextFrameInMs)
  }

  const requestRedraw = (): Promise<void> => {
    redrawRequested = true
    if (redrawQueued !== undefined) return redrawQueued
    redrawQueued = Promise.resolve().then(async () => {
      while (redrawRequested && !disposed) {
        redrawRequested = false
        await render()
      }
    }).finally(() => { redrawQueued = undefined })
    return redrawQueued
  }

  const dispatch = async (event: PetTuiInputEvent): Promise<void> => {
    if (disposed) return
    if (event.kind === 'resize') {
      dimensions = event.dimensions
      await requestRedraw()
      return
    }
    if (event.kind === 'eof') {
      await dispose()
      return
    }
    if (event.kind === 'paste') {
      await dispatchLine(event.text)
      return
    }
    if (event.key === 'ArrowUp' && pickerOpen) {
      picker.move(-1)
      await requestRedraw()
      return
    }
    if (event.key === 'ArrowDown' && pickerOpen) {
      picker.move(1)
      await requestRedraw()
      return
    }
    if (event.key === 'Escape' && pickerOpen) {
      pickerOpen = false
      resetAnimationClock()
      await requestRedraw()
      return
    }
    if (event.key === 'Enter' && pickerOpen) {
      currentPet = picker.selected
      animation = 'idle'
      pickerOpen = false
      resetAnimationClock()
      await requestRedraw()
    }
  }

  const dispatchLine = async (line: string): Promise<void> => {
    if (disposed) return
    const input = parsePetsCommand(line)
    if (input !== undefined) {
      pickerOpen = true
      if (animationTimer !== undefined) clearTimeout(animationTimer)
      animationTimer = undefined
      await requestRedraw()
      return
    }
    const match = /^\/([a-z][a-z0-9_-]*)(?:[ \t]+(.*))?$/u.exec(line)
    if (match === null || match[1] === undefined) return
    const command = commands.get(match[1])
    if (command !== undefined) await command.handler(match[2] ?? '')
  }

  const setNotification = async (next: PetNotification): Promise<void> => {
    if (disposed) return
    notification = replaceNotification(notification, next)
    scheduleNotificationExpiry()
    resetAnimationClock()
    await requestRedraw()
  }

  const clearNotification = async (): Promise<void> => {
    if (disposed) return
    notification = undefined
    clearNotificationTimer()
    resetAnimationClock()
    await requestRedraw()
  }

  const start = async (): Promise<PetTuiStartResult> => {
    if (disposed) return { started: false, reason: 'non-tty' }
    if (!options.terminal.stdinIsTTY || !options.terminal.stdoutIsTTY) return { started: false, reason: 'non-tty' }
    resetAnimationClock()
    await lifecycle.enter()
    detachData = options.terminal.onData?.((data) => { void dispatch({ kind: 'paste', text: data }) })
    detachResize = options.terminal.onResize?.((next) => { void dispatch({ kind: 'resize', dimensions: next }) })
    try {
      await requestRedraw()
    } catch (error) {
      await dispose()
      throw error
    }
    return { started: true }
  }

  const registerCommand = (command: PetTuiCommand): (() => void) => {
    if (!/^[a-z][a-z0-9_-]*$/u.test(command.name) || command.name === 'pets') throw new TypeError(`invalid or reserved TUI command: ${command.name}`)
    if (command.description.trim().length === 0 || typeof command.handler !== 'function') throw new TypeError(`TUI command ${command.name} is invalid`)
    if (commands.has(command.name)) throw new Error(`TUI command ${command.name} is already registered`)
    commands.set(command.name, command)
    return () => { if (commands.get(command.name) === command) commands.delete(command.name) }
  }

  const dispose = async (): Promise<void> => {
    if (disposed) return
    disposed = true
    animationTimerVersion += 1
    if (animationTimer !== undefined) clearTimeout(animationTimer)
    animationTimer = undefined
    clearNotificationTimer()
    detachData?.()
    detachResize?.()
    detachData = undefined
    detachResize = undefined
    await lifecycle.cleanup()
  }

  scheduleNotificationExpiry()
  return {
    picker,
    lifecycle,
    start,
    dispatch,
    dispatchLine,
    registerCommand,
    setNotification,
    clearNotification,
    requestRedraw,
    snapshot,
    dispose,
  }
}
