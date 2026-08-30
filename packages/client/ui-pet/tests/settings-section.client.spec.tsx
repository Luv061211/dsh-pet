// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, waitFor } from '@testing-library/react'
import type { PetDescriptor, PetImportResult, PetSnapshot } from '@luv1211/dsh-pet/client'
import { PetSettingsSection } from '../src/client/PetSettingsSection.tsx'
import { zh } from '../src/client/locales.ts'

const pet = (id: string, displayName: string, source: PetDescriptor['source']): PetDescriptor => ({
  id,
  source,
  displayName,
  description: `${displayName} 简介`,
  assetUrl: `/${id}.webp`,
  frame: { width: 192, height: 208, columns: 8, rows: 9 },
  animations: { idle: { frames: [{ spriteIndex: 0, durationMs: 1000 }], loopStart: 0, fallback: 'idle' } },
})

const published = (id: string, displayName: string): Extract<PetImportResult, { outcome: 'published' }> => ({
  outcome: 'published',
  pet: {
    id,
    source: 'user',
    displayName,
    assetUrl: `/${id}.webp`,
    frame: { width: 192, height: 208, columns: 8, rows: 9 },
    animations: {},
  },
})

const snapshot = (overrides: Partial<PetSnapshot> = {}): PetSnapshot => ({
  preference: { version: 3, selectedPetId: 'deepseek-whale', awake: true, sizePx: 112 },
  catalog: {
    pets: [
      pet('deepseek-whale', 'DeepSeek Whale', 'builtin'),
      pet('quiet-otter', 'Quiet Otter', 'user'),
    ],
  },
  petRoot: '/home/tester/.dsh/pets',
  capabilities: { canImport: true, canOpenFolder: true },
  activities: [],
  ...overrides,
})

const t = (key: string, params?: Record<string, unknown>): string => {
  let value: string = zh[key as keyof typeof zh] ?? key
  for (const [name, replacement] of Object.entries(params ?? {})) value = value.replaceAll(`{${name}}`, String(replacement))
  return value
}

afterEach(cleanup)

describe('PetSettingsSection', () => {
  it('renders the reference rows and drives every catalog and package action', async () => {
    const onToggleAwake = vi.fn(async () => {})
    const onRefreshCatalog = vi.fn(async () => {})
    const onSelectPet = vi.fn(async () => {})
    const onSetSize = vi.fn(async () => {})
    const onImportPet = vi.fn(async () => ({ outcome: 'cancelled' as const }))
    const onUpdatePet = vi.fn(async () => ({ outcome: 'cancelled' as const }))
    const onOpenPetFolder = vi.fn(async () => {})
    const view = render(<PetSettingsSection
      close={vi.fn()}
      useSessions={() => null as never}
      useWorkspaces={() => null as never}
      usePetState={select => select({ snapshot: snapshot() })}
      t={t}
      onToggleAwake={onToggleAwake}
      onRefreshCatalog={onRefreshCatalog}
      onSelectPet={onSelectPet}
      onSetSize={onSetSize}
      onImportPet={onImportPet}
      onUpdatePet={onUpdatePet}
      onOpenPetFolder={onOpenPetFolder}
    />)

    expect(view.getByRole('heading', { name: '智能伙伴' })).not.toBeNull()
    expect(view.getByText('Quiet Otter 简介')).not.toBeNull()
    expect(view.getByTestId('pet-root-path').textContent).toBe('/home/tester/.dsh/pets')
    expect((view.getByRole('button', { name: '已选' }) as HTMLButtonElement).disabled).toBe(true)

    fireEvent.click(view.getByRole('button', { name: '选择' }))
    fireEvent.click(view.getByRole('button', { name: '刷新列表' }))
    fireEvent.click(view.getByRole('button', { name: '休眠' }))
    fireEvent.change(view.getByRole('slider', { name: '宠物大小' }), { target: { value: '128' } })

    expect(onSelectPet).toHaveBeenCalledWith('quiet-otter')
    expect(onRefreshCatalog).toHaveBeenCalledOnce()
    expect(onToggleAwake).toHaveBeenCalledOnce()
    expect(onSetSize).toHaveBeenCalledWith(128)

    // The row and footer publications share one busy flag, so drive them
    // one at a time and wait for the outcome to render before continuing.
    fireEvent.click(view.getByRole('button', { name: '更新' }))
    await waitFor(() => {
      expect(view.getByRole('status').textContent).toBe('操作已取消。')
      expect(onUpdatePet).toHaveBeenCalledWith('quiet-otter')
    })
    fireEvent.click(view.getByRole('button', { name: '导入宠物包' }))
    await waitFor(() => { expect(onImportPet).toHaveBeenCalledOnce() })
    expect((view.getByRole('button', { name: '导入宠物包' }) as HTMLButtonElement).disabled).toBe(false)
    fireEvent.click(view.getByRole('button', { name: '打开文件夹' }))
    expect(onOpenPetFolder).toHaveBeenCalledOnce()
  })

  it('hides the native-only actions without host capabilities', () => {
    const view = render(<PetSettingsSection
      close={vi.fn()}
      useSessions={() => null as never}
      useWorkspaces={() => null as never}
      usePetState={select => select({ snapshot: snapshot({ capabilities: { canImport: false, canOpenFolder: false } }) })}
      t={t}
      onToggleAwake={vi.fn(async () => {})}
      onRefreshCatalog={vi.fn(async () => {})}
      onSelectPet={vi.fn(async () => {})}
      onSetSize={vi.fn(async () => {})}
      onImportPet={vi.fn(async () => ({ outcome: 'host-unavailable' as const }))}
      onUpdatePet={vi.fn(async () => ({ outcome: 'host-unavailable' as const }))}
      onOpenPetFolder={vi.fn(async () => {})}
    />)

    expect(view.queryByRole('button', { name: '更新' })).toBeNull()
    expect(view.queryByRole('button', { name: '导入宠物包' })).toBeNull()
    expect(view.queryByRole('button', { name: '打开文件夹' })).toBeNull()
    expect(view.getByRole('button', { name: '选择' })).not.toBeNull()
  })

  it('reports a published package update from the row action', async () => {
    const onUpdatePet = vi.fn(async () => published('quiet-otter', 'Quiet Otter'))
    const view = render(<PetSettingsSection
      close={vi.fn()}
      useSessions={() => null as never}
      useWorkspaces={() => null as never}
      usePetState={select => select({ snapshot: snapshot() })}
      t={t}
      onToggleAwake={vi.fn(async () => {})}
      onRefreshCatalog={vi.fn(async () => {})}
      onSelectPet={vi.fn(async () => {})}
      onSetSize={vi.fn(async () => {})}
      onImportPet={vi.fn(async () => ({ outcome: 'cancelled' as const }))}
      onUpdatePet={onUpdatePet}
      onOpenPetFolder={vi.fn(async () => {})}
    />)

    fireEvent.click(view.getByRole('button', { name: '更新' }))

    await waitFor(() => { expect(view.getByRole('status').textContent).toBe('已更新 Quiet Otter。') })
  })

  it('wakes a tucked companion through the header toggle', () => {
    const onToggleAwake = vi.fn(async () => {})
    const view = render(<PetSettingsSection
      close={vi.fn()}
      useSessions={() => null as never}
      useWorkspaces={() => null as never}
      usePetState={select => select({ snapshot: snapshot({ preference: { version: 3, selectedPetId: 'deepseek-whale', awake: false, sizePx: 112 } }) })}
      t={t}
      onToggleAwake={onToggleAwake}
      onRefreshCatalog={vi.fn(async () => {})}
      onSelectPet={vi.fn(async () => {})}
      onSetSize={vi.fn(async () => {})}
      onImportPet={vi.fn(async () => ({ outcome: 'cancelled' as const }))}
      onUpdatePet={vi.fn(async () => ({ outcome: 'cancelled' as const }))}
      onOpenPetFolder={vi.fn(async () => {})}
    />)

    expect(view.getByRole('button', { name: '唤醒' })).not.toBeNull()
    fireEvent.click(view.getByRole('button', { name: '唤醒' }))
    expect(onToggleAwake).toHaveBeenCalledOnce()
  })
})
