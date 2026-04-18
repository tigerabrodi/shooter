import path from 'path'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  resolve: {
    alias: {
      '@shared/': path.resolve(__dirname, './shared') + '/',
      '@client/': path.resolve(__dirname, './client') + '/',
      '@server/': path.resolve(__dirname, './server') + '/',
    },
  },
  test: {
    include: [
      'shared/**/*.test.ts',
      'client/**/*.test.ts',
      'server/**/*.test.ts',
      'tests/**/*.test.ts',
    ],
  },
})
