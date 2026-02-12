import { tool } from "@opencode-ai/plugin"
import { renderMermaid, validateMermaidSyntax, FORMAT_EXT } from "../renderers/mermaid-ssr.js"
import type { FileManager } from "../utils/file-manager.js"
import type { MermaidOutputFormat } from "../types.js"

export function createRenderMermaidTool(fileManager: FileManager) {
  return tool({
    description:
      "Render a Mermaid diagram to an image file. Supports flowchart, sequenceDiagram, classDiagram, stateDiagram, erDiagram, gantt, pie, mindmap, timeline, and more. Returns the file path of the generated image.",
    args: {
      source: tool.schema.string().describe("Mermaid diagram source code"),
      format: tool.schema
        .enum(["svg", "png", "pdf"])
        .optional()
        .describe("Output format. Defaults to svg"),
      theme: tool.schema
        .enum(["default", "dark", "forest", "neutral"])
        .optional()
        .describe("Mermaid theme. Defaults to default"),
      description: tool.schema
        .string()
        .optional()
        .describe("Human-readable description of the diagram for asset tracking"),
    },
    async execute(args, context) {
      const validation = validateMermaidSyntax(args.source)
      if (!validation.valid) {
        return `Error: Invalid Mermaid syntax — ${validation.error}`
      }

      const format = (args.format ?? "svg") as MermaidOutputFormat
      const ext = FORMAT_EXT[format]
      const outputPath = await fileManager.outputPath(1, "mermaid", ext)

      try {
        const result = await renderMermaid(
          {
            source: args.source,
            format,
            theme: args.theme as MermaidRenderOptions["theme"],
          },
          outputPath,
        )

        await fileManager.recordAsset(
          1,
          result.filePath,
          args.description ?? "Mermaid diagram",
        )

        context.metadata({
          title: args.description ?? "Mermaid diagram",
          metadata: { filePath: result.filePath },
        })

        return [
          `Mermaid diagram rendered successfully.`,
          `File: ${result.filePath}`,
          `Format: ${result.format}`,
          `Size: ${result.size} bytes`,
        ].join("\n")
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        return `Error rendering Mermaid diagram: ${message}`
      }
    },
  })
}

type MermaidRenderOptions = import("../types.js").MermaidRenderOptions
