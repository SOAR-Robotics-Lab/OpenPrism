import type { Hooks } from "@opencode-ai/plugin"
import { extractMermaidBlocks, renderMermaid, validateMermaidSyntax } from "../renderers/mermaid-ssr.js"
import type { FileManager } from "../utils/file-manager.js"

export function createMermaidAfterHook(
  fileManager: FileManager,
  onImageProduced?: (sessionID: string, filePath: string) => void,
): NonNullable<Hooks["tool.execute.after"]> {
  return async (input, output) => {
    if (input.tool === "plot_data" || input.tool === "render_mermaid" || input.tool === "generate_image") {
      const toolFilePath = extractToolFilePath(output.output)
      if (toolFilePath) {
        output.metadata = {
          ...(output.metadata as Record<string, unknown> | undefined),
          filePath: toolFilePath,
          filepath: toolFilePath,
        }
        onImageProduced?.(input.sessionID, toolFilePath)
      }
    }

    const blocks = extractMermaidBlocks(output.output)
    if (blocks.length === 0) return

    const renderResults: string[] = []
    let lastRenderedPath: string | undefined

    for (const block of blocks) {
      const validation = validateMermaidSyntax(block)
      if (!validation.valid) {
        renderResults.push(`[OpenPrism] Skipped invalid Mermaid block: ${validation.error}`)
        continue
      }

      try {
        const outputPath = await fileManager.outputPath(1, "auto-mermaid", ".svg")
        const result = await renderMermaid({ source: block }, outputPath)

        await fileManager.recordAsset(
          1,
          result.filePath,
          `Auto-rendered Mermaid diagram (${block.split("\n")[0]?.trim().slice(0, 40)})`,
        )

        lastRenderedPath = result.filePath
        renderResults.push(
          `[OpenPrism] Rendered Mermaid diagram → ${result.filePath} (${result.size} bytes)`,
        )
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        renderResults.push(`[OpenPrism] Failed to render Mermaid block: ${message}`)
      }
    }

    if (renderResults.length > 0) {
      output.output += "\n\n" + renderResults.join("\n")
    }

    if (lastRenderedPath) {
      output.metadata = {
        ...(output.metadata as Record<string, unknown> | undefined),
        filePath: lastRenderedPath,
        filepath: lastRenderedPath,
      }
      onImageProduced?.(input.sessionID, lastRenderedPath)
    }
  }
}

function extractToolFilePath(output: string): string | undefined {
  const match = output.match(/^File:\s*(.+)$/m)
  if (!match?.[1]) {
    return
  }
  return match[1].trim()
}
