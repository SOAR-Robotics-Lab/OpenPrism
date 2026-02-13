import { GeminiProvider } from "./gemini.js"
import { OpenRouterProvider } from "./openrouter.js"
import type { AIGCProvider, AIGCProviderConfig } from "./types.js"

export function createProvider(config?: AIGCProviderConfig): AIGCProvider | null {
  const providerName = config?.provider ?? "auto"

  if (providerName === "gemini") {
    const provider = new GeminiProvider(config)
    return provider.isAvailable() ? provider : null
  }

  if (providerName === "openrouter") {
    const provider = new OpenRouterProvider(config)
    return provider.isAvailable() ? provider : null
  }

  const gemini = new GeminiProvider(config)
  if (gemini.isAvailable()) {
    return gemini
  }

  const openrouter = new OpenRouterProvider(config)
  if (openrouter.isAvailable()) {
    return openrouter
  }

  return null
}

export * from "./types.js"
export { GeminiProvider } from "./gemini.js"
export { OpenRouterProvider } from "./openrouter.js"
