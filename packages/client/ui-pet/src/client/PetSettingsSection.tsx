import { useState, type CSSProperties, type ReactElement } from 'react'
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import {
  petSpriteAvatar,
  type PetDescriptor,
  type PetImportResult,
} from '@luv061211/dsh-pet/client'
import type { PetSettingsInjected } from './slots.ts'
import css from './PetSettingsSection.module.css'

/** Props delivered to the feature-owned Pet settings page. */
export type PetSettingsSectionProps =
  PropsRuntime<'settings.section'>
  & PropsLocale<'pet'>
  & InjectFace<PetSettingsInjected>

/** Fixed logical height of the static row avatar; it never follows the overlay's size preference. */
const AVATAR_SIZE_PX = 48

/** Render the catalog, display preferences, and host package actions. */
export function PetSettingsSection(props: PetSettingsSectionProps): ReactElement {
  const snapshot = props.usePetState(state => state.snapshot)
  const [publishing, setPublishing] = useState(false)
  const [status, setStatus] = useState<string>()
  const [error, setError] = useState<string>()

  if (snapshot === null) return <div className={css.section}><p className={css.empty}>{props.t('settings.empty')}</p></div>

  const activePetId = (snapshot.catalog.pets.find(pet => pet.id === snapshot.preference.selectedPetId)
    ?? snapshot.catalog.pets[0])?.id
  const run = (action: () => Promise<void>): void => {
    setError(undefined)
    void action().catch((reason: unknown) => {
      setError(reason instanceof Error && reason.message.length > 0 ? reason.message : props.t('settings.actionFailed'))
    })
  }
  const publishPackage = (verb: 'imported' | 'updated', action: () => Promise<PetImportResult>): void => {
    setError(undefined)
    setStatus(undefined)
    setPublishing(true)
    void action().then((result) => {
      setStatus(publishStatus(props.t, verb, result))
    }).catch((reason: unknown) => {
      setError(reason instanceof Error && reason.message.length > 0 ? reason.message : props.t('settings.actionFailed'))
    }).finally(() => { setPublishing(false) })
  }

  return (
    <div className={css.section}>
      <h2 className={css.heading}>{props.t('settings.title')}</h2>
      <p className={css.intro}>{props.t('settings.intro')}</p>

      <section className={css.group} aria-labelledby="pet-settings-catalog">
        <div className={css.groupHeader}>
          <h3 id="pet-settings-catalog" className={css.groupHeading}>{props.t('settings.catalog')}</h3>
          <div className={css.groupActions}>
            <button
              type="button"
              className={css.iconButton}
              aria-label={props.t('settings.refresh')}
              onClick={() => { run(async () => props.onRefreshCatalog()) }}
            >
              ⟳
            </button>
            <button type="button" className={css.secondaryButton} onClick={() => { run(props.onToggleAwake) }}>
              {snapshot.preference.awake ? props.t('settings.sleep') : props.t('settings.wake')}
            </button>
          </div>
        </div>
        {snapshot.catalog.pets.length === 0
          ? <p className={css.empty}>{props.t('settings.empty')}</p>
          : <div className={css.listContainer}>
            <ul className={css.catalog}>
              {snapshot.catalog.pets.map((pet) => {
                const selected = pet.id === activePetId
                return (
                  <li key={pet.id} className={css.row}>
                    <span className={css.avatarFrame} aria-hidden="true">
                      <span className={css.avatarSprite} style={avatarStyle(pet)} />
                    </span>
                    <span className={css.rowBody}>
                      <span className={css.petName}>{pet.displayName}</span>
                      {pet.description !== undefined && <span className={css.petDescription}>{pet.description}</span>}
                    </span>
                    <span className={css.rowActions}>
                      <button
                        type="button"
                        className={css.secondaryButton}
                        disabled={selected}
                        aria-label={props.t(selected ? 'settings.selected' : 'settings.select')}
                        onClick={selected ? undefined : () => { run(() => props.onSelectPet(pet.id)) }}
                      >
                        {props.t(selected ? 'settings.selected' : 'settings.select')}
                      </button>
                      {pet.source === 'user' && snapshot.capabilities.canImport && (
                        <button
                          type="button"
                          className={css.primaryButton}
                          disabled={publishing}
                          onClick={() => { publishPackage('updated', () => props.onUpdatePet(pet.id)) }}
                        >
                          {props.t('settings.update')}
                        </button>
                      )}
                    </span>
                  </li>
                )
              })}
            </ul>
            <div className={css.footerRow}>
              <span className={css.customLabel}>{props.t('settings.customPets')}</span>
              <code className={css.petRootPath} data-testid="pet-root-path">{snapshot.petRoot}</code>
              <span className={css.footerActions}>
                {snapshot.capabilities.canImport && (
                  <button
                    type="button"
                    className={css.secondaryButton}
                    disabled={publishing}
                    onClick={() => { publishPackage('imported', props.onImportPet) }}
                  >
                    {props.t('settings.importPackage')}
                  </button>
                )}
                {snapshot.capabilities.canOpenFolder && (
                  <button type="button" className={css.linkButton} onClick={() => { run(props.onOpenPetFolder) }}>
                    {props.t('settings.openFolder')}
                  </button>
                )}
              </span>
            </div>
          </div>}
      </section>

      <section className={css.group} aria-labelledby="pet-settings-appearance">
        <h3 id="pet-settings-appearance" className={css.groupHeading}>{props.t('settings.appearance')}</h3>
        <label className={css.sizeControl}>
          <span className={css.controlLabel}>{props.t('settings.size')}</span>
          <input
            type="range"
            min="80"
            max="224"
            step="1"
            value={snapshot.preference.sizePx}
            aria-label={props.t('settings.size')}
            onChange={(event) => { run(() => props.onSetSize(Number(event.target.value))) }}
          />
          <span className={css.sizeValue}>{snapshot.preference.sizePx}px</span>
        </label>
      </section>

      {status !== undefined && <p className={css.status} role="status">{status}</p>}
      {error !== undefined && <p className={css.error} role="alert">{error}</p>}
    </div>
  )
}

function avatarStyle(pet: PetDescriptor): CSSProperties {
  return petSpriteAvatar(pet.assetUrl, AVATAR_SIZE_PX)
}

function publishStatus(
  t: PetSettingsSectionProps['t'],
  verb: 'imported' | 'updated',
  result: PetImportResult,
): string {
  switch (result.outcome) {
    case 'published': return verb === 'imported'
      ? t('settings.imported', { name: result.pet.displayName })
      : t('settings.updated', { name: result.pet.displayName })
    case 'cancelled': return t('settings.cancelled')
    case 'host-unavailable': return t('settings.hostUnavailable')
  }
}
