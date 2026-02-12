import { randomUUID } from "node:crypto"
import * as fs from "node:fs/promises"
import { tool } from "@opencode-ai/plugin"
import type { FileManager } from "../utils/file-manager.js"
import type { MediaServer } from "../utils/media-server.js"

type PlotlySpec = {
  data?: unknown
  layout?: unknown
  config?: unknown
}

export function createPlotInteractiveTool(fileManager: FileManager, mediaServer: MediaServer) {
  return tool({
    description:
      "Create an interactive Plotly.js chart from a JSON spec and return a local viewer URL.",
    args: {
      spec: tool.schema
        .string()
        .describe("Plotly JSON spec as a string. Must include a data array or pair with data argument."),
      description: tool.schema
        .string()
        .optional()
        .describe("Human-readable description of the interactive chart"),
      data: tool.schema
        .string()
        .optional()
        .describe("Optional Plotly trace array as JSON string, used when spec.data is missing or empty"),
    },
    async execute(args) {
      let parsedSpec: PlotlySpec

      try {
        parsedSpec = parseJsonObject(args.spec, "spec")
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        return `Error: ${message}`
      }

      if ((!Array.isArray(parsedSpec.data) || parsedSpec.data.length === 0) && args.data) {
        try {
          const parsedData = parseJson(args.data, "data")
          if (!Array.isArray(parsedData)) {
            return "Error: data must be a JSON array of Plotly traces"
          }
          parsedSpec.data = parsedData
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err)
          return `Error: ${message}`
        }
      }

      if (!Array.isArray(parsedSpec.data)) {
        return "Error: spec must contain a data array"
      }

      const outputPath = await fileManager.outputPath(2, "plotly", ".json")
      await fs.writeFile(outputPath, JSON.stringify(parsedSpec, null, 2), "utf-8")

      const description = args.description ?? "Interactive Plotly chart"
      await fileManager.recordAsset(2, outputPath, description)

      const id = randomUUID()
      mediaServer.registerMedia({
        id,
        kind: "plotly",
        filePath: outputPath,
        mimeType: "application/json",
        description,
        media: { plotlySpec: parsedSpec },
      })

      await mediaServer.ensureStarted()

      return [
        "Interactive Plotly chart created.",
        `File: ${outputPath}`,
        `ViewerURL: ${mediaServer.viewUrl(id)}`,
        `Traces: ${parsedSpec.data.length}`,
      ].join("\n")
    },
  })
}

function parseJson(input: string, label: string): unknown {
  try {
    return JSON.parse(input)
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    throw new Error(`Invalid ${label} JSON: ${message}`)
  }
}

function parseJsonObject(input: string, label: string): PlotlySpec {
  const parsed = parseJson(input, label)
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error(`${label} must be a JSON object`)
  }
  return parsed
}
