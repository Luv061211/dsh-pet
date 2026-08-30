// @vitest-environment jsdom
import { cleanup, render, within } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import type {
  ChatConversationViewNode, ChatSnapshot, ConversationEventInput,
  ConversationNodeDefinition, ConversationViewDefinition,
} from '@deepseek-ai/dsh-client-runtime/client'
import { ConversationNodeAssembler } from '@deepseek-ai/dsh-client-runtime/client'
import { makeTranslate } from '@deepseek-ai/dsh-client-test-runtime'
import { zh as commonZh } from '@deepseek-ai/dsh-client-locale/src/locales/zh.ts'
import type { SessionEvent } from '@deepseek-ai/dsh-session/types'
import { commandDefinition } from '@deepseek-ai/dsh-client-ui-conversation/src/client/conversation-nodes/command.ts'
import { chatViewDefinition } from '@deepseek-ai/dsh-client-ui-conversation/src/client/conversation-nodes/chat-snapshot-builder.ts'
import { PetCommandInputView } from '../src/client/PetCommandInputView.tsx'
import {
  petCommandInputDefinition, petCommandText,
} from '../src/client/pet-command-input.ts'
import { zh } from '../src/client/locales.ts'

afterEach(cleanup)

class TestEventDefinitions {
  entries(): readonly ConversationNodeDefinition[] {
    return [commandDefinition, petCommandInputDefinition]
  }

  fallbackEntry(): undefined {
    return undefined
  }
}

class TestViewDefinitions {
  entries(): readonly ConversationViewDefinition[] {
    return [chatViewDefinition]
  }
}

function entry(seq: number, type: string, data: unknown): ConversationEventInput {
  return {
    event: { seq, time: 1_700_000_000_000 + seq, type, data } as ConversationEventInput['event'],
    view: undefined,
  }
}

function snapshot(entries: readonly ConversationEventInput[], hasMore = false): ChatSnapshot {
  const assembler = new ConversationNodeAssembler(new TestEventDefinitions(), new TestViewDefinitions())
  assembler.replaceWindow(entries, hasMore)
  assembler.flush()
  const value = assembler.snapshot('chat') as ChatSnapshot | undefined
  if (value === undefined) throw new Error('chat view was not registered')
  return value
}

function node(value: ChatSnapshot, kind: string): ChatConversationViewNode | undefined {
  return value.nodes.values().find(candidate => candidate.kind === kind)
}

describe('pet command input projection', () => {
  it('builds a separate input Node before the generic command result and restores it on replay', () => {
    const run = entry(1, 'command/run', {
      commandId: 'command-pet', name: 'pet', args: ' status ', source: { kind: 'user' },
    })
    const done = entry(2, 'command/done', {
      commandId: 'command-pet', kind: 'success', text: 'Pet: deepseek-whale\nState: awake',
    })
    const value = snapshot([run, done])

    expect(value.order.map(key => value.nodes.get(key)?.kind)).toEqual(['pet-command-input', 'command'])
    expect(node(value, 'pet-command-input')).toMatchObject({
      anchorSeq: 0.9,
      data: { commandId: 'command-pet', text: '/pet status' },
    })
    expect(node(value, 'command')?.data).toMatchObject({
      name: 'pet', args: ' status ', outcome: { kind: 'success', text: 'Pet: deepseek-whale\nState: awake' },
    })

    const doneOnly = snapshot([done], true)
    expect(node(doneOnly, 'pet-command-input')).toBeUndefined()
    expect(node(doneOnly, 'command')?.data).toMatchObject({ name: null, args: null })
  })

  it('ignores other commands and preserves internal multiline arguments', () => {
    const plan = entry(1, 'command/run', {
      commandId: 'command-plan', name: 'plan', args: '', source: { kind: 'user' },
    })
    const pet = entry(2, 'command/run', {
      commandId: 'command-pet', name: 'pet', args: '\nstatus\nnow \n', source: { kind: 'user' },
    })

    expect(petCommandInputDefinition.match(plan.event)).toBeNull()
    expect(petCommandText(pet.event as SessionEvent<'command/run'>))
      .toBe('/pet\nstatus\nnow')
  })

  it('keeps the Definition total across fallback paths', () => {
    const run = entry(3, 'command/run', {
      commandId: 'command-pet', name: 'pet', source: { kind: 'user' },
    })
    const match = {
      ...run,
      role: 'start' as const,
      location: { kind: 'session' as const },
    }
    const state = petCommandInputDefinition.start({} as never, match, {} as never)

    expect(state.text).toBe('/pet')
    expect(petCommandInputDefinition.update({ state } as never, match)).toBe(state)
    expect(petCommandInputDefinition.buildViewNode!({ state: undefined } as never)).toBeNull()
    expect(petCommandInputDefinition.buildViewNode!({
      key: 'pet-command-input', id: 'command-pet', state, start: undefined,
    } as never)).toMatchObject({ location: { kind: 'unresolved' } })

    const done = entry(4, 'command/done', { commandId: 'command-pet', kind: 'success' })
    expect(() => petCommandInputDefinition.start({} as never, {
      ...done, role: 'start', location: { kind: 'session' },
    } as never, {} as never)).toThrow('pet-command-input start requires command/run')
  })

  it('renders the user-style command bubble without ordinary message actions', () => {
    const t = makeTranslate(zh, commonZh)
    const props = {
      node: {
        key: 'pet-command-input:one',
        data: { commandId: 'command-pet', text: '/pet status', time: 1_700_000_000_000 },
      },
      t,
    } as unknown as Parameters<typeof PetCommandInputView>[0]
    const view = render(<PetCommandInputView {...props} />)
    const bubble = view.getByRole('group', { name: '命令输入' })

    expect(bubble.textContent).toBe('/pet status')
    expect(within(bubble).queryByRole('button')).toBeNull()
  })
})
