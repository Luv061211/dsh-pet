/** Types shared by the DSH Web host and the Electron desktop shell. */

/** One local renderer that the desktop shell may mount as its companion window. */
export interface DesktopCompanionDescriptor {
  /** Stable id used by the desktop shell to own persisted window placement. */
  readonly id: string
  /** Origin-relative renderer URL hosted by the local Harness server. */
  readonly entryPath: string
  /** Fixed companion content width in CSS pixels. */
  readonly width: number
  /** Fixed companion content height in CSS pixels. */
  readonly height: number
  /** Optional generic host operations enabled for this renderer. */
  readonly capabilities?: DesktopCompanionCapabilities
}

/** Resize limits accepted by the generic companion shell. */
export interface DesktopCompanionResizeCapability {
  readonly minWidth: number
  readonly maxWidth: number
  readonly minHeight: number
  readonly maxHeight: number
}

/** Capabilities understood by the generic desktop shell, independent of pet state. */
export interface DesktopCompanionCapabilities {
  readonly drag?: boolean
  readonly pointerInteraction?: boolean
  readonly resize?: DesktopCompanionResizeCapability
}
