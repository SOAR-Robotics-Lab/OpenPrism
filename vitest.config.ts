import { defineConfig } from "vitest/config"

export default defineConfig({
  resolve: {
    conditions: ["import", "module", "default"],
  },
  test: {
    include: ["tests/**/*.test.ts"],
    testTimeout: 30_000,
    server: {
      deps: {
        inline: ["@opencode-ai/plugin"],
      },
    },
  },
})
