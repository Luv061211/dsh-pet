import { defineConfig } from 'vitest/config'
import tsconfigPaths from 'vite-tsconfig-paths'
import { standardDecoratorPlugin } from './scripts/vitest-standard-decorators.ts'

export default defineConfig({
  plugins: [tsconfigPaths({ projects: ['./tsconfig.base.json'] }), standardDecoratorPlugin()],
  test: {
    // The browser-surface specs (packages/client/ui-pet) run inside the
    // harness workspace: the npm-published client packages ship
    // window-loader bundles, not source-plane ESM. They stay in this repo as
    // typechecked reference material.
    exclude: ['**/node_modules/**', 'packages/client/**', 'desktop/**', 'scripts/**'],
  },
})
