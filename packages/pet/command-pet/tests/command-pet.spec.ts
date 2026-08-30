import { describe, expect, it, vi } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import type { CommandDefinition, CommandInvocation, CommandResult } from '@deepseek-ai/dsh-commands'
import { apply } from '@deepseek-ai/dsh-command-pet'

function boot(): { definition: CommandDefinition; setAwake: ReturnType<typeof vi.fn> } {
  const ctx = new Context()
  let definition: CommandDefinition | undefined
  ctx.provide('commands', { register: (item: CommandDefinition) => { definition = item; return () => {} } } as never)
  const setAwake = vi.fn(async (awake: boolean) => ({ preference: { selectedPetId: 'deepseek-whale', awake } }))
  ctx.provide('pets', { getSnapshot: () => ({ preference: { selectedPetId: 'deepseek-whale', awake: true } }), setAwake } as never)
  apply(ctx)
  return { definition: definition as CommandDefinition, setAwake }
}

async function run(booted: ReturnType<typeof boot>, rawInput: string): Promise<CommandResult> {
  return await booted.definition.handler({ rawInput } as CommandInvocation)
}

describe('/pet command', () => {
  it('toggles awake state when invoked without an argument', async () => {
    const booted = boot()
    await expect(run(booted, '')).resolves.toMatchObject({ kind: 'success', text: 'Pet tucked away.' })
    expect(booted.setAwake).toHaveBeenCalledWith(false)
  })
  it('supports wake, tuck, and status but rejects former game commands', async () => {
    const booted = boot()
    await run(booted, 'wake')
    await run(booted, 'tuck')
    const status = await run(booted, 'status')
    expect(status).toMatchObject({ kind: 'success' })
    expect(status.text).toContain('deepseek-whale')
    await expect(run(booted, 'feed')).resolves.toMatchObject({ kind: 'error' })
    expect(booted.setAwake).toHaveBeenNthCalledWith(1, true)
    expect(booted.setAwake).toHaveBeenNthCalledWith(2, false)
  })
})
