import * as fs from "node:fs/promises"
import * as os from "node:os"
import * as path from "node:path"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { createAllProviders, createProvider, GeminiProvider, OpenRouterProvider } from "../src/providers/index.ts"
import type { AIGCProvider } from "../src/providers/types.ts"
import { createGenerateImageTool } from "../src/tools/generate-image.ts"
import { FileManager } from "../src/utils/file-manager.ts"

function stubFetch(responseBody: unknown, status = 200) {
  const bodyText = JSON.stringify(responseBody)
  const mockFetch = vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    statusText: status === 200 ? "OK" : "Error",
    json: () => Promise.resolve(responseBody),
    text: () => Promise.resolve(bodyText),
  })
  vi.stubGlobal("fetch", mockFetch)
  return mockFetch
}

function stubFetchWithRawText(rawText: string, status = 200) {
  const mockFetch = vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    statusText: status === 200 ? "OK" : "Error",
    json: () => Promise.reject(new Error("json() should not be called")),
    text: () => Promise.resolve(rawText),
  })
  vi.stubGlobal("fetch", mockFetch)
  return mockFetch
}

describe("providers", () => {
  let originalGeminiKey: string | undefined
  let originalOpenrouterKey: string | undefined
  let tempRoot: string

  beforeEach(async () => {
    originalGeminiKey = process.env.GEMINI_API_KEY
    originalOpenrouterKey = process.env.OPENROUTER_API_KEY
    delete process.env.GEMINI_API_KEY
    delete process.env.OPENROUTER_API_KEY
    tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "openprism-providers-"))
  })

  afterEach(async () => {
    if (originalGeminiKey !== undefined) {
      process.env.GEMINI_API_KEY = originalGeminiKey
    } else {
      delete process.env.GEMINI_API_KEY
    }

    if (originalOpenrouterKey !== undefined) {
      process.env.OPENROUTER_API_KEY = originalOpenrouterKey
    } else {
      delete process.env.OPENROUTER_API_KEY
    }

    vi.unstubAllGlobals()
    await fs.rm(tempRoot, { recursive: true, force: true })
  })

  describe("provider contracts", () => {
    it("GeminiProvider implements required provider fields", () => {
      const provider: AIGCProvider = new GeminiProvider({ geminiApiKey: "config-key" })

      expect(provider.name).toBe("gemini")
      expect(provider.models.length).toBeGreaterThan(0)
      expect(typeof provider.generate).toBe("function")
      expect(typeof provider.isAvailable).toBe("function")
      expect(typeof provider.edit).toBe("function")
    })

    it("OpenRouterProvider implements required provider fields", () => {
      const provider: AIGCProvider = new OpenRouterProvider({ openrouterApiKey: "config-key" })

      expect(provider.name).toBe("openrouter")
      expect(provider.models.length).toBeGreaterThan(0)
      expect(typeof provider.generate).toBe("function")
      expect(typeof provider.isAvailable).toBe("function")
    })

    it("Gemini supports edit while OpenRouter does not", () => {
      const gemini = new GeminiProvider({ geminiApiKey: "config-key" })
      const openrouter: AIGCProvider = new OpenRouterProvider({ openrouterApiKey: "config-key" })

      expect(gemini.edit).toBeDefined()
      expect(openrouter.edit).toBeUndefined()
    })
  })

  describe("GeminiProvider", () => {
    it("constructor sets apiKey from config", () => {
      const provider = new GeminiProvider({ geminiApiKey: "config-key" })
      expect(provider.isAvailable()).toBe(true)
    })

    it("isAvailable returns true when GEMINI_API_KEY env var set", () => {
      process.env.GEMINI_API_KEY = "env-key"

      const provider = new GeminiProvider()
      expect(provider.isAvailable()).toBe(true)
    })

    it("isAvailable returns false when no key", () => {
      const provider = new GeminiProvider()
      expect(provider.isAvailable()).toBe(false)
    })

    it("isAvailable returns true when config.geminiApiKey set", () => {
      const provider = new GeminiProvider({ geminiApiKey: "config-key" })
      expect(provider.isAvailable()).toBe(true)
    })

    it("generate calls correct endpoint with correct headers", async () => {
      const fakeImage = Buffer.from("fake-image-data")
      const mockFetch = stubFetch({
        candidates: [
          {
            content: {
              parts: [{ inlineData: { mimeType: "image/png", data: fakeImage.toString("base64") } }],
            },
          },
        ],
      })

      const provider = new GeminiProvider({ geminiApiKey: "config-key", model: "gemini-3-pro-image-preview" })
      await provider.generate({ prompt: "draw a rocket" })

      expect(mockFetch).toHaveBeenCalledTimes(1)
      const [url, request] = mockFetch.mock.calls[0] as [string, { headers: Record<string, string> }]
      expect(url).toContain("https://generativelanguage.googleapis.com/v1beta/models/gemini-3-pro-image-preview:generateContent")
      expect(request.headers["x-goog-api-key"]).toBe("config-key")
      expect(request.headers["Content-Type"]).toBe("application/json")
    })

    it("generate returns image buffer from base64 response", async () => {
      const fakeImage = Buffer.from("fake-image-data")
      stubFetch({
        candidates: [
          {
            content: {
              parts: [{ inlineData: { mimeType: "image/png", data: fakeImage.toString("base64") } }],
            },
          },
        ],
      })

      const provider = new GeminiProvider({ geminiApiKey: "config-key" })
      const result = await provider.generate({ prompt: "draw a cat" })

      expect(result.imageData.equals(fakeImage)).toBe(true)
      expect(result.mimeType).toBe("image/png")
      expect(result.metadata).toEqual({ model: "gemini-2.5-flash-image" })
    })

    it("generate includes aspectRatio and resolution in imageConfig", async () => {
      const fakeImage = Buffer.from("fake-image-data")
      const mockFetch = stubFetch({
        candidates: [
          {
            content: {
              parts: [{ inlineData: { mimeType: "image/png", data: fakeImage.toString("base64") } }],
            },
          },
        ],
      })

      const provider = new GeminiProvider({ geminiApiKey: "config-key" })
      await provider.generate({
        prompt: "draw a mountain",
        aspectRatio: "16:9",
        resolution: "2K",
      })

      const [, request] = mockFetch.mock.calls[0] as [string, { body: string }]
      const payload = JSON.parse(request.body) as {
        generationConfig: { imageConfig: { aspectRatio?: string; imageSize?: string } }
      }

      expect(payload.generationConfig.imageConfig.aspectRatio).toBe("16:9")
      expect(payload.generationConfig.imageConfig.imageSize).toBe("2K")
    })

    it("generate includes style in prompt text", async () => {
      const fakeImage = Buffer.from("fake-image-data")
      const mockFetch = stubFetch({
        candidates: [
          {
            content: {
              parts: [{ inlineData: { mimeType: "image/png", data: fakeImage.toString("base64") } }],
            },
          },
        ],
      })

      const provider = new GeminiProvider({ geminiApiKey: "config-key" })
      await provider.generate({ prompt: "draw a fox", style: "watercolor" })

      const [, request] = mockFetch.mock.calls[0] as [string, { body: string }]
      const payload = JSON.parse(request.body) as {
        contents: Array<{ parts: Array<{ text?: string }> }>
      }
      const textPart = payload.contents[0]?.parts.find((part) => typeof part.text === "string")

      expect(textPart?.text).toContain("draw a fox")
      expect(textPart?.text).toContain("Style: watercolor")
    })

    it("generate includes reference images as inlineData parts", async () => {
      const fakeImage = Buffer.from("fake-image-data")
      const ref1 = Buffer.from("reference-image-1")
      const ref2 = Buffer.from("reference-image-2")
      const mockFetch = stubFetch({
        candidates: [
          {
            content: {
              parts: [{ inlineData: { mimeType: "image/png", data: fakeImage.toString("base64") } }],
            },
          },
        ],
      })

      const provider = new GeminiProvider({ geminiApiKey: "config-key" })
      await provider.generate({ prompt: "draw from refs", referenceImages: [ref1, ref2] })

      const [, request] = mockFetch.mock.calls[0] as [string, { body: string }]
      const payload = JSON.parse(request.body) as {
        contents: Array<{ parts: Array<{ inlineData?: { data?: string } }> }>
      }
      const parts = payload.contents[0]?.parts ?? []
      const inlineParts = parts.filter((part) => part.inlineData?.data)

      expect(inlineParts).toHaveLength(2)
      expect(inlineParts[0]?.inlineData?.data).toBe(ref1.toString("base64"))
      expect(inlineParts[1]?.inlineData?.data).toBe(ref2.toString("base64"))
    })

    it("generate throws on API error", async () => {
      stubFetch({ error: { message: "invalid request" } }, 400)

      const provider = new GeminiProvider({ geminiApiKey: "config-key" })

      await expect(provider.generate({ prompt: "bad request" })).rejects.toThrow(
        "Gemini API error: invalid request",
      )
    })

    it("generate throws when no image in response", async () => {
      stubFetch({ candidates: [{ content: { parts: [{ text: "no image" }] } }] })

      const provider = new GeminiProvider({ geminiApiKey: "config-key" })

      await expect(provider.generate({ prompt: "text only" })).rejects.toThrow("Gemini API returned no image data.")
    })

    it("generate throws descriptive error on empty response body", async () => {
      stubFetchWithRawText("", 200)

      const provider = new GeminiProvider({ geminiApiKey: "config-key" })

      await expect(provider.generate({ prompt: "draw empty" })).rejects.toThrow(
        "Gemini API returned an empty or unparseable response.",
      )
    })

    it("generate throws descriptive error on invalid JSON response body", async () => {
      stubFetchWithRawText("not valid json", 200)

      const provider = new GeminiProvider({ geminiApiKey: "config-key" })

      await expect(provider.generate({ prompt: "draw broken" })).rejects.toThrow(
        "Gemini API returned an empty or unparseable response.",
      )
    })

    it("generate handles API error with unparseable response body", async () => {
      stubFetchWithRawText("internal server error", 500)

      const provider = new GeminiProvider({ geminiApiKey: "config-key" })

      await expect(provider.generate({ prompt: "server error" })).rejects.toThrow(
        "Gemini API error: Error",
      )
    })

    it("edit includes source image as first inlineData part", async () => {
      const fakeImage = Buffer.from("fake-image-data")
      const sourceImage = Buffer.from("source-image")
      const referenceImage = Buffer.from("reference-image")
      const mockFetch = stubFetch({
        candidates: [
          {
            content: {
              parts: [{ inlineData: { mimeType: "image/png", data: fakeImage.toString("base64") } }],
            },
          },
        ],
      })

      const provider = new GeminiProvider({ geminiApiKey: "config-key" })
      await provider.edit({
        sourceImage,
        instruction: "fix the lighting",
        prompt: "fix the lighting",
        referenceImages: [referenceImage],
      })

      const [, request] = mockFetch.mock.calls[0] as [string, { body: string }]
      const payload = JSON.parse(request.body) as {
        contents: Array<{ parts: Array<{ inlineData?: { data?: string } }> }>
      }
      const parts = payload.contents[0]?.parts ?? []
      const firstInline = parts[0]?.inlineData?.data

      expect(firstInline).toBe(sourceImage.toString("base64"))
      expect(parts[1]?.inlineData?.data).toBe(referenceImage.toString("base64"))
    })

    it("edit includes instruction text", async () => {
      const fakeImage = Buffer.from("fake-image-data")
      const sourceImage = Buffer.from("source-image")
      const mockFetch = stubFetch({
        candidates: [
          {
            content: {
              parts: [{ inlineData: { mimeType: "image/png", data: fakeImage.toString("base64") } }],
            },
          },
        ],
      })

      const provider = new GeminiProvider({ geminiApiKey: "config-key" })
      await provider.edit({
        sourceImage,
        instruction: "increase contrast",
        prompt: "increase contrast",
        style: "cinematic",
      })

      const [, request] = mockFetch.mock.calls[0] as [string, { body: string }]
      const payload = JSON.parse(request.body) as {
        contents: Array<{ parts: Array<{ text?: string }> }>
      }
      const textPart = payload.contents[0]?.parts.find((part) => typeof part.text === "string")

      expect(textPart?.text).toContain("increase contrast")
      expect(textPart?.text).toContain("Style: cinematic")
    })
  })

  describe("OpenRouterProvider", () => {
    it("isAvailable returns true when OPENROUTER_API_KEY set", () => {
      process.env.OPENROUTER_API_KEY = "env-key"

      const provider = new OpenRouterProvider()
      expect(provider.isAvailable()).toBe(true)
    })

    it("isAvailable returns false when no key", () => {
      const provider = new OpenRouterProvider()
      expect(provider.isAvailable()).toBe(false)
    })

    it("generate calls correct endpoint with auth header and image-only modalities for non-Gemini models", async () => {
      const fakeImage = Buffer.from("fake-image-data")
      const mockFetch = stubFetch({
        choices: [
          {
            message: {
              images: [{ type: "image_url", image_url: { url: `data:image/png;base64,${fakeImage.toString("base64")}` } }],
            },
          },
        ],
      })

      const provider = new OpenRouterProvider({ openrouterApiKey: "config-key", model: "bytedance-seed/seedream-4.5" })
      await provider.generate({ prompt: "draw a robot" })

      expect(mockFetch).toHaveBeenCalledTimes(1)
      const [url, request] = mockFetch.mock.calls[0] as [string, { headers: Record<string, string>; body: string }]
      expect(url).toBe("https://openrouter.ai/api/v1/chat/completions")
      expect(request.headers.Authorization).toBe("Bearer config-key")
      expect(request.headers["Content-Type"]).toBe("application/json")

      const payload = JSON.parse(request.body) as { model: string; modalities: string[] }
      expect(payload.model).toBe("bytedance-seed/seedream-4.5")
      expect(payload.modalities).toEqual(["image"])
    })

    it("generate uses image+text modalities for Gemini models on OpenRouter", async () => {
      const fakeImage = Buffer.from("fake-image-data")
      const mockFetch = stubFetch({
        choices: [
          {
            message: {
              images: [{ type: "image_url", image_url: { url: `data:image/png;base64,${fakeImage.toString("base64")}` } }],
            },
          },
        ],
      })

      const provider = new OpenRouterProvider({ openrouterApiKey: "config-key" })
      await provider.generate({ prompt: "draw a cat", model: "google/gemini-3-pro-image-preview" })

      const [, request] = mockFetch.mock.calls[0] as [string, { body: string }]
      const payload = JSON.parse(request.body) as { modalities: string[] }
      expect(payload.modalities).toEqual(["image", "text"])
    })

    it("generate sends image_config for aspectRatio and resolution", async () => {
      const fakeImage = Buffer.from("fake-image-data")
      const mockFetch = stubFetch({
        choices: [
          {
            message: {
              images: [{ type: "image_url", image_url: { url: `data:image/png;base64,${fakeImage.toString("base64")}` } }],
            },
          },
        ],
      })

      const provider = new OpenRouterProvider({ openrouterApiKey: "config-key" })
      await provider.generate({ prompt: "draw a mountain", aspectRatio: "16:9", resolution: "4K" })

      const [, request] = mockFetch.mock.calls[0] as [string, { body: string }]
      const payload = JSON.parse(request.body) as { image_config?: { aspect_ratio?: string; image_size?: string } }
      expect(payload.image_config?.aspect_ratio).toBe("16:9")
      expect(payload.image_config?.image_size).toBe("4K")
    })

    it("generate omits image_config when no aspectRatio or resolution", async () => {
      const fakeImage = Buffer.from("fake-image-data")
      const mockFetch = stubFetch({
        choices: [
          {
            message: {
              images: [{ type: "image_url", image_url: { url: `data:image/png;base64,${fakeImage.toString("base64")}` } }],
            },
          },
        ],
      })

      const provider = new OpenRouterProvider({ openrouterApiKey: "config-key" })
      await provider.generate({ prompt: "draw a tree" })

      const [, request] = mockFetch.mock.calls[0] as [string, { body: string }]
      const payload = JSON.parse(request.body) as Record<string, unknown>
      expect(payload.image_config).toBeUndefined()
    })

    it("generate extracts image from message.images field", async () => {
      const fakeImage = Buffer.from("fake-image-data")
      stubFetch({
        choices: [
          {
            message: {
              content: "Here is your image.",
              images: [
                {
                  type: "image_url",
                  image_url: { url: `data:image/png;base64,${fakeImage.toString("base64")}` },
                },
              ],
            },
          },
        ],
      })

      const provider = new OpenRouterProvider({ openrouterApiKey: "config-key" })
      const result = await provider.generate({ prompt: "draw a house" })

      expect(result.imageData.equals(fakeImage)).toBe(true)
      expect(result.mimeType).toBe("image/png")
    })

    it("generate falls back to string content when images field absent", async () => {
      const fakeImage = Buffer.from("fake-image-data")
      stubFetch({
        choices: [
          {
            message: {
              content: `data:image/png;base64,${fakeImage.toString("base64")}`,
            },
          },
        ],
      })

      const provider = new OpenRouterProvider({ openrouterApiKey: "config-key" })
      const result = await provider.generate({ prompt: "draw a house" })

      expect(result.imageData.equals(fakeImage)).toBe(true)
      expect(result.mimeType).toBe("image/png")
    })

    it("generate falls back to array content with image_url when images field absent", async () => {
      const fakeImage = Buffer.from("fake-image-data")
      stubFetch({
        choices: [
          {
            message: {
              content: [
                {
                  type: "image_url",
                  image_url: {
                    url: `data:image/jpeg;base64,${fakeImage.toString("base64")}`,
                  },
                },
              ],
            },
          },
        ],
      })

      const provider = new OpenRouterProvider({ openrouterApiKey: "config-key" })
      const result = await provider.generate({ prompt: "draw a street" })

      expect(result.imageData.equals(fakeImage)).toBe(true)
      expect(result.mimeType).toBe("image/jpeg")
    })

    it("generate throws on API error", async () => {
      stubFetch({ error: { message: "forbidden" } }, 403)

      const provider = new OpenRouterProvider({ openrouterApiKey: "config-key" })

      await expect(provider.generate({ prompt: "bad request" })).rejects.toThrow(
        "OpenRouter API error: forbidden",
      )
    })

    it("generate throws when no image in response", async () => {
      stubFetch({
        choices: [{ message: { content: "no image data here" } }],
      })

      const provider = new OpenRouterProvider({ openrouterApiKey: "config-key" })

      await expect(provider.generate({ prompt: "text only" })).rejects.toThrow("OpenRouter API returned no image data.")
    })

    it("generate handles response body with leading whitespace", async () => {
      const fakeImage = Buffer.from("fake-image-data")
      const responseJson = JSON.stringify({
        choices: [
          {
            message: {
              images: [
                { type: "image_url", image_url: { url: `data:image/png;base64,${fakeImage.toString("base64")}` } },
              ],
            },
          },
        ],
      })
      const paddedResponse = "\n\n\n         \n\n" + responseJson
      stubFetchWithRawText(paddedResponse)

      const provider = new OpenRouterProvider({ openrouterApiKey: "config-key" })
      const result = await provider.generate({ prompt: "draw a star" })

      expect(result.imageData.equals(fakeImage)).toBe(true)
      expect(result.mimeType).toBe("image/png")
    })

    it("generate throws on empty response body", async () => {
      stubFetchWithRawText("")

      const provider = new OpenRouterProvider({ openrouterApiKey: "config-key" })

      await expect(provider.generate({ prompt: "draw nothing" })).rejects.toThrow(
        "OpenRouter API returned an empty or unparseable response.",
      )
    })

    it("generate throws on invalid JSON response body", async () => {
      stubFetchWithRawText("not json at all")

      const provider = new OpenRouterProvider({ openrouterApiKey: "config-key" })

      await expect(provider.generate({ prompt: "draw broken" })).rejects.toThrow(
        "OpenRouter API returned an empty or unparseable response.",
      )
    })

    it("edit is undefined (not supported)", () => {
      const provider: AIGCProvider = new OpenRouterProvider({ openrouterApiKey: "config-key" })
      expect(provider.edit).toBeUndefined()
    })
  })

  describe("createProvider", () => {
    it('returns GeminiProvider when provider="gemini" and key available', () => {
      const provider = createProvider({ provider: "gemini", geminiApiKey: "config-key" })

      expect(provider).toBeInstanceOf(GeminiProvider)
      expect(provider?.name).toBe("gemini")
    })

    it('returns OpenRouterProvider when provider="openrouter" and key available', () => {
      const provider = createProvider({ provider: "openrouter", openrouterApiKey: "config-key" })

      expect(provider).toBeInstanceOf(OpenRouterProvider)
      expect(provider?.name).toBe("openrouter")
    })

    it('returns null when provider="gemini" and no key', () => {
      const provider = createProvider({ provider: "gemini" })
      expect(provider).toBeNull()
    })

    it("auto mode returns Gemini when GEMINI_API_KEY set", () => {
      process.env.GEMINI_API_KEY = "env-gemini"

      const provider = createProvider({ provider: "auto" })

      expect(provider).toBeInstanceOf(GeminiProvider)
      expect(provider?.name).toBe("gemini")
    })

    it("auto mode returns OpenRouter when only OPENROUTER_API_KEY set", () => {
      process.env.OPENROUTER_API_KEY = "env-openrouter"

      const provider = createProvider({ provider: "auto" })

      expect(provider).toBeInstanceOf(OpenRouterProvider)
      expect(provider?.name).toBe("openrouter")
    })

    it("auto mode returns null when no keys set", () => {
      const provider = createProvider({ provider: "auto" })
      expect(provider).toBeNull()
    })
  })

  describe("generate-image tool", () => {
    it("returns error message when no provider", async () => {
      const fileManager = new FileManager(tempRoot)
      await fileManager.ensureDir()
      const imageTool = createGenerateImageTool(fileManager, null)

      const context = {
        directory: tempRoot,
        worktree: tempRoot,
        messageID: "m1",
        agent: "assistant",
        metadata: vi.fn(),
        sessionID: "test-session",
        abort: new AbortController().signal,
        ask: vi.fn(),
      } as unknown as Parameters<typeof imageTool.execute>[1]

      const output = await imageTool.execute({ operation: "generate", prompt: "draw a cat" }, context)

      expect(output).toContain("Error: No AIGC provider configured.")
      expect(output).toContain("GEMINI_API_KEY")
    })

    it("returns error for edit without sourcePath", async () => {
      const fileManager = new FileManager(tempRoot)
      await fileManager.ensureDir()

      const fakeProvider: AIGCProvider = {
        name: "test",
        models: ["test-model"],
        isAvailable: () => true,
        generate: vi.fn().mockResolvedValue({ imageData: Buffer.from("fake-png"), mimeType: "image/png" }),
      }

      const imageTool = createGenerateImageTool(fileManager, fakeProvider)
      const context = {
        directory: tempRoot,
        worktree: tempRoot,
        messageID: "m1",
        agent: "assistant",
        metadata: vi.fn(),
        sessionID: "test-session",
        abort: new AbortController().signal,
        ask: vi.fn(),
      } as unknown as Parameters<typeof imageTool.execute>[1]

      const output = await imageTool.execute({ operation: "edit", prompt: "fix this" }, context)

      expect(output).toBe("Error: 'edit' operation requires a sourcePath argument.")
    })

    it("calls provider.generate and returns File output", async () => {
      const fileManager = new FileManager(tempRoot)
      await fileManager.ensureDir()

      const fakeProvider: AIGCProvider = {
        name: "test",
        models: ["test-model"],
        isAvailable: () => true,
        generate: vi.fn().mockResolvedValue({
          imageData: Buffer.from("fake-png"),
          mimeType: "image/png",
        }),
      }

      const imageTool = createGenerateImageTool(fileManager, fakeProvider)
      const metadataSpy = vi.fn()
      const context = {
        directory: tempRoot,
        worktree: tempRoot,
        messageID: "m1",
        agent: "assistant",
        metadata: metadataSpy,
        sessionID: "test-session",
        abort: new AbortController().signal,
        ask: vi.fn(),
      } as unknown as Parameters<typeof imageTool.execute>[1]

      const output = await imageTool.execute(
        {
          operation: "generate",
          prompt: "draw a castle",
          model: "test-model",
        },
        context,
      )

      expect(fakeProvider.generate).toHaveBeenCalledTimes(1)
      expect(output).toContain("AIGC image generated successfully.")
      expect(output).toContain("File: ")
      expect(output).toContain("Provider: test")
      expect(output).toContain("Model: test-model")
      expect(metadataSpy).toHaveBeenCalledTimes(1)
    })

    it("calls provider.edit and succeeds for edit operation", async () => {
      const fileManager = new FileManager(tempRoot)
      await fileManager.ensureDir()

      const sourcePath = path.join(tempRoot, "source.png")
      await fs.writeFile(sourcePath, Buffer.from("source-bytes"))

      const editSpy = vi.fn().mockResolvedValue({
        imageData: Buffer.from("edited-png"),
        mimeType: "image/png",
      })

      const fakeProvider: AIGCProvider = {
        name: "test",
        models: ["test-model"],
        isAvailable: () => true,
        generate: vi.fn().mockResolvedValue({ imageData: Buffer.from("unused"), mimeType: "image/png" }),
        edit: editSpy,
      }

      const imageTool = createGenerateImageTool(fileManager, fakeProvider)
      const context = {
        directory: tempRoot,
        worktree: tempRoot,
        messageID: "m1",
        agent: "assistant",
        metadata: vi.fn(),
        sessionID: "test-session",
        abort: new AbortController().signal,
        ask: vi.fn(),
      } as unknown as Parameters<typeof imageTool.execute>[1]

      const output = await imageTool.execute(
        {
          operation: "edit",
          prompt: "add warm tones",
          sourcePath,
        },
        context,
      )

      expect(editSpy).toHaveBeenCalledTimes(1)
      const callArg = editSpy.mock.calls[0]?.[0] as { instruction: string; sourceImage: Buffer }
      expect(callArg.instruction).toBe("add warm tones")
      expect(callArg.sourceImage.equals(Buffer.from("source-bytes"))).toBe(true)
      expect(output).toContain("AIGC image generated successfully.")
    })

    it("returns error when provider does not support edit operations", async () => {
      const fileManager = new FileManager(tempRoot)
      await fileManager.ensureDir()

      const sourcePath = path.join(tempRoot, "source.png")
      await fs.writeFile(sourcePath, Buffer.from("source-bytes"))

      const fakeProvider: AIGCProvider = {
        name: "test",
        models: ["test-model"],
        isAvailable: () => true,
        generate: vi.fn().mockResolvedValue({ imageData: Buffer.from("fake-png"), mimeType: "image/png" }),
      }

      const imageTool = createGenerateImageTool(fileManager, fakeProvider)
      const context = {
        directory: tempRoot,
        worktree: tempRoot,
        messageID: "m1",
        agent: "assistant",
        metadata: vi.fn(),
        sessionID: "test-session",
        abort: new AbortController().signal,
        ask: vi.fn(),
      } as unknown as Parameters<typeof imageTool.execute>[1]

      const output = await imageTool.execute(
        {
          operation: "edit",
          prompt: "enhance details",
          sourcePath,
        },
        context,
      )

      expect(output).toBe("Error: Provider 'test' does not support 'edit' operations.")
    })

    it("routes to correct provider based on model arg", async () => {
      const fileManager = new FileManager(tempRoot)
      await fileManager.ensureDir()

      const geminiGenerate = vi.fn().mockResolvedValue({
        imageData: Buffer.from("gemini-png"),
        mimeType: "image/png",
      })
      const openrouterGenerate = vi.fn().mockResolvedValue({
        imageData: Buffer.from("openrouter-png"),
        mimeType: "image/png",
      })

      const fakeGemini: AIGCProvider = {
        name: "gemini",
        models: ["gemini-2.5-flash-image", "gemini-3-pro-image-preview"],
        isAvailable: () => true,
        generate: geminiGenerate,
      }
      const fakeOpenRouter: AIGCProvider = {
        name: "openrouter",
        models: ["bytedance-seed/seedream-4.5"],
        isAvailable: () => true,
        generate: openrouterGenerate,
      }

      const imageTool = createGenerateImageTool(fileManager, [fakeGemini, fakeOpenRouter])
      const context = {
        directory: tempRoot,
        worktree: tempRoot,
        messageID: "m1",
        agent: "assistant",
        metadata: vi.fn(),
        sessionID: "test-session",
        abort: new AbortController().signal,
        ask: vi.fn(),
      } as unknown as Parameters<typeof imageTool.execute>[1]

      const output = await imageTool.execute(
        { operation: "generate", prompt: "draw a robot", model: "bytedance-seed/seedream-4.5" },
        context,
      )

      expect(openrouterGenerate).toHaveBeenCalledTimes(1)
      expect(geminiGenerate).not.toHaveBeenCalled()
      expect(output).toContain("Provider: openrouter")
    })

    it("falls back to first provider when model is not specified", async () => {
      const fileManager = new FileManager(tempRoot)
      await fileManager.ensureDir()

      const geminiGenerate = vi.fn().mockResolvedValue({
        imageData: Buffer.from("gemini-png"),
        mimeType: "image/png",
      })
      const openrouterGenerate = vi.fn().mockResolvedValue({
        imageData: Buffer.from("openrouter-png"),
        mimeType: "image/png",
      })

      const fakeGemini: AIGCProvider = {
        name: "gemini",
        models: ["gemini-2.5-flash-image"],
        isAvailable: () => true,
        generate: geminiGenerate,
      }
      const fakeOpenRouter: AIGCProvider = {
        name: "openrouter",
        models: ["bytedance-seed/seedream-4.5"],
        isAvailable: () => true,
        generate: openrouterGenerate,
      }

      const imageTool = createGenerateImageTool(fileManager, [fakeGemini, fakeOpenRouter])
      const context = {
        directory: tempRoot,
        worktree: tempRoot,
        messageID: "m1",
        agent: "assistant",
        metadata: vi.fn(),
        sessionID: "test-session",
        abort: new AbortController().signal,
        ask: vi.fn(),
      } as unknown as Parameters<typeof imageTool.execute>[1]

      const output = await imageTool.execute(
        { operation: "generate", prompt: "draw a cat" },
        context,
      )

      expect(geminiGenerate).toHaveBeenCalledTimes(1)
      expect(openrouterGenerate).not.toHaveBeenCalled()
      expect(output).toContain("Provider: gemini")
    })

    it("returns error when empty providers array and no model", async () => {
      const fileManager = new FileManager(tempRoot)
      await fileManager.ensureDir()

      const imageTool = createGenerateImageTool(fileManager, [])
      const context = {
        directory: tempRoot,
        worktree: tempRoot,
        messageID: "m1",
        agent: "assistant",
        metadata: vi.fn(),
        sessionID: "test-session",
        abort: new AbortController().signal,
        ask: vi.fn(),
      } as unknown as Parameters<typeof imageTool.execute>[1]

      const output = await imageTool.execute({ operation: "generate", prompt: "draw nothing" }, context)

      expect(output).toContain("Error: No AIGC provider configured.")
    })
  })

  describe("createAllProviders", () => {
    it("returns both providers when both keys are set", () => {
      process.env.GEMINI_API_KEY = "env-gemini"
      process.env.OPENROUTER_API_KEY = "env-openrouter"

      const all = createAllProviders({ provider: "auto" })

      expect(all).toHaveLength(2)
      expect(all[0]).toBeInstanceOf(GeminiProvider)
      expect(all[1]).toBeInstanceOf(OpenRouterProvider)
    })

    it("returns only Gemini when only GEMINI_API_KEY set", () => {
      process.env.GEMINI_API_KEY = "env-gemini"

      const all = createAllProviders({ provider: "auto" })

      expect(all).toHaveLength(1)
      expect(all[0]).toBeInstanceOf(GeminiProvider)
    })

    it("returns only OpenRouter when only OPENROUTER_API_KEY set", () => {
      process.env.OPENROUTER_API_KEY = "env-openrouter"

      const all = createAllProviders({ provider: "auto" })

      expect(all).toHaveLength(1)
      expect(all[0]).toBeInstanceOf(OpenRouterProvider)
    })

    it("returns empty array when no keys set", () => {
      const all = createAllProviders({ provider: "auto" })
      expect(all).toHaveLength(0)
    })

    it("returns only Gemini when provider is explicitly gemini", () => {
      process.env.GEMINI_API_KEY = "env-gemini"
      process.env.OPENROUTER_API_KEY = "env-openrouter"

      const all = createAllProviders({ provider: "gemini" })

      expect(all).toHaveLength(1)
      expect(all[0]).toBeInstanceOf(GeminiProvider)
    })

    it("returns only OpenRouter when provider is explicitly openrouter", () => {
      process.env.GEMINI_API_KEY = "env-gemini"
      process.env.OPENROUTER_API_KEY = "env-openrouter"

      const all = createAllProviders({ provider: "openrouter" })

      expect(all).toHaveLength(1)
      expect(all[0]).toBeInstanceOf(OpenRouterProvider)
    })
  })
})
