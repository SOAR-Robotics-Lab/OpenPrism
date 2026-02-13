import * as fs from "node:fs/promises"
import * as os from "node:os"
import * as path from "node:path"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { DEFAULT_CONFIG, type OpenPrismConfig } from "../src/types.ts"
import { FileManager } from "../src/utils/file-manager.ts"
import { createSystemPromptHook } from "../src/hooks/system-prompt.ts"
import { createSessionCompactionHook } from "../src/hooks/session-compaction.ts"
import { createMermaidAfterHook } from "../src/hooks/mermaid-renderer.ts"
import {
  createInlineImageTextCompleteHook,
  inlineLocalImageMarkdown,
} from "../src/hooks/text-complete-inline-image.ts"
import { createStripImagesTransformHook } from "../src/hooks/strip-images-transform.ts"

// ---------------------------------------------------------------------------
// createSystemPromptHook
// ---------------------------------------------------------------------------

describe("createSystemPromptHook", () => {
  it("injects all three tier sections when all tiers are enabled", async () => {
    const hook = createSystemPromptHook({ ...DEFAULT_CONFIG })
    const output = { system: [] as string[] }
    await hook({ model: { id: "test", name: "test", providerID: "test" } as Parameters<typeof hook>[0]["model"] }, output)

    const joined = output.system.join("\n")
    expect(joined).toContain("Tier 1: Mermaid Diagrams")
    expect(joined).toContain("render_mermaid")
    expect(joined).toContain("analyze_structure")
    expect(joined).toContain("Tier 2a: Matplotlib Data Visualization (Static)")
    expect(joined).toContain("plot_data")
    expect(joined).toContain("Always use English for all text in plots")
    expect(joined).toContain("CJK")
    expect(joined).toContain("Tier 2b: Plotly.js Interactive Charts")
    expect(joined).toContain("plot_interactive")
    expect(joined).toContain("Tier 3: AIGC Image Generation")
    expect(joined).toContain("generate_image")
    expect(joined).toContain("Selection Guidelines")
  })

  it("omits Tier 1 section when mermaidEnabled is false", async () => {
    const config: OpenPrismConfig = { ...DEFAULT_CONFIG, mermaidEnabled: false }
    const hook = createSystemPromptHook(config)
    const output = { system: [] as string[] }
    await hook({ model: { id: "test", name: "test", providerID: "test" } as Parameters<typeof hook>[0]["model"] }, output)

    const joined = output.system.join("\n")
    expect(joined).not.toContain("Tier 1: Mermaid Diagrams")
    expect(joined).not.toContain("render_mermaid")
    // Other tiers still present
    expect(joined).toContain("Tier 2")
    expect(joined).toContain("Tier 3")
  })

  it("omits Tier 2 section when matplotlibEnabled is false", async () => {
    const config: OpenPrismConfig = { ...DEFAULT_CONFIG, matplotlibEnabled: false }
    const hook = createSystemPromptHook(config)
    const output = { system: [] as string[] }
    await hook({ model: { id: "test", name: "test", providerID: "test" } as Parameters<typeof hook>[0]["model"] }, output)

    const joined = output.system.join("\n")
    expect(joined).not.toContain("Tier 2: Matplotlib Data Visualization")
    expect(joined).not.toContain("plot_data")
    expect(joined).toContain("Tier 1")
    expect(joined).toContain("Tier 3")
  })

  it("omits Tier 3 section when aigcEnabled is false", async () => {
    const config: OpenPrismConfig = { ...DEFAULT_CONFIG, aigcEnabled: false }
    const hook = createSystemPromptHook(config)
    const output = { system: [] as string[] }
    await hook({ model: { id: "test", name: "test", providerID: "test" } as Parameters<typeof hook>[0]["model"] }, output)

    const joined = output.system.join("\n")
    expect(joined).not.toContain("Tier 3: AIGC Image Generation")
    expect(joined).not.toContain("generate_image")
    expect(joined).toContain("Tier 1")
    expect(joined).toContain("Tier 2")
  })

  it("always includes selection guidelines regardless of config", async () => {
    const config: OpenPrismConfig = {
      ...DEFAULT_CONFIG,
      mermaidEnabled: false,
      matplotlibEnabled: false,
      aigcEnabled: false,
    }
    const hook = createSystemPromptHook(config)
    const output = { system: [] as string[] }
    await hook({ model: { id: "test", name: "test", providerID: "test" } as Parameters<typeof hook>[0]["model"] }, output)

    const joined = output.system.join("\n")
    expect(joined).toContain("Selection Guidelines")
    expect(joined).toContain("Architecture / Logic")
  })
})

// ---------------------------------------------------------------------------
// createSessionCompactionHook
// ---------------------------------------------------------------------------

describe("createSessionCompactionHook", () => {
  let tempRoot: string

  beforeEach(async () => {
    tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "openprism-hooks-"))
  })

  afterEach(async () => {
    await fs.rm(tempRoot, { recursive: true, force: true })
  })

  it("does not push context when no assets exist", async () => {
    const fileManager = new FileManager(tempRoot)
    await fileManager.ensureDir()
    const hook = createSessionCompactionHook(fileManager)
    const output = { context: [] as string[] }
    await hook({ sessionID: "test-session" }, output)

    expect(output.context).toHaveLength(0)
  })

  it("pushes a summary with tier labels when assets exist", async () => {
    const fileManager = new FileManager(tempRoot)
    await fileManager.ensureDir()

    const file1 = path.join(await fileManager.ensureTierDir(1), "a.svg")
    const file2 = path.join(await fileManager.ensureTierDir(2), "b.png")
    await fs.writeFile(file1, "<svg></svg>", "utf-8")
    await fs.writeFile(file2, Buffer.alloc(100))
    await fileManager.recordAsset(1, file1, "Architecture diagram")
    await fileManager.recordAsset(2, file2, "Performance chart")

    const hook = createSessionCompactionHook(fileManager)
    const output = { context: [] as string[] }
    await hook({ sessionID: "test-session" }, output)

    expect(output.context).toHaveLength(1)
    const text = output.context[0]!
    expect(text).toContain("OpenPrism Visual Assets Summary")
    expect(text).toContain("Total generated assets: 2")
    expect(text).toContain("Mermaid Diagrams (1 assets)")
    expect(text).toContain("Architecture diagram")
    expect(text).toContain("Matplotlib Plots (1 assets)")
    expect(text).toContain("Performance chart")
  })

  it("truncates descriptions at 10 per tier with overflow note", async () => {
    const fileManager = new FileManager(tempRoot)
    await fileManager.ensureDir()

    const tierDir = await fileManager.ensureTierDir(1)
    for (let i = 0; i < 13; i++) {
      const filePath = path.join(tierDir, `file-${i}.svg`)
      await fs.writeFile(filePath, `<svg>${i}</svg>`, "utf-8")
      await fileManager.recordAsset(1, filePath, `Diagram ${i}`)
    }

    const hook = createSessionCompactionHook(fileManager)
    const output = { context: [] as string[] }
    await hook({ sessionID: "test-session" }, output)

    const text = output.context[0]!
    expect(text).toContain("Mermaid Diagrams (13 assets)")
    expect(text).toContain("Diagram 0")
    expect(text).toContain("Diagram 9")
    expect(text).not.toContain("Diagram 10")
    expect(text).toContain("... and 3 more")
  })
})

// ---------------------------------------------------------------------------
// createMermaidAfterHook
// ---------------------------------------------------------------------------

describe("createMermaidAfterHook", () => {
  let tempRoot: string
  const originalPath = process.env["PATH"] ?? ""

  beforeEach(async () => {
    tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "openprism-hooks-mermaid-"))
    process.env["PATH"] = `${path.join(process.cwd(), "node_modules", ".bin")}:${originalPath}`
  })

  afterEach(async () => {
    process.env["PATH"] = originalPath
    await fs.rm(tempRoot, { recursive: true, force: true })
  })

  it("leaves output unchanged when no mermaid blocks exist", async () => {
    const fileManager = new FileManager(tempRoot)
    await fileManager.ensureDir()
    const hook = createMermaidAfterHook(fileManager)

    const output = {
      title: "test",
      output: "Here is some plain text with no diagrams.",
      metadata: {},
    }
    const originalOutput = output.output
    await hook({ tool: "bash", sessionID: "s1", callID: "c1" }, output)

    expect(output.output).toBe(originalOutput)
  })

  it("appends skip message for invalid mermaid blocks", async () => {
    const fileManager = new FileManager(tempRoot)
    await fileManager.ensureDir()
    const hook = createMermaidAfterHook(fileManager)

    const output = {
      title: "test",
      output: "```mermaid\nnot-a-valid-diagram\nfoo bar\n```",
      metadata: {},
    }
    await hook({ tool: "bash", sessionID: "s1", callID: "c1" }, output)

    expect(output.output).toContain("[OpenPrism] Skipped invalid Mermaid block")
  })

  it("sets metadata file path for plot_data tool output", async () => {
    const fileManager = new FileManager(tempRoot)
    await fileManager.ensureDir()
    let capturedPath: string | undefined
    const hook = createMermaidAfterHook(fileManager, (_sessionID, filePath) => {
      capturedPath = filePath
    })

    const output = {
      title: "test",
      output:
        "Matplotlib plot generated successfully.\nFile: /tmp/example-plot.png\nFormat: png | Size: 12345 bytes",
      metadata: {} as Record<string, unknown>,
    }

    await hook({ tool: "plot_data", sessionID: "s1", callID: "c1" }, output)

    expect(output.metadata.filePath).toBe("/tmp/example-plot.png")
    expect(output.metadata.filepath).toBe("/tmp/example-plot.png")
    expect(capturedPath).toBe("/tmp/example-plot.png")
  })

  it("renders valid mermaid blocks and appends result path", async () => {
    const fileManager = new FileManager(tempRoot)
    await fileManager.ensureDir()
    const hook = createMermaidAfterHook(fileManager)

    const output = {
      title: "test",
      output: "Here is a diagram:\n```mermaid\nflowchart TD\nA[Start]-->B[End]\n```\nDone.",
      metadata: {},
    }
    await hook({ tool: "bash", sessionID: "s1", callID: "c1" }, output)

    expect(output.output).toContain("[OpenPrism] Rendered Mermaid diagram")
    expect(output.output).toContain(".svg")

    // Verify the asset was recorded
    const assets = await fileManager.getAssets()
    expect(assets).toHaveLength(1)
    expect(assets[0]!.tier).toBe(1)
    expect(assets[0]!.description).toContain("Auto-rendered Mermaid diagram")

    // Verify metadata includes filePath for web UI display
    const meta = output.metadata as Record<string, unknown>
    expect(meta.filePath).toBeDefined()
    expect(meta.filepath).toBeDefined()
    expect(typeof meta.filePath).toBe("string")
    expect(meta.filePath as string).toContain(".svg")
  })

  it("does not set metadata.filePath when no valid blocks render", async () => {
    const fileManager = new FileManager(tempRoot)
    await fileManager.ensureDir()
    const hook = createMermaidAfterHook(fileManager)

    const output = {
      title: "test",
      output: "```mermaid\nnot-valid\nstuff\n```",
      metadata: {} as Record<string, unknown>,
    }
    await hook({ tool: "bash", sessionID: "s1", callID: "c1" }, output)

    expect(output.metadata.filePath).toBeUndefined()
  })
})

describe("createInlineImageTextCompleteHook", () => {
  let tempRoot: string
  const PNG_BYTES = Buffer.from([0x89, 0x50, 0x4e, 0x47])
  const DATA_URI = `data:image/png;base64,${PNG_BYTES.toString("base64")}`
  const VALID_PNG_BYTES = Buffer.from([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d,
    0x49, 0x48, 0x44, 0x52, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
    0x08, 0x02, 0x00, 0x00, 0x00, 0x90, 0x77, 0x53, 0xde, 0x00, 0x00, 0x00,
    0x0c, 0x49, 0x44, 0x41, 0x54, 0x78, 0x9c, 0x63, 0xf8, 0xcf, 0xc0, 0x00,
    0x00, 0x03, 0x01, 0x01, 0x00, 0xc9, 0xfe, 0x92, 0xef, 0x00, 0x00, 0x00,
    0x00, 0x49, 0x45, 0x4e, 0x44, 0xae, 0x42, 0x60, 0x82,
  ])

  beforeEach(async () => {
    tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "openprism-hooks-text-complete-"))
  })

  afterEach(async () => {
    await fs.rm(tempRoot, { recursive: true, force: true })
  })

  it("replaces absolute image path with text link (no data URI)", async () => {
    const outputDir = path.join(tempRoot, ".opencode", "plots", "matplotlib")
    await fs.mkdir(outputDir, { recursive: true })

    const imagePath = path.join(outputDir, "plot.png")
    await fs.writeFile(imagePath, PNG_BYTES)

    const hook = createInlineImageTextCompleteHook(tempRoot, ".opencode/plots")
    const output = { text: `![plot](${imagePath})` }

    await hook({ sessionID: "s1", messageID: "m1", partID: "p1" }, output)

    expect(output.text).not.toContain("data:")
    expect(output.text).not.toContain("<img")
    expect(output.text).toContain("🖼 plot")
  })

  it("does not convert image paths outside the project directory", async () => {
    const outsideDir = await fs.mkdtemp(path.join(os.tmpdir(), "openprism-outside-"))
    const outsideImagePath = path.join(outsideDir, "outside.png")
    await fs.writeFile(outsideImagePath, PNG_BYTES)

    const hook = createInlineImageTextCompleteHook(tempRoot, ".opencode/plots")
    const output = { text: `![plot](${outsideImagePath})` }

    await hook({ sessionID: "s1", messageID: "m1", partID: "p1" }, output)

    expect(output.text).toBe(`![plot](${outsideImagePath})`)
    await fs.rm(outsideDir, { recursive: true, force: true })
  })

  it("replaces web-root image link with text link", async () => {
    const outputDir = path.join(tempRoot, ".opencode", "plots", "matplotlib")
    await fs.mkdir(outputDir, { recursive: true })

    const imagePath = path.join(outputDir, "plot.png")
    await fs.writeFile(imagePath, PNG_BYTES)

    const hook = createInlineImageTextCompleteHook(tempRoot, ".opencode/plots")
    const output = { text: "![plot](/.opencode/plots/matplotlib/plot.png)" }

    await hook({ sessionID: "s1", messageID: "m1", partID: "p1" }, output)

    expect(output.text).not.toContain("data:")
    expect(output.text).toContain("🖼 plot")
  })

  it("replaces relative image link with text link", async () => {
    const outputDir = path.join(tempRoot, ".opencode", "plots", "matplotlib")
    await fs.mkdir(outputDir, { recursive: true })

    const imagePath = path.join(outputDir, "plot.png")
    await fs.writeFile(imagePath, PNG_BYTES)

    const hook = createInlineImageTextCompleteHook(tempRoot, ".opencode/plots")
    const output = { text: "![plot](.opencode/plots/matplotlib/plot.png)" }

    await hook({ sessionID: "s1", messageID: "m1", partID: "p1" }, output)

    expect(output.text).not.toContain("data:")
    expect(output.text).toContain("🖼 plot")
  })

  it("leaves non-image extension links unchanged", async () => {
    const allowedRoot = path.join(tempRoot, ".opencode", "plots")
    await fs.mkdir(allowedRoot, { recursive: true })

    const text = `![doc](${path.join(allowedRoot, "chart.txt")})`
    const transformed = await inlineLocalImageMarkdown(text, allowedRoot)

    expect(transformed).toBe(text)
  })

  it("appends fallback text link when assistant text has no image", async () => {
    const outputDir = path.join(tempRoot, ".opencode", "plots", "matplotlib")
    await fs.mkdir(outputDir, { recursive: true })

    const imagePath = path.join(outputDir, "plot.png")
    await fs.writeFile(imagePath, PNG_BYTES)

    const latestBySession = new Map<string, string>([["s1", imagePath]])
    const hook = createInlineImageTextCompleteHook(tempRoot, ".opencode/plots", {
      consumeLatestImagePath: (sessionID) => {
        const value = latestBySession.get(sessionID)
        latestBySession.delete(sessionID)
        return value
      },
    })

    const output = { text: "Plot created successfully." }
    await hook({ sessionID: "s1", messageID: "m1", partID: "p1" }, output)

    expect(output.text).not.toContain("data:")
    expect(output.text).toContain("🖼 OpenPrism image")
  })

  it("does not append fallback image when markdown image already exists", async () => {
    const outputDir = path.join(tempRoot, ".opencode", "plots", "matplotlib")
    await fs.mkdir(outputDir, { recursive: true })

    const firstImagePath = path.join(outputDir, "first.png")
    const secondImagePath = path.join(outputDir, "second.png")
    await fs.writeFile(firstImagePath, PNG_BYTES)
    await fs.writeFile(secondImagePath, PNG_BYTES)

    const hook = createInlineImageTextCompleteHook(tempRoot, ".opencode/plots", {
      consumeLatestImagePath: () => secondImagePath,
    })

    const output = { text: `![plot](${firstImagePath})` }
    await hook({ sessionID: "s1", messageID: "m1", partID: "p1" }, output)

    expect(output.text).toContain("🖼 plot")
    expect(output.text).not.toContain("OpenPrism image")
  })

  it("skips images when file does not exist on disk", async () => {
    const outputDir = path.join(tempRoot, ".opencode", "plots", "matplotlib")
    await fs.mkdir(outputDir, { recursive: true })

    const missingPath = path.join(outputDir, "missing.png")
    const hook = createInlineImageTextCompleteHook(tempRoot, ".opencode/plots")
    const output = { text: `![plot](${missingPath})` }

    await hook({ sessionID: "s1", messageID: "m1", partID: "p1" }, output)

    expect(output.text).toBe(`![plot](${missingPath})`)
  })

  it("leaves already-inlined data URIs unchanged", async () => {
    const hook = createInlineImageTextCompleteHook(tempRoot, ".opencode/plots")
    const output = { text: `![plot](${DATA_URI})` }

    await hook({ sessionID: "s1", messageID: "m1", partID: "p1" }, output)

    expect(output.text).toBe(`![plot](${DATA_URI})`)
  })

  it("preserves alt text with special characters in text link", async () => {
    const outputDir = path.join(tempRoot, ".opencode", "plots", "mermaid")
    await fs.mkdir(outputDir, { recursive: true })

    const imagePath = path.join(outputDir, "diagram.png")
    await fs.writeFile(imagePath, PNG_BYTES)

    const hook = createInlineImageTextCompleteHook(tempRoot, ".opencode/plots")
    const output = { text: `![A<B & "C"](${imagePath})` }

    await hook({ sessionID: "s1", messageID: "m1", partID: "p1" }, output)

    expect(output.text).not.toContain("data:")
    expect(output.text).toContain('🖼 A<B & "C"')
  })

  it("never inlines data URIs regardless of file size", async () => {
    const outputDir = path.join(tempRoot, ".opencode", "plots", "matplotlib")
    await fs.mkdir(outputDir, { recursive: true })

    const imagePath = path.join(outputDir, "tiny.png")
    await fs.writeFile(imagePath, PNG_BYTES)

    const hook = createInlineImageTextCompleteHook(tempRoot, ".opencode/plots")
    const output = { text: `![tiny](${imagePath})` }

    await hook({ sessionID: "s1", messageID: "m1", partID: "p1" }, output)

    expect(output.text).not.toContain("data:image")
    expect(output.text).not.toContain("<img")
    expect(output.text).not.toContain("base64")
    expect(output.text).toContain("🖼 tiny")
  })

  it("uses viewer URL fallback when mediaServer is available but thumbnail fails", async () => {
    const outputDir = path.join(tempRoot, ".opencode", "plots", "matplotlib")
    await fs.mkdir(outputDir, { recursive: true })

    const imagePath = path.join(outputDir, "plot.png")
    await fs.writeFile(imagePath, PNG_BYTES) // invalid PNG — thumbnail generation fails

    const fakeViewerUrl = "http://127.0.0.1:12345/view/fake-id"
    const fakeRawUrl = "http://127.0.0.1:12345/api/media/fake-id"
    const fakeMediaServer = {
      ensureStarted: async () => {},
      registerMedia: () => {},
      viewUrl: () => fakeViewerUrl,
      mediaUrl: () => fakeRawUrl,
    } as unknown as import("../src/utils/media-server.ts").MediaServer

    const hook = createInlineImageTextCompleteHook(tempRoot, ".opencode/plots", {
      mediaServer: fakeMediaServer,
    })
    const output = { text: `![chart](${imagePath})` }

    await hook({ sessionID: "s1", messageID: "m1", partID: "p1" }, output)

    // Thumbnail fails (invalid PNG) → fallback to text link with viewer URL
    expect(output.text).toContain("🖼 chart")
    expect(output.text).toContain(fakeViewerUrl)
    expect(output.text).not.toContain(fakeRawUrl) // rawUrl no longer used
  })

  it("falls back to source path when no mediaServer", async () => {
    const outputDir = path.join(tempRoot, ".opencode", "plots", "matplotlib")
    await fs.mkdir(outputDir, { recursive: true })

    const imagePath = path.join(outputDir, "plot.png")
    await fs.writeFile(imagePath, PNG_BYTES)

    const hook = createInlineImageTextCompleteHook(tempRoot, ".opencode/plots")
    const output = { text: `![chart](${imagePath})` }

    await hook({ sessionID: "s1", messageID: "m1", partID: "p1" }, output)

    expect(output.text).toBe(`[🖼 chart](${imagePath})`)
  })

  it("embeds base64 thumbnail when image is valid and mediaServer is available", async () => {
    const outputDir = path.join(tempRoot, ".opencode", "plots", "matplotlib")
    await fs.mkdir(outputDir, { recursive: true })

    const imagePath = path.join(outputDir, "plot.png")
    await fs.writeFile(imagePath, VALID_PNG_BYTES)

    const fakeViewerUrl = "http://127.0.0.1:12345/view/fake-id"
    const fakeRawUrl = "http://127.0.0.1:12345/api/media/fake-id"
    const fakeMediaServer = {
      ensureStarted: async () => {},
      registerMedia: () => {},
      viewUrl: () => fakeViewerUrl,
      mediaUrl: () => fakeRawUrl,
    } as unknown as import("../src/utils/media-server.ts").MediaServer

    const hook = createInlineImageTextCompleteHook(tempRoot, ".opencode/plots", {
      mediaServer: fakeMediaServer,
    })
    const output = { text: `![chart](${imagePath})` }

    await hook({ sessionID: "s1", messageID: "m1", partID: "p1" }, output)

    expect(output.text).toContain("![chart](data:image/webp;base64,")
    expect(output.text).toContain(fakeViewerUrl)
    expect(output.text).not.toContain(fakeRawUrl)
  })

  it("embeds base64 thumbnail without viewer link when no mediaServer", async () => {
    const outputDir = path.join(tempRoot, ".opencode", "plots", "matplotlib")
    await fs.mkdir(outputDir, { recursive: true })

    const imagePath = path.join(outputDir, "plot.png")
    await fs.writeFile(imagePath, VALID_PNG_BYTES)

    const hook = createInlineImageTextCompleteHook(tempRoot, ".opencode/plots")
    const output = { text: `![chart](${imagePath})` }

    await hook({ sessionID: "s1", messageID: "m1", partID: "p1" }, output)

    expect(output.text).toContain("![chart](data:image/webp;base64,")
    expect(output.text).not.toContain("🔍")
    expect(output.text).not.toContain("http://")
  })
})

// ---------------------------------------------------------------------------
// createStripImagesTransformHook
// ---------------------------------------------------------------------------

describe("createStripImagesTransformHook", () => {
  const stubInput = {} as Parameters<ReturnType<typeof createStripImagesTransformHook>>[0]

  type StripOutput = Parameters<ReturnType<typeof createStripImagesTransformHook>>[1]

  function makeOutput(messages: { parts: { type: string; text: string }[] }[]): StripOutput {
    return { messages } as unknown as StripOutput
  }

  function partText(output: StripOutput, msgIdx: number, partIdx: number): string {
    return (output.messages[msgIdx]!.parts[partIdx] as unknown as { text: string }).text
  }

  it("strips data URI images from message text parts", async () => {
    const hook = createStripImagesTransformHook()
    const output = makeOutput([
      {
        parts: [
          { type: "text", text: "Here is the chart:\n![chart](data:image/webp;base64,UklGR...)\n[🔍 chart](http://127.0.0.1:9999/view/abc)" },
        ],
      },
    ])

    await hook(stubInput, output)

    expect(partText(output, 0, 0)).toBe("Here is the chart:\n[🖼 chart]\n[🔍 chart](http://127.0.0.1:9999/view/abc)")
  })

  it("leaves non-image text parts unchanged", async () => {
    const hook = createStripImagesTransformHook()
    const original = "Normal text without any images."
    const output = makeOutput([{ parts: [{ type: "text", text: original }] }])

    await hook(stubInput, output)

    expect(partText(output, 0, 0)).toBe(original)
  })

  it("strips multiple data URI images in one part", async () => {
    const hook = createStripImagesTransformHook()
    const output = makeOutput([
      {
        parts: [
          { type: "text", text: "![a](data:image/png;base64,ABC) and ![b](data:image/webp;base64,DEF)" },
        ],
      },
    ])

    await hook(stubInput, output)

    expect(partText(output, 0, 0)).toBe("[🖼 a] and [🖼 b]")
  })

  it("skips non-text parts", async () => {
    const hook = createStripImagesTransformHook()
    const output = makeOutput([
      {
        parts: [
          { type: "tool-invocation", text: "![x](data:image/png;base64,NOPE)" },
        ],
      },
    ])

    await hook(stubInput, output)

    expect(partText(output, 0, 0)).toBe("![x](data:image/png;base64,NOPE)")
  })
})
