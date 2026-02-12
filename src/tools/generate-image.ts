import { tool } from "@opencode-ai/plugin"
import type { FileManager } from "../utils/file-manager.js"
import type { AIGCOperation } from "../types.js"

export function createGenerateImageTool(fileManager: FileManager) {
  return tool({
    description:
      "Generate or edit images using AIGC capabilities via configured MCP servers (e.g., Nano Banana / Gemini). This tool serves as the Tier 3 drawing command for creative image generation, UI mockups, icon creation, and image editing. Note: An AIGC MCP server must be configured in opencode.json for this tool to function.",
    args: {
      operation: tool.schema
        .enum(["generate", "edit", "continue_editing", "restore"])
        .describe("The AIGC operation to perform"),
      prompt: tool.schema
        .string()
        .describe("Text prompt describing the desired image or modifications"),
      sourcePath: tool.schema
        .string()
        .optional()
        .describe("Path to source image (required for edit/restore operations)"),
      referenceImages: tool.schema
        .array(tool.schema.string())
        .optional()
        .describe("Paths to reference images for style guidance"),
    },
    async execute(args, context) {
      const operation = args.operation as AIGCOperation

      if ((operation === "edit" || operation === "restore") && !args.sourcePath) {
        return `Error: '${operation}' operation requires a sourcePath argument.`
      }

      const guidance = buildMCPGuidance(operation, args.prompt, args.sourcePath, args.referenceImages)

      await fileManager.recordAsset(3, context.directory, args.prompt)

      return [
        `AIGC ${operation} request prepared.`,
        "",
        "To execute this request, ensure an AIGC MCP server is configured in opencode.json:",
        "",
        "```json",
        JSON.stringify(
          {
            mcp: {
              "nano-banana": {
                type: "local",
                command: ["npx", "-y", "nano-banana-mcp"],
                enabled: true,
                environment: { GEMINI_API_KEY: "{env:GEMINI_API_KEY}" },
              },
            },
          },
          null,
          2,
        ),
        "```",
        "",
        "Then use the corresponding MCP tool directly:",
        guidance,
      ].join("\n")
    },
  })
}

function buildMCPGuidance(
  operation: AIGCOperation,
  prompt: string,
  sourcePath?: string,
  referenceImages?: string[],
): string {
  switch (operation) {
    case "generate":
      return `Call MCP tool "generate_image" with prompt: "${prompt}"`
    case "edit":
      return [
        `Call MCP tool "edit_image" with:`,
        `  imagePath: "${sourcePath}"`,
        `  prompt: "${prompt}"`,
        referenceImages?.length
          ? `  referenceImages: ${JSON.stringify(referenceImages)}`
          : "",
      ]
        .filter(Boolean)
        .join("\n")
    case "continue_editing":
      return [
        `Call MCP tool "continue_editing" with:`,
        `  prompt: "${prompt}"`,
        referenceImages?.length
          ? `  referenceImages: ${JSON.stringify(referenceImages)}`
          : "",
      ]
        .filter(Boolean)
        .join("\n")
    case "restore":
      return [
        `Call MCP tool "edit_image" with restoration prompt:`,
        `  imagePath: "${sourcePath}"`,
        `  prompt: "Restore and enhance: ${prompt}"`,
      ].join("\n")
  }
}
