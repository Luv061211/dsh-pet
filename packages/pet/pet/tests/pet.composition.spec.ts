/**
 * Real-composition guard: the pet domain boots through a test-only
 * cordis.yml and the settings-file provider durably commits user preference.
 */

import { copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { afterEach, describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import Loader from '@deepseek-ai/cordis-plugin-loader'
import Include from '@deepseek-ai/cordis-plugin-include'
import SessionStore from '@deepseek-ai/dsh-session'
import PetService from '@luv1211/dsh-pet'
import FileSettingsProvider from '@deepseek-ai/dsh-settings-file'
import { WebServer } from '@deepseek-ai/dsh-host-webserver'

let root: string | undefined
let context: Context | undefined

afterEach(async () => {
  await context?.fiber.dispose()
  context = undefined
  if (root !== undefined) await rm(root, { recursive: true, force: true })
  root = undefined
})

describe('pet domain through a real cordis.yml', () => {
  it('persists the selected awake preference document', async () => {
    root = await mkdtemp(join(tmpdir(), 'dsh-pet-composition-'))
    const settingsPath = join(root, 'settings.yaml')
    await writeFile(settingsPath, '# empty user document\n')

    const configPath = join(root, 'cordis.yml')
    await writeFile(configPath, [
      '- id: settings',
      "  name: '@deepseek-ai/dsh-settings-file'",
      '  config:',
      `    path: ${JSON.stringify(settingsPath)}`,
      '    debounceMs: 10',
      '- id: sessions',
      "  name: '@deepseek-ai/dsh-session'",
      '- id: pet',
      "  name: '@luv1211/dsh-pet'",
      '  config:',
      `    petRoot: ${JSON.stringify(join(root, 'pets'))}`,
      '',
    ].join('\n'))

    const ctx = new Context()
    context = ctx
    ctx.baseUrl = pathToFileURL(root).href + '/'
    await ctx.plugin(Loader)
    ctx.loader.builtins.include = Include
    const modules = new Map<string, unknown>([
      ['@deepseek-ai/dsh-settings-file', FileSettingsProvider],
      ['@deepseek-ai/dsh-session', SessionStore],
      ['@luv1211/dsh-pet', PetService],
    ])
    ctx.loader.internal = {
      version: 'v2',
      async import(specifier: string) {
        if (!modules.has(specifier)) throw new Error(`unexpected Loader import: ${specifier}`)
        return modules.get(specifier)
      },
    } as unknown as NonNullable<typeof ctx.loader.internal>
    await ctx.loader.create({
      name: 'cordis:include',
      config: { path: pathToFileURL(configPath).href },
    })
    await ctx.loader.await()

    const pets = ctx.get('pets') as unknown as PetService
    const snapshot = pets.getSnapshot()
    expect(snapshot).toMatchObject({
      preference: { version: 3, selectedPetId: 'deepseek-whale', awake: true, sizePx: 112 },
      catalog: { pets: [{
        id: 'deepseek-whale',
        source: 'builtin',
        displayName: 'DeepSeek Whale',
        description: 'A pixel-art blue whale companion for DeepSeek Harness tasks.',
        frame: { width: 192, height: 208, columns: 8, rows: 9 },
        assetUrl: '/__dsh/pet/assets/deepseek-whale/spritesheet.webp',
      }] },
      capabilities: { canImport: false, canOpenFolder: false },
      activities: [],
    })
    expect(typeof snapshot.petRoot).toBe('string')
    expect(snapshot.catalog.pets[0]?.animations).toHaveProperty('idle')
    expect(snapshot.catalog.pets[0]?.animations).toHaveProperty('running')

    await pets.selectPet('deepseek-whale')
    await pets.setAwake(false)

    await expect(readFile(settingsPath, 'utf8')).resolves.toContain('selectedPetId: deepseek-whale')
    await expect(readFile(settingsPath, 'utf8')).resolves.toContain('awake: false')
  })

  it('discovers only validated user packages and serves their origin-relative asset', async () => {
    root = await mkdtemp(join(tmpdir(), 'dsh-pet-catalog-'))
    const settingsPath = join(root, 'settings.yaml')
    const petRoot = join(root, 'pets')
    const packageRoot = join(petRoot, 'quiet-otter')
    await mkdir(packageRoot, { recursive: true })
    await copyFile(join(process.cwd(), 'packages/pet/pet/assets/deepseek-whale/spritesheet.webp'), join(packageRoot, 'spritesheet.webp'))
    await writeFile(join(packageRoot, 'pet.json'), JSON.stringify({
      id: 'quiet-otter',
      displayName: 'Quiet Otter',
      description: 'A quiet test companion.',
      spritesheetPath: 'spritesheet.webp',
      frame: { width: 192, height: 208, columns: 8, rows: 9 },
    }))
    await mkdir(join(petRoot, 'broken'), { recursive: true })
    await writeFile(join(petRoot, 'broken', 'pet.json'), '{"id":"broken","displayName":"Broken","spriteVersionNumber":2,"spritesheetPath":"spritesheet.webp"}')
    await writeFile(settingsPath, '# empty user document\n')

    const configPath = join(root, 'cordis.yml')
    await writeFile(configPath, [
      '- id: settings',
      "  name: '@deepseek-ai/dsh-settings-file'",
      '  config:',
      `    path: ${JSON.stringify(settingsPath)}`,
      '    debounceMs: 10',
      '- id: web',
      "  name: '@deepseek-ai/dsh-host-webserver'",
      '  config:',
      '    host: 127.0.0.1',
      '    port: 0',
      '- id: sessions',
      "  name: '@deepseek-ai/dsh-session'",
      '- id: pet',
      "  name: '@luv1211/dsh-pet'",
      '  config:',
      `    petRoot: ${JSON.stringify(petRoot)}`,
      '',
    ].join('\n'))

    const ctx = new Context()
    context = ctx
    ctx.baseUrl = pathToFileURL(root).href + '/'
    await ctx.plugin(Loader)
    ctx.loader.builtins.include = Include
    const modules = new Map<string, unknown>([
      ['@deepseek-ai/dsh-settings-file', FileSettingsProvider],
      ['@deepseek-ai/dsh-host-webserver', WebServer],
      ['@deepseek-ai/dsh-session', SessionStore],
      ['@luv1211/dsh-pet', PetService],
    ])
    ctx.loader.internal = {
      version: 'v2',
      async import(specifier: string) {
        if (!modules.has(specifier)) throw new Error(`unexpected Loader import: ${specifier}`)
        return modules.get(specifier)
      },
    } as unknown as NonNullable<typeof ctx.loader.internal>
    await ctx.loader.create({ name: 'cordis:include', config: { path: pathToFileURL(configPath).href } })
    await ctx.loader.await()

    const pets = ctx.get('pets') as unknown as PetService
    expect(pets.getCatalog().pets.map((pet: { id: string; source: string }) => [pet.id, pet.source])).toEqual([
      ['deepseek-whale', 'builtin'],
      ['quiet-otter', 'user'],
    ])
    expect(pets.getSnapshot().petRoot).toBe(petRoot)
    await expect(pets.selectPet('missing')).rejects.toThrow(/not found in the pet catalog/)
    await pets.selectPet('quiet-otter')
    expect(pets.getSnapshot().preference.selectedPetId).toBe('quiet-otter')
    const web = ctx.get('webServer') as WebServer
    const asset = await fetch(`http://127.0.0.1:${web.port}/__dsh/pet/assets/quiet-otter/spritesheet.webp`)
    expect(asset.status).toBe(200)
    expect(asset.headers.get('content-type')).toBe('image/webp')
  })
})
