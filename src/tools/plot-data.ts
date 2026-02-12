import { tool } from "@opencode-ai/plugin"
import { renderMatplotlib, detectPythonEnvironment } from "../renderers/matplotlib-bridge.js"
import type { FileManager } from "../utils/file-manager.js"

export function createPlotDataTool(fileManager: FileManager) {
  return tool({
    description:
      "Execute a Python/Matplotlib script to generate a data visualization. The script should use matplotlib.pyplot for plotting. The non-interactive Agg backend and savefig call are injected automatically — do NOT include plt.show() or matplotlib.use() in your script. Returns the file path of the generated image.",
    args: {
      script: tool.schema
        .string()
        .describe("Python script using matplotlib.pyplot for plotting. Do NOT include plt.show() or matplotlib.use()"),
      description: tool.schema
        .string()
        .optional()
        .describe("Human-readable description of the visualization for asset tracking"),
      format: tool.schema
        .enum(["png", "svg", "pdf"])
        .optional()
        .describe("Output format. Defaults to png"),
      dpi: tool.schema
        .number()
        .optional()
        .describe("DPI for raster output. Defaults to 150"),
    },
    async execute(args, context) {
      const format = args.format ?? "png"
      const ext = `.${format}`
      const outputPath = await fileManager.outputPath(2, "plot", ext)

      try {
        const env = await detectPythonEnvironment(context.directory)

        const result = await renderMatplotlib(
          {
            script: args.script,
            format,
            dpi: args.dpi,
            pythonPath: env.pythonPath,
          },
          outputPath,
        )

        await fileManager.recordAsset(
          2,
          result.filePath,
          args.description ?? "Matplotlib visualization",
        )

        context.metadata({
          title: args.description ?? "Matplotlib visualization",
          metadata: { filePath: result.filePath },
        })

        const output = [
          `Matplotlib plot generated successfully.`,
          `File: ${result.filePath}`,
          `Format: ${result.format} | Size: ${result.size} bytes`,
          `Python: ${env.pythonPath} (${env.source})`,
        ]

        if (result.stderr.trim()) {
          output.push(`Warnings: ${result.stderr.trim()}`)
        }

        return output.join("\n")
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        return `Error generating plot: ${message}`
      }
    },
  })
}
