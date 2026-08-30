/** Types for the standalone DSH terminal host and pet consumer. */

import type {
  PetAnimationSelection,
  PetNotification,
  PetPackage,
  TerminalPetEnvironment,
  TerminalPetProtocol,
} from '@deepseek-ai/dsh-pet-compat'

/** Terminal location used by Codex-compatible pet presentation. */
export type PetTuiAnchor = 'composer' | 'screen-bottom'

/** Validated configuration owned by the TUI pet consumer. */
export interface PetTuiConfig {
  /** Whether the pet is presented at all. */
  readonly pet: boolean
  /** Terminal anchor used for the pet image or text marker. */
  readonly petAnchor: PetTuiAnchor
  /** Whether animation scheduling is enabled. */
  readonly animations: boolean
  /** Number of terminal columns reserved for the pet. */
  readonly reserveColumns: number
  /** Whether graphics output may be attempted. */
  readonly imageEnabled: boolean
  /** Hold the first frame when reduced motion is requested. */
  readonly reducedMotion: boolean
}

/** Raw profile keys accepted before the host normalizes camel-case fields. */
export interface PetTuiConfigInput extends Partial<PetTuiConfig> {
  /** Profile spelling for the composer/screen-bottom anchor. */
  readonly pet_anchor?: PetTuiAnchor
}

/** Explicit DSH defaults for the TUI configuration surface. */
export const DEFAULT_PET_TUI_CONFIG: PetTuiConfig = Object.freeze({
  pet: true,
  petAnchor: 'composer',
  animations: true,
  reserveColumns: 2,
  imageEnabled: true,
  reducedMotion: false,
})

/** Terminal dimensions in character cells. */
export interface TuiDimensions {
  readonly columns: number
  readonly rows: number
}

/** A frame payload already converted by the owning host. */
export interface PetTuiFramePayload {
  /** Selected atlas frame. */
  readonly selection: PetAnimationSelection
  /** Converted frame bytes or a protocol-specific encoded payload. */
  readonly bytes: Uint8Array | string
  /** Pixel width of the converted frame. */
  readonly width: number
  /** Pixel height of the converted frame. */
  readonly height: number
  /** Stable cache identity for the converted frame. */
  readonly cacheKey: string
}

/** Input accepted by the host decoder. */
export type PetTuiInputEvent =
  | { readonly kind: 'key'; readonly key: string }
  | { readonly kind: 'paste'; readonly text: string }
  | { readonly kind: 'resize'; readonly dimensions: TuiDimensions }
  | { readonly kind: 'eof' }

/** Minimal terminal adapter; it intentionally has no model or session methods. */
export interface PetTuiTerminal {
  readonly stdinIsTTY: boolean
  readonly stdoutIsTTY: boolean
  readonly write: (data: string) => void | Promise<void>
  readonly setRawMode?: (enabled: boolean) => void
  readonly onData?: (handler: (data: string) => void) => () => void
  readonly onResize?: (handler: (dimensions: TuiDimensions) => void) => () => void
}

/** Pure layout result consumed by a terminal output renderer. */
export interface PetTuiLayout {
  readonly anchor: PetTuiAnchor
  readonly x: number
  readonly y: number
  readonly reservedColumns: number
  readonly reservedRows: number
}

/** Normalized command definition owned by the host. */
export interface PetTuiCommand {
  readonly name: string
  readonly description: string
  readonly handler: (rawInput: string) => void | Promise<void>
}

/** Result of attempting to enter an interactive TTY. */
export type PetTuiStartResult =
  | { readonly started: true }
  | { readonly started: false; readonly reason: 'non-tty' }

/** Read-only view exposed to a renderer or command handler. */
export interface PetTuiSnapshot {
  readonly pet: PetPackage
  readonly config: PetTuiConfig
  readonly dimensions: TuiDimensions
  readonly environment: TerminalPetEnvironment
  readonly protocol: TerminalPetProtocol | undefined
  readonly animation: string
  readonly elapsedMs: number
  /** Current Codex-style single-slot notification, when its lifetime has not elapsed. */
  readonly notification: PetNotification | undefined
  readonly layout: PetTuiLayout
  readonly pickerOpen: boolean
  readonly pickerIndex: number
}
