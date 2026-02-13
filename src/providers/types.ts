export interface AIGCProviderResult {
  imageData: Buffer
  mimeType: string
  metadata?: Record<string, unknown>
}

export interface AIGCGenerateOptions {
  prompt: string
  model?: string
  aspectRatio?: string
  resolution?: string
  style?: string
  referenceImages?: Buffer[]
}

export interface AIGCEditOptions extends AIGCGenerateOptions {
  sourceImage: Buffer
  instruction: string
}

export interface AIGCProvider {
  readonly name: string
  readonly models: string[]
  generate(options: AIGCGenerateOptions): Promise<AIGCProviderResult>
  edit?(options: AIGCEditOptions): Promise<AIGCProviderResult>
  isAvailable(): boolean
}

export interface AIGCProviderConfig {
  provider?: "gemini" | "openrouter" | "auto"
  model?: string
  geminiApiKey?: string
  openrouterApiKey?: string
}
