import { defineConfig } from 'vitest/config'
import { fileURLToPath } from 'node:url'

// Resolve o alias "@/..." (igual ao tsconfig) para o Vitest.
export default defineConfig({
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  test: {
    environment: 'node',
    // Os testes determinísticos e comportamentais rodam por scripts separados
    // (ver package.json). Aqui só o include geral.
    include: ['src/**/__tests__/**/*.test.ts'],
  },
})
