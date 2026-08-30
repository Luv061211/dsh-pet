#!/usr/bin/env node
/**
 * Publish the pet plugin family to npm in dependency order.
 *
 * Usage:  node scripts/publish-all.mjs <scope>   (e.g. "@luv1211")
 *         (quote the scope in PowerShell: "@"-prefixed words are PS syntax)
 *
 * Requires an npm login with publish rights for the scope (npm whoami).
 * Publishing requires 2FA: run this from a terminal where you can enter
 * the OTP, or pass --otp=<code> once (npm reuses it within the window).
 */
import { execFileSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { join } from 'node:path'

const scope = process.argv[2]
if (!scope || !scope.startsWith('@')) {
  console.error('Usage: node scripts/publish-all.mjs "<scope>"')
  process.exit(1)
}

// Windows PATH often misses the npm-global pnpm shim; run pnpm's JS entry
// through the current node instead of relying on the command name.
function pnpmCommand(): readonly [string, ...string[]] {
  if (process.platform !== 'win32') return ['pnpm']
  const appData = process.env.APPDATA
  if (appData !== undefined) {
    for (const candidate of [
      join(appData, 'npm/node_modules/pnpm/dist/pnpm.cjs'),
      join(appData, 'npm/node_modules/pnpm/dist/pnpm.mjs'),
    ]) {
      if (existsSync(candidate)) return [process.execPath, candidate]
    }
  }
  return ['pnpm']
}

const [command, ...prefix] = pnpmCommand()

const order = [
  'packages/pet/compat',
  'packages/desktop/companion',
  'packages/pet/pet',
  'packages/pet/command-pet',
  'packages/pet/pet-tui',
  'packages/client/ui-pet',
  'packages/bundle/pet-desktop',
]

for (const dir of order) {
  console.log(`== publishing ${dir}`)
  execFileSync(command, [...prefix, 'publish', '--access', 'public', '--no-git-checks', ...process.argv.slice(3)], {
    cwd: dir,
    stdio: 'inherit',
  })
}
console.log('all packages published under ' + scope)
