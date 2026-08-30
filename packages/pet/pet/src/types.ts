/**
 * Client-safe types for durable pet preferences and globally aggregated
 * session activity.
 * @module @deepseek-ai/dsh-pet/types
 */

// The pure-types subpath: the session entry re-exports the Context merge
// (`sessions: SessionStore`), which would collide with the browser runtime's
// `ISessions` face in every client-face program that reaches this module.
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import type { PetAnimation, PetFrameGeometry } from '@deepseek-ai/dsh-pet-compat/types'

/** The only durable preference document accepted by the compatible pet domain. */
export interface PetPreference {
  /** Schema version of the preference document. */
  readonly version: 3
  /** Identifier of the selected built-in or imported pet package. */
  readonly selectedPetId: string
  /** Whether the selected pet is awake and rendered by companion clients. */
  readonly awake: boolean
  /** Logical CSS height of one atlas cell. */
  readonly sizePx: number
}

/** A validated compatible package descriptor safe to expose to clients. */
export interface PetDescriptor {
  /** Stable package identifier. */
  readonly id: string
  /** Whether the catalog loaded the package from its embedded assets or the user root. */
  readonly source: 'builtin' | 'user'
  /** Human-readable package name. */
  readonly displayName: string
  /** Optional bounded package description. */
  readonly description?: string
  /** Validated sprite-cell geometry. */
  readonly frame: PetFrameGeometry
  /** Validated named animation tracks. */
  readonly animations: Readonly<Record<string, PetAnimation>>
  /** Origin-relative URL for the validated spritesheet. */
  readonly assetUrl: string
}

/** Detached catalog read model. */
export interface PetCatalog {
  /** Immutable built-in and user package descriptors in deterministic order. */
  readonly pets: readonly PetDescriptor[]
}

/** Native operations advertised by the current host composition. */
export interface PetHostCapabilities {
  /** True when a host-native package picker is available. */
  readonly canImport: boolean
  /** True when the host can open the DSH pet directory. */
  readonly canOpenFolder: boolean
}

/** Pending interaction kinds the host activity projection can report. */
export type PetPendingInteraction = 'approval' | 'plan-review' | 'question'

/** Host-owned session activity record consumed by the pet adapter. */
export interface PetHostActivityRecord {
  /** Opaque session identifier. */
  readonly sessionId: SessionId
  /** Stable display fallback. */
  readonly title: string
  /** Host's current coarse session condition. */
  readonly status: 'running' | 'blocked' | 'idle'
  /** Epoch ms when the host condition changed. */
  readonly since: number
  /** Pending interaction, when user input currently blocks progress. */
  readonly pendingInteraction?: PetPendingInteraction
  /** Whether the host still exposes a completion notification for this session. */
  readonly completed: boolean
}

/** Host activity projection seam used by PetService. */
export interface PetActivitySource {
  /** Read a detached current host projection. */
  getSnapshot(): readonly PetHostActivityRecord[]
  /** Subscribe to detached projection replacements and return its disposer. */
  subscribe(listener: (records: readonly PetHostActivityRecord[]) => void): () => void
}

/** Bytes selected by a host-native package picker; the client never supplies a path. */
export interface PetPackageBytes {
  /** UTF-8 compatible pet.json bytes. */
  readonly manifestBytes: Uint8Array
  /** Validated by PetService before publication. */
  readonly spritesheetBytes: Uint8Array
}

/** Native-only operations supplied by a local host composition. */
export interface PetNativeActions {
  /** Open the native package chooser and return bytes, or null on cancellation. */
  pickPetPackage(): Promise<PetPackageBytes | null>
  /** Open one service-owned directory; hosts never accept a client-supplied path here. */
  openPetFolder(path: string): Promise<void>
}

/** Result of a Remote import request with no native host capability. */
export type PetImportResult =
  | { readonly outcome: 'published'; readonly pet: PetDescriptor }
  | { readonly outcome: 'cancelled' | 'host-unavailable' }

/** Result of a Remote request to open the DSH pet directory. */
export type PetFolderResult =
  | { readonly outcome: 'opened' }
  | { readonly outcome: 'host-unavailable' }

declare module '@deepseek-ai/cordis' {
  interface Context {
    /** Optional host-owned activity projection consumed by the pet service. */
    petActivity?: PetActivitySource
    /** Optional native-only pet actions; browser compositions leave it absent. */
    petNative?: PetNativeActions
  }
}

/** The user-facing urgency states of one live session. */
export type PetActivityStatus = 'running' | 'needs-input' | 'ready' | 'blocked'

/** One current activity record aggregated from a live session. */
export interface PetSessionActivity {
  /** Opaque identifier of the represented session. */
  readonly sessionId: SessionId
  /** Stable display fallback for clients that have not loaded a session title. */
  readonly title: string
  /** Current user-action urgency. */
  readonly status: PetActivityStatus
  /** Epoch ms when the activity entered its current status. */
  readonly since: number
}

/** The remote pet read model: durable preference plus ordered live activity. */
export interface PetSnapshot {
  /** Persisted user preference. */
  readonly preference: PetPreference
  /** Validated package catalog. */
  readonly catalog: PetCatalog
  /** Host-local absolute path of the user package root, for display beside the managed-directory actions. */
  readonly petRoot: string
  /** Capability flags used to gate native-only controls. */
  readonly capabilities: PetHostCapabilities
  /** All live-session records in deterministic selection order. */
  readonly activities: readonly PetSessionActivity[]
  /** Highest-priority activity when one exists. */
  readonly selectedActivity?: PetSessionActivity
}

declare module '@deepseek-ai/cordis' {
  interface Events {
    /**
     * The pet service published a fresh durable preference or live activity
     * snapshot. Preference mutations are emitted after the settings provider
     * persists the namespace.
     * @param snapshot - detached fresh preference and ordered activity records.
     * @mode emit
     */
    'pet/update'(snapshot: PetSnapshot): void
  }
}
