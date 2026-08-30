/** Kitty/Sixel output and terminal lifecycle sequences for the DSH TUI host. */

import type { TerminalPetProtocol } from '@deepseek-ai/dsh-pet-compat'
import type { PetTuiFramePayload, PetTuiLayout, PetTuiTerminal } from './types.ts'

/** Escape sequence that enters the alternate screen and hides the cursor. */
export const TERMINAL_ENTER = '\u001b[?1049h\u001b[?25l'
/** Escape sequence that restores the cursor and previous screen buffer. */
export const TERMINAL_CLEANUP = '\u001b[?25h\u001b[?1049l'

/**
 * Write one converted frame using the selected graphics protocol.
 * @param protocol - Kitty or Sixel protocol.
 * @param frame - host-converted frame payload.
 * @param layout - cursor placement.
 * @returns encoded terminal escape sequence.
 */
export function encodePetFrame(protocol: TerminalPetProtocol, frame: PetTuiFramePayload, layout: PetTuiLayout): string {
  const payload = typeof frame.bytes === 'string' ? frame.bytes : Buffer.from(frame.bytes).toString('base64')
  if (protocol === 'sixel') return `\u001b[${layout.y + 1};${layout.x + 1}H\u001bPq${payload}\u001b\\`
  const local = protocol === 'kitty-local-file' && typeof frame.bytes === 'string' ? ',t=f' : ',t=d'
  return `\u001b[${layout.y + 1};${layout.x + 1}H\u001b_Ga=T,f=100,s=${frame.width},v=${frame.height},i=${frame.selection.spriteIndex}${local};${payload}\u001b\\`
}

/** Write lifecycle output and keep cleanup idempotent. */
export class TerminalLifecycle {
  private entered = false
  private cleaned = false

  /** Create a lifecycle wrapper around one terminal adapter. */
  constructor(private readonly terminal: PetTuiTerminal) {}

  /** Enter the alternate screen after the caller has validated TTY state. */
  async enter(): Promise<void> {
    if (this.entered) return
    this.entered = true
    this.terminal.setRawMode?.(true)
    try {
      await this.terminal.write(TERMINAL_ENTER)
    } catch (error) {
      this.terminal.setRawMode?.(false)
      this.entered = false
      throw error
    }
  }

  /** Restore terminal modes and screen state exactly once. */
  async cleanup(): Promise<void> {
    if (!this.entered || this.cleaned) return
    this.cleaned = true
    this.terminal.setRawMode?.(false)
    await this.terminal.write(TERMINAL_CLEANUP)
  }

  /** Whether the host has acquired terminal state. */
  get isEntered(): boolean { return this.entered && !this.cleaned }
}

/**
 * Emit one frame; a write failure is returned so the host can disable graphics.
 * @param terminal - terminal adapter receiving the sequence.
 * @param protocol - selected graphics protocol.
 * @param frame - host-converted frame payload.
 * @param layout - cursor placement.
 * @returns whether the write completed.
 */
export async function writePetFrame(
  terminal: PetTuiTerminal,
  protocol: TerminalPetProtocol,
  frame: PetTuiFramePayload,
  layout: PetTuiLayout,
): Promise<boolean> {
  try {
    await terminal.write(encodePetFrame(protocol, frame, layout))
    return true
  } catch {
    return false
  }
}
