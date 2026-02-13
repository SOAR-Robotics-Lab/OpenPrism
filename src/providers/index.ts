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

/**
 * Returns all available providers, ordered by preference (Gemini first).
 * When `config.provider` is set to a specific provider, only that provider is returned.
 */
export function createAllProviders(config?: AIGCProviderConfig): AIGCProvider[] {
  const providerName = config?.provider ?? "auto"
  const result: AIGCProvider[] = []

  if (providerName === "gemini") {
    const provider = new GeminiProvider(config)
    if (provider.isAvailable()) result.push(provider)
    return result
  }

  if (providerName === "openrouter") {
    const provider = new OpenRouterProvider(config)
    if (provider.isAvailable()) result.push(provider)
    return result
  }

  const gemini = new GeminiProvider(config)
  if (gemini.isAvailable()) {
    result.push(gemini)
  }

  const openrouter = new OpenRouterProvider(config)
  if (openrouter.isAvailable()) {
    result.push(openrouter)
  }

  return result
}

export * from "./types.js"
export { GeminiProvider } from "./gemini.js"
export { OpenRouterProvider } from "./openrouter.js"
