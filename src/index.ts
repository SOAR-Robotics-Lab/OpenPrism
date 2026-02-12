import type { Plugin, ToolDefinition } from "@opencode-ai/plugin"
import { FileManager } from "./utils/file-manager.js"
import { DEFAULT_CONFIG } from "./types.js"
import type { OpenPrismConfig } from "./types.js"

import { createRenderMermaidTool } from "./tools/render-mermaid.js"
import { createAnalyzeStructureTool } from "./tools/analyze-structure.js"
import { createPlotDataTool } from "./tools/plot-data.js"
import { createGenerateImageTool } from "./tools/generate-image.js"

import { createMermaidAfterHook } from "./hooks/mermaid-renderer.js"
import { createSystemPromptHook } from "./hooks/system-prompt.js"
import { createSessionCompactionHook } from "./hooks/session-compaction.js"

export const OpenPrismPlugin: Plugin = async (ctx) => {
  const config: OpenPrismConfig = { ...DEFAULT_CONFIG }
  const fileManager = new FileManager(ctx.directory, config)

  await fileManager.ensureDir()

  const tools: Record<string, ToolDefinition> = {}

  if (config.mermaidEnabled) {
    tools["render_mermaid"] = createRenderMermaidTool(fileManager)
    tools["analyze_structure"] = createAnalyzeStructureTool()
  }

  if (config.matplotlibEnabled) {
    tools["plot_data"] = createPlotDataTool(fileManager)
  }

  if (config.aigcEnabled) {
    tools["generate_image"] = createGenerateImageTool(fileManager)
  }

  return {
    tool: tools,
    "tool.execute.after": createMermaidAfterHook(fileManager),
    "experimental.chat.system.transform": createSystemPromptHook(config),
    "experimental.session.compacting": createSessionCompactionHook(fileManager),
  }
}

export type { OpenPrismConfig, DrawingTier } from "./types.js"
export { DEFAULT_CONFIG } from "./types.js"
export { FileManager } from "./utils/file-manager.js"
