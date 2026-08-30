#!/usr/bin/env node
/**
 * Publish the pet plugin family to npm in dependency order.
 *
 * Usage:  node scripts/publish-all.mjs <scope>   (e.g. @luv061211)
 *
 * Requires an npm login with publish rights for the scope (npm whoami).
 * Publishing requires 2FA: run this from a terminal where you can enter
 * the OTP, or pass --otp=<code> once (npm reuses it within the window).
 */
import { execFileSync } from 'node:child_process'

const scope = process.argv[2]
if (!scope || !scope.startsWith('@')) {
  console.error('Usage: node scripts/publish-all.mjs <scope>')
  process.exit(1)
}

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
  execFileSync('pnpm', ['publish', '--access', 'public', '--no-git-checks', ...process.argv.slice(3)], {
    cwd: dir,
    stdio: 'inherit',
  })
}
console.log('all packages published under ' + scope)
