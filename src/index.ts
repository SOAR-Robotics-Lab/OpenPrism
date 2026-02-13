import * as path from "node:path"
import type { Plugin, ToolDefinition } from "@opencode-ai/plugin"
import { FileManager } from "./utils/file-manager.js"
import { MediaServer } from "./utils/media-server.js"
import { DEFAULT_CONFIG } from "./types.js"
import type { OpenPrismConfig } from "./types.js"

import { createRenderMermaidTool } from "./tools/render-mermaid.js"
import { createAnalyzeStructureTool } from "./tools/analyze-structure.js"
import { createPlotDataTool } from "./tools/plot-data.js"
import { createPlotInteractiveTool } from "./tools/plot-interactive.js"
import { createGenerateImageTool } from "./tools/generate-image.js"
import { createProvider } from "./providers/index.js"

import { createMermaidAfterHook } from "./hooks/mermaid-renderer.js"
import { createSystemPromptHook } from "./hooks/system-prompt.js"
import { createSessionCompactionHook } from "./hooks/session-compaction.js"
import { createInlineImageTextCompleteHook } from "./hooks/text-complete-inline-image.js"
import { createStripImagesTransformHook } from "./hooks/strip-images-transform.js"

export const OpenPrismPlugin: Plugin = async (ctx) => {
  const config: OpenPrismConfig = { ...DEFAULT_CONFIG }
  const fileManager = new FileManager(ctx.directory, config)
  const latestImageBySession = new Map<string, string>()
  const projectRoot = path.resolve(ctx.directory)
  const mediaServer = new MediaServer(projectRoot)
  const aigcProvider = createProvider(config.aigcProvider)

  await fileManager.ensureDir()

  const tools: Record<string, ToolDefinition> = {}

  if (config.mermaidEnabled) {
    tools["render_mermaid"] = createRenderMermaidTool(fileManager)
    tools["analyze_structure"] = createAnalyzeStructureTool()
  }

  if (config.matplotlibEnabled) {
    tools["plot_data"] = createPlotDataTool(fileManager)
  }

  if (config.plotlyEnabled) {
    tools["plot_interactive"] = createPlotInteractiveTool(fileManager, mediaServer)
  }

  if (config.aigcEnabled) {
    tools["generate_image"] = createGenerateImageTool(fileManager, aigcProvider)
  }

  return {
    tool: tools,
    "tool.execute.after": createMermaidAfterHook(fileManager, (sessionID, filePath) => {
      latestImageBySession.set(sessionID, filePath)
    }),
    "experimental.chat.system.transform": createSystemPromptHook(config),
    "experimental.session.compacting": createSessionCompactionHook(fileManager),
    "experimental.text.complete": createInlineImageTextCompleteHook(ctx.directory, config.outputDir, {
      consumeLatestImagePath: (sessionID) => {
        const filePath = latestImageBySession.get(sessionID)
        latestImageBySession.delete(sessionID)
        return filePath
      },
      mediaServer,
    }),
    "experimental.chat.messages.transform": createStripImagesTransformHook(),
  }
}

export type { OpenPrismConfig, DrawingTier } from "./types.js"
export { DEFAULT_CONFIG } from "./types.js"
export { FileManager } from "./utils/file-manager.js"
