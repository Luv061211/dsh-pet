/** Slash-command picker and preview invalidation for the terminal pet. */

import type { PetPackage } from '@luv061211/dsh-pet-compat'

/**
 * Parse only the host-owned `/pets` command.
 * @param line - complete input line.
 * @returns trailing picker input, or undefined for another command.
 */
export function parsePetsCommand(line: string): string | undefined {
  const match = /^\/pets(?:[ \t]+(.*))?$/u.exec(line)
  return match === null ? undefined : (match[1] ?? '')
}

/** Small deterministic picker with request-versioned asynchronous previews. */
export class PetPicker {
  private index = 0
  private previewRequest = 0
  private previewValue: string | undefined

  /** Create a picker over an immutable catalog snapshot. */
  constructor(private readonly pets: readonly PetPackage[]) {
    if (pets.length === 0) throw new TypeError('pet picker requires at least one package')
  }

  /** Current selected package. */
  get selected(): PetPackage {
    const selected = this.pets[this.index]
    if (selected === undefined) throw new Error('pet picker selection is out of range')
    return selected
  }
  /** Current selected index. */
  get selectedIndex(): number { return this.index }
  /** Current preview value, if the latest request has resolved. */
  get preview(): string | undefined { return this.previewValue }

  /**
   * Move selection and invalidate any previous preview.
   * @param delta - signed number of entries to move.
   * @returns the newly selected package.
   */
  move(delta: number): PetPackage {
    if (!Number.isSafeInteger(delta)) throw new TypeError('picker movement is invalid')
    this.index = (this.index + delta) % this.pets.length
    if (this.index < 0) this.index += this.pets.length
    this.previewRequest += 1
    this.previewValue = undefined
    return this.selected
  }

  /**
   * Load a preview only if its selection request is still current.
   * @param loader - preview loader for the selected package.
   * @returns the preview, or undefined when the request became stale.
   */
  async loadPreview(loader: (pet: PetPackage) => string | Promise<string>): Promise<string | undefined> {
    const request = ++this.previewRequest
    const selected = this.selected
    const value = await loader(selected)
    if (request !== this.previewRequest) return undefined
    this.previewValue = value
    return value
  }

  /**
   * Render the picker as stable text for terminals without graphics.
   * @returns one deterministic text view.
   */
  render(): string {
    return this.pets.map((pet, index) => `${index === this.index ? '>' : ' '} ${pet.displayName}`).join('\n')
  }
}
