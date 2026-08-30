import { describe, expect, it, vi } from 'vitest'
import { createNotification, parsePetPackage } from '@luv1211/dsh-pet-compat'
import {
  encodePetFrame,
  TERMINAL_CLEANUP,
  TERMINAL_ENTER,
  createPetTuiHost,
  petLayout,
  renderPetTextFallback,
  type PetTuiTerminal,
} from '../src/index.ts'

function pet(id = 'deepseek-whale', displayName = 'DeepSeek Whale') {
  const result = parsePetPackage({
    id,
    displayName,
    spritesheetPath: 'spritesheet.webp',
    spritesheetDimensions: { width: 1536, height: 1872 },
  })
  if (!result.accepted) throw new Error(result.reason)
  return result.pet
}

function terminal(
  isTTY = true,
  write?: PetTuiTerminal['write'],
): PetTuiTerminal & { writes: string[]; modes: boolean[] } {
  const writes: string[] = []
  const modes: boolean[] = []
  const output = write ?? ((data: string) => { writes.push(data) })
  return {
    stdinIsTTY: isTTY,
    stdoutIsTTY: isTTY,
    writes,
    modes,
    write: output,
    setRawMode: (enabled) => { modes.push(enabled) },
  }
}

describe('minimal DSH TUI pet host', () => {
  it('does not mutate a non-TTY terminal', async () => {
    const io = terminal(false)
    const host = createPetTuiHost({ terminal: io, pet: pet(), environment: {}, dimensions: { columns: 80, rows: 24 } })
    await expect(host.start()).resolves.toEqual({ started: false, reason: 'non-tty' })
    expect(io.writes).toEqual([])
    expect(io.modes).toEqual([])
  })

  it('restores raw mode when terminal entry fails after mutation', async () => {
    const io = terminal(true, vi.fn(() => { throw new Error('closed terminal') }))
    const host = createPetTuiHost({ terminal: io, pet: pet(), environment: {}, dimensions: { columns: 80, rows: 24 } })
    await expect(host.start()).rejects.toThrow('closed terminal')
    expect(io.modes).toEqual([true, false])
  })

  it('enters once, renders text fallback, and restores exactly once', async () => {
    const io = terminal()
    const host = createPetTuiHost({
      terminal: io,
      pet: pet(),
      environment: { terminal: 'unknown' },
      dimensions: { columns: 80, rows: 24 },
      config: { imageEnabled: false, animations: false },
    })
    await expect(host.start()).resolves.toEqual({ started: true })
    expect(io.writes[0]).toBe(TERMINAL_ENTER)
    expect(io.writes.some(value => value.includes('DeepSeek Whale:idle:0'))).toBe(true)
    await host.dispose()
    await host.dispose()
    expect(io.writes.at(-1)).toBe(TERMINAL_CLEANUP)
    expect(io.modes).toEqual([true, false])
    expect(renderPetTextFallback(pet(), 'failed', 40, petLayout({ columns: 80, rows: 24 }, 'composer', 2), {
      kind: 'failed',
      updatedAtMs: 0,
    })).toContain(':Blocked]')
  })

  it('coalesces redraw requests and keeps composer/screen-bottom anchors distinct', async () => {
    const io = terminal()
    const host = createPetTuiHost({
      terminal: io,
      pet: pet(),
      environment: {},
      dimensions: { columns: 12, rows: 4 },
      config: { imageEnabled: false },
    })
    await host.start()
    const before = io.writes.length
    await Promise.all([host.requestRedraw(), host.requestRedraw(), host.requestRedraw()])
    expect(io.writes.length).toBe(before + 1)
    expect(petLayout({ columns: 12, rows: 4 }, 'composer', 2).x).toBe(10)
    expect(petLayout({ columns: 12, rows: 4 }, 'screen-bottom', 2).x).toBe(0)
    await host.dispose()
  })

  it('schedules the next Codex frame from the normalized frame cadence', async () => {
    vi.useFakeTimers()
    try {
      const result = parsePetPackage({
        id: 'animated',
        displayName: 'Animated Bot',
        spritesheetPath: 'spritesheet.webp',
        spritesheetDimensions: { width: 1536, height: 1872 },
        animations: { idle: { frames: [0, 1], fps: 60, loop: true } },
      })
      if (!result.accepted) throw new Error(result.reason)
      const io = terminal()
      const host = createPetTuiHost({
        terminal: io,
        pet: result.pet,
        environment: { terminal: 'unknown' },
        dimensions: { columns: 80, rows: 24 },
        config: { imageEnabled: false },
      })
      await host.start()
      await vi.advanceTimersByTimeAsync(17)
      expect(io.writes.some(value => value.includes('Animated Bot:idle:1'))).toBe(true)
      await host.dispose()
    } finally {
      vi.useRealTimers()
    }
  })

  it('selects and expires the Codex single-slot notification animation', async () => {
    vi.useFakeTimers()
    try {
      const io = terminal()
      const host = createPetTuiHost({
        terminal: io,
        pet: pet(),
        environment: { terminal: 'unknown' },
        dimensions: { columns: 80, rows: 24 },
        config: { imageEnabled: false },
        notification: createNotification('waiting', Date.now()),
      })
      await host.start()
      expect(host.snapshot()).toMatchObject({ animation: 'waiting', notification: { kind: 'waiting' } })
      await vi.advanceTimersByTimeAsync(86_400_001)
      await host.requestRedraw()
      expect(host.snapshot()).toMatchObject({ animation: 'idle', notification: undefined })
      await host.dispose()
    } finally {
      vi.useRealTimers()
    }
  })

  it('opens the /pets picker and invalidates stale previews', async () => {
    const io = terminal()
    const host = createPetTuiHost({
      terminal: io,
      pet: pet(),
      environment: {},
      dimensions: { columns: 80, rows: 24 },
      config: { imageEnabled: false },
    })
    await host.start()
    await host.dispatchLine('/pets')
    expect(host.snapshot().pickerOpen).toBe(true)
    const first = host.picker.loadPreview(async () => {
      await new Promise(resolve => setTimeout(resolve, 10))
      return 'old'
    })
    const second = host.picker.loadPreview(async () => 'new')
    await expect(first).resolves.toBeUndefined()
    await expect(second).resolves.toBe('new')
    await host.dispose()
  })

  it('commits the selected package after picker confirmation and accepts pet_anchor', async () => {
    const io = terminal()
    const host = createPetTuiHost({
      terminal: io,
      pet: pet(),
      pets: [pet(), pet('quiet-otter', 'Quiet Otter')],
      environment: { terminal: 'unknown' },
      dimensions: { columns: 80, rows: 24 },
      config: { imageEnabled: false, pet_anchor: 'screen-bottom' },
    })
    await host.start()
    await host.dispatchLine('/pets')
    await host.dispatch({ kind: 'key', key: 'ArrowDown' })
    await host.dispatch({ kind: 'key', key: 'Enter' })
    expect(host.snapshot()).toMatchObject({ pet: { id: 'quiet-otter' }, config: { petAnchor: 'screen-bottom' } })
    await host.dispose()
  })

  it('disables graphics after a failed frame write and falls back to text', async () => {
    const write = vi.fn((data: string) => {
      if (data.includes('\u001b_G')) throw new Error('graphics failed')
    })
    const io = terminal(true, write)
    const current = pet()
    const host = createPetTuiHost({
      terminal: io,
      pet: current,
      environment: { terminal: 'kitty' },
      dimensions: { columns: 80, rows: 24 },
      frameProvider: selection => ({
        selection,
        bytes: new Uint8Array([1, 2, 3]),
        width: 192,
        height: 208,
        cacheKey: 'frame',
      }),
    })
    await host.start()
    expect(host.snapshot().protocol).toBeUndefined()
    expect(write.mock.calls.some(([value]) => value.includes('DeepSeek Whale'))).toBe(true)
    await host.dispose()
  })

  it('rejects duplicate commands and keeps handlers host-local', async () => {
    const io = terminal()
    const host = createPetTuiHost({ terminal: io, pet: pet(), environment: {}, dimensions: { columns: 80, rows: 24 } })
    const handler = vi.fn()
    host.registerCommand({ name: 'hello', description: 'test', handler })
    expect(() => host.registerCommand({ name: 'hello', description: 'test', handler })).toThrow(/already registered/)
    await host.dispatchLine('/hello value')
    expect(handler).toHaveBeenCalledWith('value')
    await host.dispose()
  })

  it('emits protocol-specific frame and cleanup sequences', () => {
    const selection = { animation: 'idle', spriteIndex: 0 }
    const layout = petLayout({ columns: 80, rows: 24 }, 'composer', 2)
    expect(encodePetFrame('kitty', { selection, bytes: new Uint8Array([1]), width: 192, height: 208, cacheKey: 'k' }, layout)).toContain('\u001b_Ga=T')
    expect(encodePetFrame('kitty-local-file', { selection, bytes: 'C:/dsh/pet.png', width: 192, height: 208, cacheKey: 'k' }, layout)).toContain('t=f')
    expect(encodePetFrame('sixel', { selection, bytes: 'encoded', width: 192, height: 208, cacheKey: 's' }, layout)).toContain('\u001bPqencoded')
  })
})
