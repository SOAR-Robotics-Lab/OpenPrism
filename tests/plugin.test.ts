import * as fs from "node:fs/promises"
import * as os from "node:os"
import * as path from "node:path"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { OpenPrismPlugin } from "../src/index.ts"

describe("OpenPrismPlugin", () => {
  let tempRoot: string

  beforeEach(async () => {
    tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "openprism-plugin-"))
  })

  afterEach(async () => {
    await fs.rm(tempRoot, { recursive: true, force: true })
  })

  function makePluginInput(directory: string): Parameters<typeof OpenPrismPlugin>[0] {
    return {
      directory,
      worktree: directory,
      project: { root: directory } as Parameters<typeof OpenPrismPlugin>[0]["project"],
      client: {} as Parameters<typeof OpenPrismPlugin>[0]["client"],
      serverUrl: new URL("http://localhost:0"),
      $: (() => {}) as unknown as Parameters<typeof OpenPrismPlugin>[0]["$"],
    }
  }

  it("returns all 4 tools with default config", async () => {
    const result = await OpenPrismPlugin(makePluginInput(tempRoot))

    expect(result.tool).toBeDefined()
    const toolNames = Object.keys(result.tool!)
    expect(toolNames).toContain("render_mermaid")
    expect(toolNames).toContain("analyze_structure")
    expect(toolNames).toContain("plot_data")
    expect(toolNames).toContain("generate_image")
    expect(toolNames).toHaveLength(4)
  })

  it("returns all 3 lifecycle hooks", async () => {
    const result = await OpenPrismPlugin(makePluginInput(tempRoot))

    expect(typeof result["tool.execute.after"]).toBe("function")
    expect(typeof result["experimental.chat.system.transform"]).toBe("function")
    expect(typeof result["experimental.session.compacting"]).toBe("function")
  })

  it("creates the output directory on initialization", async () => {
    await OpenPrismPlugin(makePluginInput(tempRoot))

    const outputDir = path.join(tempRoot, ".opencode", "plots")
    const stat = await fs.stat(outputDir)
    expect(stat.isDirectory()).toBe(true)
  })

  it("each tool has a description and execute function", async () => {
    const result = await OpenPrismPlugin(makePluginInput(tempRoot))

    for (const [name, tool] of Object.entries(result.tool!)) {
      expect(tool, `tool "${name}" should have description`).toHaveProperty("description")
      expect(typeof (tool as { execute: unknown }).execute, `tool "${name}" should have execute fn`).toBe("function")
    }
  })
})
