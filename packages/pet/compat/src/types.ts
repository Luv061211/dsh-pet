/** Browser-safe values for Codex-compatible pet packages and rendering. */

/** One atlas-cell geometry declared by a pet manifest. */
export interface PetFrameGeometry {
  /** Width of one sprite cell in pixels. */
  readonly width: number
  /** Height of one sprite cell in pixels. */
  readonly height: number
  /** Number of sprite columns. */
  readonly columns: number
  /** Number of sprite rows. */
  readonly rows: number
}

/** Pixel dimensions supplied by a host after it decodes a spritesheet. */
export interface PetSpritesheetDimensions {
  /** Full spritesheet width in pixels. */
  readonly width: number
  /** Full spritesheet height in pixels. */
  readonly height: number
}

/** One drawable frame and the time it remains current. */
export interface PetAnimationFrame {
  /** Zero-based sprite index within the atlas. */
  readonly spriteIndex: number
  /** Positive visible duration in milliseconds. */
  readonly durationMs: number
}

/** A named animation sequence resolved from a pet package. */
export interface PetAnimation {
  /** Ordered frames in this sequence. */
  readonly frames: readonly PetAnimationFrame[]
  /** Frame index where repetition begins, or null for a one-shot sequence. */
  readonly loopStart: number | null
  /** Named animation selected after a completed one-shot sequence. */
  readonly fallback: string
}

/** Resolved package metadata safe for hosts and browser renderers. */
export interface PetPackage {
  /** Stable package identifier. */
  readonly id: string
  /** User-facing package name. */
  readonly displayName: string
  /** Optional package description normalized to an empty string when absent. */
  readonly description: string
  /** Manifest-relative spritesheet path. */
  readonly spritesheetPath: string
  /** Validated atlas geometry. */
  readonly frame: PetFrameGeometry
  /** Addressable cell count. */
  readonly frameCount: number
  /** Built-in and manifest-declared animation tracks. */
  readonly animations: Readonly<Record<string, PetAnimation>>
}

/** Normalized input accepted by the browser-safe package parser. */
export interface PetPackageCandidate {
  /** Package identifier, when present in the manifest. */
  readonly id?: unknown
  /** User-facing name, when present in the manifest. */
  readonly displayName?: unknown
  /** Optional package description. */
  readonly description?: unknown
  /** Manifest-relative spritesheet path. */
  readonly spritesheetPath?: unknown
  /** Host-normalized marker for an absolute spritesheet path. */
  readonly spritesheetPathKind?: unknown
  /** Atlas cell grid, defaulting to the Codex nine-row geometry. */
  readonly frame?: unknown
  /** Decoded spritesheet dimensions supplied by the host. */
  readonly spritesheetDimensions?: unknown
  /** Optional custom animation tracks. */
  readonly animations?: unknown
}

/** Stable failure reason returned by the package parser. */
export type PetPackageRejectionReason =
  | 'manifest-not-object'
  | 'manifest-id-invalid'
  | 'manifest-display-name-invalid'
  | 'spritesheet-path-outside-pet-directory'
  | 'spritesheet-dimensions-invalid'
  | 'frame-geometry-not-codex-compatible'
  | 'frame-grid-does-not-cover-spritesheet'
  | 'frame-count-exceeds-maximum'
  | 'animation-invalid'
  | 'animation-frame-out-of-range'
  | 'animation-fallback-missing'

/** Successful or rejected package-parser result. */
export type PetPackageParseResult =
  | { readonly accepted: true; readonly pet: PetPackage }
  | { readonly accepted: false; readonly reason: PetPackageRejectionReason }

/** One frame selected for a renderer at a specific elapsed time. */
export interface PetAnimationSelection {
  /** Animation that supplied the selected frame. */
  readonly animation: string
  /** Selected zero-based sprite index. */
  readonly spriteIndex: number
  /** Delay before the renderer should request another frame, when animated. */
  readonly nextFrameInMs?: number
}

/** Codex notification state that selects an ambient animation. */
export type PetNotificationKind = 'running' | 'waiting' | 'review' | 'failed'

/** Source-derived label, fallback body, and lifetime for one notification kind. */
export interface PetNotificationSpec {
  /** Animation track selected while this notification is visible. */
  readonly animation: PetNotificationKind
  /** Compact label used by terminal hosts. */
  readonly label: string
  /** Body used when the caller does not supply one. */
  readonly fallbackBody: string
  /** Lifetime in milliseconds before the slot becomes idle. */
  readonly lifetimeMs: number
}

/** One current single-slot ambient notification. */
export interface PetNotification {
  /** Notification urgency and animation name. */
  readonly kind: PetNotificationKind
  /** Epoch milliseconds when the notification became current. */
  readonly updatedAtMs: number
  /** Optional user-visible notification text. */
  readonly body?: string
}

/** Inputs that identify a frame-cache directory. */
export interface PetSpriteCacheIdentity {
  /** Hexadecimal digest calculated by a host from the spritesheet bytes. */
  readonly contentDigest: string
  /** Validated atlas geometry. */
  readonly frame: PetFrameGeometry
}

/** Browser-safe terminal facts provided by the TUI host. */
export interface TerminalPetEnvironment {
  /** Host-normalized terminal family. */
  readonly terminal?: string
  /** Terminal-reported program name. */
  readonly terminalProgram?: string
  /** Terminal-reported dotted version. */
  readonly version?: string
  /** TERM value. */
  readonly term?: string
  /** Active multiplexer, when one owns the terminal pane. */
  readonly multiplexer?: 'tmux' | 'zellij'
  /** Whether the Kitty environment marker is present. */
  readonly kittyWindowId?: boolean
  /** Whether a WezTerm environment marker is present. */
  readonly wezterm?: boolean
}

/** Terminal graphics protocol selected for a compatible pet. */
export type TerminalPetProtocol = 'kitty' | 'kitty-local-file' | 'sixel'

/** Safe terminal-image result, including why image rendering was withheld. */
export type TerminalPetProtocolResult =
  | { readonly supported: true; readonly protocol: TerminalPetProtocol }
  | { readonly supported: false; readonly reason: 'tmux' | 'zellij' | 'iterm2-too-old' | 'terminal' }
