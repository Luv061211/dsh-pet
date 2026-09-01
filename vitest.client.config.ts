import { defineConfig } from 'vitest/config'
import tsconfigPaths from 'vite-tsconfig-paths'

export default defineConfig({
  plugins: [tsconfigPaths({ projects: ['./tsconfig.base.client.json'] })],
  test: {
    include: ['packages/client/**/*.client.spec.ts', 'packages/client/**/*.client.spec.tsx'],
    exclude: ['**/node_modules/**'],
  },
})
