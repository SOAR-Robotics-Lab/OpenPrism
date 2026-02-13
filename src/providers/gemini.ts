import type {
  AIGCEditOptions,
  AIGCGenerateOptions,
  AIGCProvider,
  AIGCProviderConfig,
  AIGCProviderResult,
} from "./types.js"

const GEMINI_ENDPOINT = "https://generativelanguage.googleapis.com/v1beta"

interface GeminiInlinePart {
  inlineData: {
    mimeType: string
    data: string
  }
}

interface GeminiTextPart {
  text: string
}

type GeminiPart = GeminiInlinePart | GeminiTextPart

interface GeminiResponse {
  candidates?: Array<{
    content?: {
      parts?: Array<{
        inlineData?: {
          mimeType?: string
          data?: string
        }
      }>
    }
  }>
  error?: {
    message?: string
  }
}

export class GeminiProvider implements AIGCProvider {
  readonly name = "gemini"
  readonly models = ["gemini-2.5-flash-image", "gemini-3-pro-image-preview"]

  private readonly apiKey?: string
  private readonly defaultModel?: string

  constructor(config?: AIGCProviderConfig) {
    this.apiKey = config?.geminiApiKey
    this.defaultModel = config?.model
  }

  isAvailable(): boolean {
    return Boolean(this.resolveApiKey())
  }

  async generate(options: AIGCGenerateOptions): Promise<AIGCProviderResult> {
    const parts: GeminiPart[] = []

    if (options.referenceImages?.length) {
      parts.push(...options.referenceImages.map((image) => this.toInlinePart(image)))
    }

    parts.push({ text: this.buildPrompt(options.prompt, options.style) })

    return this.request(parts, options)
  }

  async edit(options: AIGCEditOptions): Promise<AIGCProviderResult> {
    const parts: GeminiPart[] = [this.toInlinePart(options.sourceImage)]

    if (options.referenceImages?.length) {
      parts.push(...options.referenceImages.map((image) => this.toInlinePart(image)))
    }

    parts.push({ text: this.buildPrompt(options.instruction, options.style) })

    return this.request(parts, options)
  }

  private async request(parts: GeminiPart[], options: AIGCGenerateOptions): Promise<AIGCProviderResult> {
    const apiKey = this.resolveApiKey()
    if (!apiKey) {
      throw new Error("Gemini API key is missing. Set GEMINI_API_KEY or config.aigcProvider.geminiApiKey.")
    }

    const model = options.model ?? this.defaultModel ?? "gemini-2.5-flash-image"
    const url = `${GEMINI_ENDPOINT}/models/${model}:generateContent`

    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": apiKey,
      },
      body: JSON.stringify({
        contents: [{ role: "user", parts }],
        generationConfig: {
          responseModalities: ["TEXT", "IMAGE"],
          imageConfig: {
            aspectRatio: options.aspectRatio,
            imageSize: options.resolution,
          },
        },
      }),
    })

    const payload = await this.parseResponse(response)

    if (!response.ok) {
      const message = payload?.error?.message ?? response.statusText
      throw new Error(`Gemini API error: ${message}`)
    }

    if (!payload) {
      throw new Error("Gemini API returned an empty or unparseable response.")
    }

    const inlineData = payload.candidates?.[0]?.content?.parts?.find((part) => part.inlineData?.data)
      ?.inlineData

    if (!inlineData?.data) {
      throw new Error("Gemini API returned no image data.")
    }

    return {
      imageData: Buffer.from(inlineData.data, "base64"),
      mimeType: inlineData.mimeType ?? "image/png",
      metadata: { model },
    }
  }

  private async parseResponse(response: Response): Promise<GeminiResponse | null> {
    try {
      const text = await response.text()
      const trimmed = text.trim()
      if (!trimmed) {
        return null
      }
      return JSON.parse(trimmed) as GeminiResponse
    } catch {
      return null
    }
  }

  private resolveApiKey(): string | undefined {
    return this.apiKey ?? process.env.GEMINI_API_KEY
  }

  private toInlinePart(image: Buffer): GeminiInlinePart {
    return {
      inlineData: {
        mimeType: "image/png",
        data: image.toString("base64"),
      },
    }
  }

  private buildPrompt(prompt: string, style?: string): string {
    if (!style) {
      return prompt
    }

    return `${prompt}\n\nStyle: ${style}`
  }
}
