/** Browser-safe terminal graphics protocol selection. */

import type { TerminalPetEnvironment, TerminalPetProtocolResult } from './types.ts'

/**
 * Select a safe terminal graphics protocol from facts supplied by a TUI host.
 * @param environment - normalized terminal and multiplexer facts.
 * @returns a graphics protocol or the reason image output is disabled.
 */
export function detectTerminalPetProtocol(environment: TerminalPetEnvironment): TerminalPetProtocolResult {
  if (environment.multiplexer === 'tmux') return { supported: false, reason: 'tmux' }
  if (environment.multiplexer === 'zellij') return { supported: false, reason: 'zellij' }
  if (environment.kittyWindowId === true || environment.wezterm === true) return { supported: true, protocol: 'kitty' }
  if (isIterm2(environment)) return supportsIterm2KittyGraphics(environment.version)
    ? { supported: true, protocol: 'kitty-local-file' }
    : { supported: false, reason: 'iterm2-too-old' }
  if (hasKittyGraphics(environment)) return { supported: true, protocol: 'kitty' }
  if (hasSixelGraphics(environment)) return { supported: true, protocol: 'sixel' }
  return { supported: false, reason: 'terminal' }
}

function isIterm2(environment: TerminalPetEnvironment): boolean {
  return normalize(environment.terminal) === 'iterm2' || includes(environment.terminalProgram, 'iterm')
}

function hasKittyGraphics(environment: TerminalPetEnvironment): boolean {
  return ['ghostty', 'kitty', 'wezterm'].includes(normalize(environment.terminal))
    || ['kitty', 'ghostty', 'wezterm'].some(name => includes(environment.term, name) || includes(environment.terminalProgram, name))
}

function hasSixelGraphics(environment: TerminalPetEnvironment): boolean {
  return normalize(environment.terminal) === 'windows-terminal'
    || ['sixel', 'mlterm', 'foot'].some(name => includes(environment.term, name))
}

function supportsIterm2KittyGraphics(version: string | undefined): boolean {
  const parsed = parseDottedVersion(version)
  if (parsed === undefined) return false
  const [major, minor, patch] = parsed
  return major > 3 || major === 3 && (minor > 6 || minor === 6 && patch >= 0)
}

function parseDottedVersion(version: string | undefined): readonly [number, number, number] | undefined {
  if (version === undefined || !/^\d+(?:\.\d+){0,2}$/.test(version)) return undefined
  const [major = '0', minor = '0', patch = '0'] = version.split('.')
  return [Number(major), Number(minor), Number(patch)]
}

function normalize(value: string | undefined): string {
  return value?.toLocaleLowerCase() ?? ''
}

function includes(value: string | undefined, expected: string): boolean {
  return normalize(value).includes(expected)
}
