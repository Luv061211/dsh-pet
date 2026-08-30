/** Wake or tuck the optional desktop pet companion. */

import type { Context } from '@deepseek-ai/cordis'
import type { CommandInvocation, CommandResult } from '@deepseek-ai/dsh-commands'
import type {} from '@deepseek-ai/dsh-pet'

export const name = 'command-pet'
export const inject = ['commands', 'pets']

/** Execute `/pet`, `/pet wake`, `/pet tuck`, or `/pet status`. */
async function execute(ctx: Context, invocation: CommandInvocation): Promise<CommandResult> {
  const input = invocation.rawInput.trim().toLowerCase()
  const snapshot = ctx.pets.getSnapshot()
  if (input === '' || input === 'toggle') {
    const next = await ctx.pets.setAwake(!snapshot.preference.awake)
    return { kind: 'success', text: next.preference.awake ? 'Pet awake.' : 'Pet tucked away.' }
  }
  if (input === 'wake') {
    await ctx.pets.setAwake(true)
    return { kind: 'success', text: 'Pet awake.' }
  }
  if (input === 'tuck') {
    await ctx.pets.setAwake(false)
    return { kind: 'success', text: 'Pet tucked away.' }
  }
  if (input === 'status') {
    return { kind: 'success', text: `Pet: ${snapshot.preference.selectedPetId}\nState: ${snapshot.preference.awake ? 'awake' : 'tucked'}` }
  }
  return { kind: 'error', text: 'Usage: /pet [wake|tuck|status]' }
}

/** Register the Codex-style pet visibility command. */
export function apply(ctx: Context): void {
  ctx.commands.register({
    name: 'pet',
    description: 'wake or tuck the desktop pet companion',
    input: { hint: '[wake|tuck|status]' },
    handler: invocation => execute(ctx, invocation),
  })
}
