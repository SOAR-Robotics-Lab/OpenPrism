import * as fs from "node:fs/promises"
import * as os from "node:os"
import * as path from "node:path"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { FileManager } from "../src/utils/file-manager.ts"
import { MediaServer } from "../src/utils/media-server.ts"
import { createPlotInteractiveTool } from "../src/tools/plot-interactive.ts"

type ToolExecute = ReturnType<typeof createPlotInteractiveTool>["execute"]
type ToolContext = Parameters<ToolExecute>[1]

function stubContext(): ToolContext {
  return {
    sessionID: "test-session",
    messageID: "test-message",
    agent: "test-agent",
    directory: os.tmpdir(),
    worktree: os.tmpdir(),
    abort: new AbortController().signal,
    metadata: () => {},
    ask: async () => {},
  }
}

describe("createPlotInteractiveTool", () => {
  let tempRoot: string
  let fileManager: FileManager
  let mediaServer: MediaServer
  const ctx = stubContext()

  beforeEach(async () => {
    tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "openprism-plot-interactive-"))
    fileManager = new FileManager(tempRoot)
    await fileManager.ensureDir()
    const allowedRoot = path.resolve(tempRoot, ".opencode/plots")
    mediaServer = new MediaServer(allowedRoot)
  })

  afterEach(async () => {
    await fs.rm(tempRoot, { recursive: true, force: true })
  })

  function getTool() {
    return createPlotInteractiveTool(fileManager, mediaServer)
  }

  it("creates a chart and returns a viewer URL", async () => {
    const tool = getTool()
    const spec = JSON.stringify({
      data: [{ x: [1, 2, 3], y: [4, 5, 6], type: "scatter" }],
      layout: { title: "Test" },
    })

    const result = await tool.execute({ spec }, ctx)
    expect(result).toContain("Interactive Plotly chart created.")
    expect(result).toContain("ViewerURL:")
    expect(result).toContain("http://127.0.0.1:")
    expect(result).toContain("Traces: 1")
  })

  it("writes the JSON spec file to the output directory", async () => {
    const tool = getTool()
    const spec = JSON.stringify({
      data: [{ x: [1], y: [2], type: "bar" }],
    })

    const result = await tool.execute({ spec, description: "Bar chart" }, ctx)
    const fileMatch = result.match(/File:\s*(.+)/)
    expect(fileMatch).not.toBeNull()

    const filePath = fileMatch![1]!.trim()
    const stat = await fs.stat(filePath)
    expect(stat.isFile()).toBe(true)

    const content = JSON.parse(await fs.readFile(filePath, "utf-8"))
    expect(content.data[0].type).toBe("bar")
  })

  it("records the asset in the file manager", async () => {
    const tool = getTool()
    const spec = JSON.stringify({
      data: [{ x: [1], y: [2], type: "scatter" }],
    })

    await tool.execute({ spec, description: "My scatter" }, ctx)
    const assets = await fileManager.getAssets()
    expect(assets).toHaveLength(1)
    expect(assets[0]!.tier).toBe(2)
    expect(assets[0]!.description).toBe("My scatter")
  })

  it("registers the chart with the media server", async () => {
    const tool = getTool()
    const spec = JSON.stringify({
      data: [{ x: [1], y: [2], type: "scatter" }],
    })

    const result = await tool.execute({ spec }, ctx)
    const urlMatch = result.match(/ViewerURL:\s*(http:\/\/[^\s]+)/)
    expect(urlMatch).not.toBeNull()

    const url = new URL(urlMatch![1]!)
    const mediaId = decodeURIComponent(url.pathname.split("/view/")[1]!)
    const item = mediaServer.lookupMedia(mediaId)
    expect(item).toBeDefined()
    expect(item!.kind).toBe("plotly")
    expect(item!.media?.plotlySpec).toBeDefined()
  })

  it("uses the data argument when spec.data is missing", async () => {
    const tool = getTool()
    const spec = JSON.stringify({ layout: { title: "From data arg" } })
    const data = JSON.stringify([{ x: [1, 2], y: [3, 4], type: "bar" }])

    const result = await tool.execute({ spec, data }, ctx)
    expect(result).toContain("Interactive Plotly chart created.")
    expect(result).toContain("Traces: 1")
  })

  it("uses the data argument when spec.data is empty array", async () => {
    const tool = getTool()
    const spec = JSON.stringify({ data: [], layout: {} })
    const data = JSON.stringify([{ x: [10], y: [20], type: "scatter" }])

    const result = await tool.execute({ spec, data }, ctx)
    expect(result).toContain("Traces: 1")
  })

  it("returns error for invalid spec JSON", async () => {
    const tool = getTool()
    const result = await tool.execute({ spec: "not json{" }, ctx)
    expect(result).toContain("Error:")
    expect(result).toContain("Invalid")
  })

  it("returns error when spec is a JSON array instead of object", async () => {
    const tool = getTool()
    const result = await tool.execute({ spec: "[1,2,3]" }, ctx)
    expect(result).toContain("Error:")
    expect(result).toContain("must be a JSON object")
  })

  it("returns error when spec has no data and no data argument", async () => {
    const tool = getTool()
    const result = await tool.execute({ spec: '{"layout":{}}' }, ctx)
    expect(result).toContain("Error:")
    expect(result).toContain("must contain a data array")
  })

  it("returns error when data argument is not a JSON array", async () => {
    const tool = getTool()
    const result = await tool.execute({
      spec: '{"layout":{}}',
      data: '{"not": "array"}',
    }, ctx)
    expect(result).toContain("Error:")
    expect(result).toContain("must be a JSON array")
  })

  it("returns error for invalid data argument JSON", async () => {
    const tool = getTool()
    const result = await tool.execute({
      spec: '{"layout":{}}',
      data: "broken json[",
    }, ctx)
    expect(result).toContain("Error:")
    expect(result).toContain("Invalid")
  })

  it("uses default description when none is provided", async () => {
    const tool = getTool()
    const spec = JSON.stringify({
      data: [{ x: [1], y: [2], type: "scatter" }],
    })

    await tool.execute({ spec }, ctx)
    const assets = await fileManager.getAssets()
    expect(assets[0]!.description).toBe("Interactive Plotly chart")
  })

  it("handles multi-trace specs", async () => {
    const tool = getTool()
    const spec = JSON.stringify({
      data: [
        { x: [1, 2], y: [3, 4], type: "scatter", name: "Series A" },
        { x: [1, 2], y: [5, 6], type: "bar", name: "Series B" },
        { x: [1, 2], y: [7, 8], type: "scatter", name: "Series C" },
      ],
    })

    const result = await tool.execute({ spec }, ctx)
    expect(result).toContain("Traces: 3")
  })
})
