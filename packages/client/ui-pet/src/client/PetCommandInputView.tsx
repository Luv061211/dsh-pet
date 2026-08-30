import { memo } from 'react'
import { MessageText } from '@deepseek-ai/dsh-client-ui-primitives'
import type { PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type { PetCommandInputData } from './pet-command-input.ts'
import css from './PetCommandInputView.module.css'

type PetCommandInputViewProps =
  PropsRuntime<'conversation.chat.node', 'pet-command-input'>
  & PropsLocale<'pet'>

/** Right-aligned `/pet` input bubble without ordinary message actions. */
export const PetCommandInputView = memo(function PetCommandInputView({
  node, t,
}: PetCommandInputViewProps) {
  const data: PetCommandInputData = node.data
  return (
    <div
      className={css.row}
      data-command-input=""
      data-pet-command-input=""
      role="group"
      aria-label={t('commandInput.aria')}
    >
      <div className={css.stack}>
        <div className={css.bubble}>
          <MessageText text={data.text} />
        </div>
      </div>
    </div>
  )
})
