#!/usr/bin/env node
/** Install only produced tarballs and verify their runtime entries resolve. */

import { execFileSync } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

const root = resolve(dirname(new URL(import.meta.url).pathname.replace(/^\/(.:)/, '$1')), '..')
const manifest = JSON.parse(readFileSync(join(root, '.artifacts', 'pack-manifest.json'), 'utf8'))
const installRoot = mkdtempSync(join(tmpdir(), 'dsh-pet-packed-'))
try {
  const dependencies = Object.fromEntries(manifest.packages.map(entry => [entry.name, `file:${entry.filename.replaceAll('\\', '/')}`]))
  const petManifest = JSON.parse(readFileSync(join(root, 'packages', 'pet', 'pet', 'package.json'), 'utf8'))
  Object.assign(dependencies, {
    '@deepseek-ai/cordis': petManifest.devDependencies['@deepseek-ai/cordis'],
    '@deepseek-ai/cordis-plugin-loader': petManifest.devDependencies['@deepseek-ai/cordis-plugin-loader'],
    '@deepseek-ai/cordis-plugin-include': petManifest.devDependencies['@deepseek-ai/cordis-plugin-include'],
    '@deepseek-ai/dsh-host-webserver': petManifest.devDependencies['@deepseek-ai/dsh-host-webserver'],
    '@deepseek-ai/dsh-session': petManifest.devDependencies['@deepseek-ai/dsh-session'],
    '@deepseek-ai/dsh-settings-file': petManifest.devDependencies['@deepseek-ai/dsh-settings-file'],
  })
  writeFileSync(join(installRoot, 'package.json'), JSON.stringify({
    name: 'dsh-pet-packed-smoke', private: true, type: 'module', dependencies,
  }, null, 2) + '\n')
  writeFileSync(join(installRoot, 'pnpm-workspace.yaml'), `overrides:\n${Object.entries(dependencies)
    .map(([name, target]) => `  '${name}': '${target}'`).join('\n')}\n`)
  const pnpmEntry = process.env.npm_execpath
  if (pnpmEntry === undefined) throw new Error('packed integration must run through pnpm')
  execFileSync(process.execPath, [pnpmEntry, 'install', '--ignore-scripts'], { cwd: installRoot, stdio: 'inherit' })
  for (const entry of manifest.packages) {
    const packageRoot = join(installRoot, 'node_modules', ...entry.name.split('/'))
    const packageManifest = JSON.parse(readFileSync(join(packageRoot, 'package.json'), 'utf8'))
    const main = join(packageRoot, packageManifest.main)
    if (!existsSync(main)) throw new Error(`${entry.name} installed main is missing: ${packageManifest.main}`)
    await import(pathToFileURL(main).href)
  }
  const client = join(installRoot, 'node_modules', '@luv1211', 'dsh-client-ui-pet', 'lib', 'client.js')
  const patch = join(installRoot, 'node_modules', '@luv1211', 'dsh-pet-desktop', 'cordis.patch.yml')
  if (!existsSync(client) || !existsSync(patch)) throw new Error('installed browser entry or bundle patch is missing')

  const requireFromInstall = createRequire(pathToFileURL(join(installRoot, 'package.json')))
  const importInstalled = async specifier => import(pathToFileURL(requireFromInstall.resolve(specifier)).href)
  const [{ Context }, { default: Loader }, { default: Include }, { default: FileSettingsProvider },
    { default: SessionStore }, { WebServer }, { default: PetService }] = await Promise.all([
    importInstalled('@deepseek-ai/cordis'),
    importInstalled('@deepseek-ai/cordis-plugin-loader'),
    importInstalled('@deepseek-ai/cordis-plugin-include'),
    importInstalled('@deepseek-ai/dsh-settings-file'),
    importInstalled('@deepseek-ai/dsh-session'),
    importInstalled('@deepseek-ai/dsh-host-webserver'),
    importInstalled('@luv1211/dsh-pet'),
  ])
  const settingsPath = join(installRoot, 'settings.yaml')
  const configPath = join(installRoot, 'cordis.yml')
  writeFileSync(settingsPath, '# packed smoke settings\n')
  writeFileSync(configPath, [
    '- id: settings',
    "  name: '@deepseek-ai/dsh-settings-file'",
    '  config:',
    `    path: ${JSON.stringify(settingsPath)}`,
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
    `    petRoot: ${JSON.stringify(join(installRoot, 'pets'))}`,
    '',
  ].join('\n'))
  const ctx = new Context()
  try {
    ctx.baseUrl = pathToFileURL(installRoot).href + '/'
    await ctx.plugin(Loader)
    ctx.loader.builtins.include = Include
    const modules = new Map([
      ['@deepseek-ai/dsh-settings-file', FileSettingsProvider],
      ['@deepseek-ai/dsh-host-webserver', WebServer],
      ['@deepseek-ai/dsh-session', SessionStore],
      ['@luv1211/dsh-pet', PetService],
    ])
    ctx.loader.internal = {
      version: 'v2',
      async import(specifier) {
        if (!modules.has(specifier)) throw new Error(`unexpected packed Loader import: ${specifier}`)
        return modules.get(specifier)
      },
    }
    await ctx.loader.create({ name: 'cordis:include', config: { path: pathToFileURL(configPath).href } })
    await ctx.loader.await()
    const web = ctx.get('webServer')
    const response = await fetch(`http://127.0.0.1:${web.port}/__dsh/pet/api/snapshot`)
    const body = await response.json()
    if (!response.ok || body?.ok !== true || body.value?.preference?.selectedPetId !== 'deepseek-whale') {
      throw new Error(`packed Loader/API smoke failed: ${JSON.stringify(body)}`)
    }
  } finally {
    await ctx.fiber.dispose()
  }
  console.log(`packed integration passed for ${String(manifest.packages.length)} packages`)
} finally {
  rmSync(installRoot, { recursive: true, force: true })
}
