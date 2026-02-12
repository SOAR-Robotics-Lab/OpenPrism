import type { Hooks } from "@opencode-ai/plugin"
import { extractMermaidBlocks, renderMermaid, validateMermaidSyntax } from "../renderers/mermaid-ssr.js"
import type { FileManager } from "../utils/file-manager.js"

export function createMermaidAfterHook(
  fileManager: FileManager,
): NonNullable<Hooks["tool.execute.after"]> {
  return async (_input, output) => {
    const blocks = extractMermaidBlocks(output.output)
    if (blocks.length === 0) return

    const renderResults: string[] = []

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
  }
}
