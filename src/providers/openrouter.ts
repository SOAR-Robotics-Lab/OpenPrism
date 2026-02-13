import type {
  AIGCGenerateOptions,
  AIGCProvider,
  AIGCProviderConfig,
  AIGCProviderResult,
} from "./types.js"

const OPENROUTER_ENDPOINT = "https://openrouter.ai/api/v1/chat/completions"
const DATA_URL_PATTERN = /data:(image\/[a-zA-Z0-9.+-]+);base64,([^\s"']+)/

interface OpenRouterResponse {
  choices?: Array<{
    message?: {
      content?: string | Array<{ type?: string; text?: string; image_url?: { url?: string } }>
    }
  }>
  error?: {
    message?: string
  }
}

export class OpenRouterProvider implements AIGCProvider {
  readonly name = "openrouter"
  readonly models = ["bytedance-seed/seedream-4.5"]

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

    const response = await fetch(OPENROUTER_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        modalities: ["image"],
        messages: [{ role: "user", content: prompt }],
      }),
    })

    const payload = (await response.json()) as OpenRouterResponse

    if (!response.ok) {
      const message = payload.error?.message ?? response.statusText
      throw new Error(`OpenRouter API error: ${message}`)
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

  private resolveApiKey(): string | undefined {
    return this.apiKey ?? process.env.OPENROUTER_API_KEY
  }

  private buildPrompt(options: AIGCGenerateOptions): string {
    const directives: string[] = [options.prompt]

    if (options.style) {
      directives.push(`Style: ${options.style}`)
    }

    if (options.aspectRatio) {
      directives.push(`Aspect ratio: ${options.aspectRatio}`)
    }

    if (options.resolution) {
      directives.push(`Resolution target: ${options.resolution}`)
    }

    return directives.join("\n")
  }

  private extractImage(payload: OpenRouterResponse): { mimeType: string; data: Buffer } | null {
    const content = payload.choices?.[0]?.message?.content

    if (typeof content === "string") {
      return this.fromDataUrl(content)
    }

    if (Array.isArray(content)) {
      for (const part of content) {
        const textMatch = part.text ? this.fromDataUrl(part.text) : null
        if (textMatch) {
          return textMatch
        }

        const urlMatch = part.image_url?.url ? this.fromDataUrl(part.image_url.url) : null
        if (urlMatch) {
          return urlMatch
        }
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
