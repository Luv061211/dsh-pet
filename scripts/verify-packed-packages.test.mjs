import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { declaredRuntimeTargets, verifyPackedFiles } from './verify-packed-packages.mjs'

test('collects main, types, concrete exports, and bundle patch targets', () => {
  const manifest = {
    main: 'lib/index.js',
    types: 'lib/types/index.d.ts',
    exports: {
      '.': { types: './lib/types/index.d.ts', default: './lib/index.js' },
      './client': './lib/client.js',
      './src/*': './src/*',
      './package.json': './package.json',
    },
    dsh: { bundle: { patch: './cordis.patch.yml' } },
  }
  assert.deepEqual(declaredRuntimeTargets(manifest), [
    'cordis.patch.yml', 'lib/client.js', 'lib/index.js', 'lib/types/index.d.ts', 'package.json',
  ])
})

test('reports every declared target missing from a packed tarball', () => {
  assert.throws(
    () => verifyPackedFiles('@scope/broken', {
      main: 'lib/index.js',
      exports: { './client': './lib/client.js' },
      dsh: { bundle: { patch: './cordis.patch.yml' } },
    }, ['package.json', 'lib/index.js']),
    /@scope\/broken packed tarball is missing: cordis\.patch\.yml, lib\/client\.js/,
  )
})

test('published pet packages do not declare out-of-tree Typert runtime artifacts', () => {
  for (const path of [
    'packages/pet/pet/package.json',
    'packages/client/ui-pet/package.json',
  ]) {
    const manifest = JSON.parse(readFileSync(new URL(`../${path}`, import.meta.url), 'utf8'))
    assert.equal(manifest.exports?.['./typert'], undefined)
    const dependencies = { ...manifest.dependencies, ...manifest.peerDependencies }
    assert.equal(dependencies['@deepseek-ai/dsh-api-remotes'], undefined)
    assert.equal(dependencies['@deepseek-ai/dsh-typert-protocol'], undefined)
  }
})
