import type {
  AIGCGenerateOptions,
  AIGCProvider,
  AIGCProviderConfig,
  AIGCProviderResult,
} from "./types.js"

const OPENROUTER_ENDPOINT = "https://openrouter.ai/api/v1/chat/completions"
const DATA_URL_PATTERN = /data:(image\/[a-zA-Z0-9.+-]+);base64,([^\s"']+)/

const TEXT_AND_IMAGE_MODELS = new Set([
  "google/gemini-2.5-flash-image-preview",
  "google/gemini-3-pro-image-preview",
])

interface OpenRouterImageEntry {
  type?: string
  image_url?: { url?: string }
}

interface OpenRouterResponse {
  choices?: Array<{
    message?: {
      content?: string | Array<{ type?: string; text?: string; image_url?: { url?: string } }>
      images?: OpenRouterImageEntry[]
    }
  }>
  error?: {
    message?: string
  }
}

interface OpenRouterImageConfig {
  aspect_ratio?: string
  image_size?: string
}

export class OpenRouterProvider implements AIGCProvider {
  readonly name = "openrouter"
  readonly models = ["bytedance-seed/seedream-4.5", "google/gemini-3-pro-image-preview"]

  private readonly apiKey?: string
  private readonly defaultModel?: string

  constructor(config?: AIGCProviderConfig) {
    this.apiKey = config?.openrouterApiKey
    this.defaultModel = config?.model
  }

  isAvailable(): boolean {
    return Boolean(this.resolveApiKey())
  }

  async generate(options: AIGCGenerateOptions): Promise<AIGCProviderResult> {
    const apiKey = this.resolveApiKey()
    if (!apiKey) {
      throw new Error("OpenRouter API key is missing. Set OPENROUTER_API_KEY or config.aigcProvider.openrouterApiKey.")
    }

    const model = options.model ?? this.defaultModel ?? "bytedance-seed/seedream-4.5"
    const prompt = this.buildPrompt(options)
    const modalities = TEXT_AND_IMAGE_MODELS.has(model) ? ["image", "text"] : ["image"]

    const body: Record<string, unknown> = {
      model,
      modalities,
      messages: [{ role: "user", content: prompt }],
    }

    const imageConfig = this.buildImageConfig(options)
    if (imageConfig) {
      body.image_config = imageConfig
    }

    const response = await fetch(OPENROUTER_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(body),
    })

    const payload = await this.parseResponse(response)

    if (!response.ok) {
      const message = payload?.error?.message ?? response.statusText
      throw new Error(`OpenRouter API error: ${message}`)
    }

    if (!payload) {
      throw new Error("OpenRouter API returned an empty or unparseable response.")
    }

    const image = this.extractImage(payload)
    if (!image) {
      throw new Error("OpenRouter API returned no image data.")
    }

    return {
      imageData: image.data,
      mimeType: image.mimeType,
      metadata: { model },
    }
  }

  private async parseResponse(response: Response): Promise<OpenRouterResponse | null> {
    try {
      const text = await response.text()
      const trimmed = text.trim()
      if (!trimmed) {
        return null
      }
      return JSON.parse(trimmed) as OpenRouterResponse
    } catch {
      return null
    }
  }

  private resolveApiKey(): string | undefined {
    return this.apiKey ?? process.env.OPENROUTER_API_KEY
  }

  private buildPrompt(options: AIGCGenerateOptions): string {
    const directives: string[] = [options.prompt]

    if (options.style) {
      directives.push(`Style: ${options.style}`)
    }

    return directives.join("\n")
  }

  private buildImageConfig(options: AIGCGenerateOptions): OpenRouterImageConfig | undefined {
    const config: OpenRouterImageConfig = {}
    let hasConfig = false

    if (options.aspectRatio) {
      config.aspect_ratio = options.aspectRatio
      hasConfig = true
    }

    if (options.resolution) {
      config.image_size = options.resolution
      hasConfig = true
    }

    return hasConfig ? config : undefined
  }

  private extractImage(payload: OpenRouterResponse): { mimeType: string; data: Buffer } | null {
    const message = payload.choices?.[0]?.message

    if (message?.images?.length) {
      for (const entry of message.images) {
        const url = entry.image_url?.url
        if (url) {
          const parsed = this.fromDataUrl(url)
          if (parsed) return parsed
        }
      }
    }

    const content = message?.content

    if (typeof content === "string") {
      return this.fromDataUrl(content)
    }

    if (Array.isArray(content)) {
      for (const part of content) {
        const textMatch = part.text ? this.fromDataUrl(part.text) : null
        if (textMatch) return textMatch

        const urlMatch = part.image_url?.url ? this.fromDataUrl(part.image_url.url) : null
        if (urlMatch) return urlMatch
      }
    }

    return null
  }

  private fromDataUrl(value: string): { mimeType: string; data: Buffer } | null {
    const match = value.match(DATA_URL_PATTERN)
    if (!match?.[1] || !match[2]) {
      return null
    }

    return {
      mimeType: match[1],
      data: Buffer.from(match[2], "base64"),
    }
  }
}
