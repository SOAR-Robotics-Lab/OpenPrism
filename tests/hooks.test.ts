import * as fs from "node:fs/promises"
import * as os from "node:os"
import * as path from "node:path"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { DEFAULT_CONFIG, type OpenPrismConfig } from "../src/types.ts"
import { FileManager } from "../src/utils/file-manager.ts"
import { createSystemPromptHook } from "../src/hooks/system-prompt.ts"
import { createSessionCompactionHook } from "../src/hooks/session-compaction.ts"
import { createMermaidAfterHook } from "../src/hooks/mermaid-renderer.ts"

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
    expect(joined).toContain("Tier 2: Matplotlib Data Visualization")
    expect(joined).toContain("plot_data")
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
