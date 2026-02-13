import { tool } from "@opencode-ai/plugin"
import * as fs from "node:fs/promises"
import * as path from "node:path"
import type { AIGCProvider } from "../providers/types.js"
import type { FileManager } from "../utils/file-manager.js"
import type { AIGCOperation } from "../types.js"

export function createGenerateImageTool(fileManager: FileManager, provider: AIGCProvider | null) {
  return tool({
    description:
      "Generate or edit images via built-in AIGC providers (Gemini/OpenRouter). Supports prompt-based generation, image edits, and provider-specific model controls.",
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
      model: tool.schema
        .string()
        .optional()
        .describe("Provider model identifier (for example, gemini-2.5-flash-image)"),
      aspectRatio: tool.schema
        .string()
        .optional()
        .describe("Preferred aspect ratio, such as 1:1 or 16:9"),
      resolution: tool.schema
        .string()
        .optional()
        .describe("Preferred output resolution (for example 1K, 2K, 4K)"),
      style: tool.schema
        .string()
        .optional()
        .describe("Optional style hint passed to the provider"),
    },
    async execute(args, context) {
      const operation = args.operation as AIGCOperation

      if (!provider) {
        return [
          "Error: No AIGC provider configured.",
          "Set GEMINI_API_KEY or OPENROUTER_API_KEY, or configure config.aigcProvider explicitly.",
        ].join("\n")
      }

      if ((operation === "edit" || operation === "restore") && !args.sourcePath) {
        return `Error: '${operation}' operation requires a sourcePath argument.`
      }

      try {
        const referenceImages = args.referenceImages?.length
          ? await Promise.all(args.referenceImages.map((imagePath) => loadImageBuffer(imagePath, context.directory)))
          : undefined

        const baseOptions = {
          prompt: args.prompt,
          model: args.model,
          aspectRatio: args.aspectRatio,
          resolution: args.resolution,
          style: args.style,
          referenceImages,
        }

        let result

        if (operation === "generate") {
          result = await provider.generate(baseOptions)
        } else if (operation === "continue_editing") {
          if (provider.edit) {
            const sourceImage = await resolveContinueEditingSource(
              args.sourcePath,
              args.referenceImages,
              context.directory,
            )

            if (sourceImage) {
              result = await provider.edit({
                ...baseOptions,
                sourceImage,
                instruction: args.prompt,
              })
            } else {
              result = await provider.generate(baseOptions)
            }
          } else {
            result = await provider.generate(baseOptions)
          }
        } else {
          if (!provider.edit) {
            return `Error: Provider '${provider.name}' does not support '${operation}' operations.`
          }

          const sourceImage = await loadImageBuffer(args.sourcePath!, context.directory)
          const instruction = operation === "restore" ? `Restore and enhance: ${args.prompt}` : args.prompt

          result = await provider.edit({
            ...baseOptions,
            sourceImage,
            instruction,
          })
        }

        const ext = extFromMime(result.mimeType)
        const outputPath = await fileManager.outputPath(3, "aigc", ext)
        await fs.writeFile(outputPath, result.imageData)

        const record = await fileManager.recordAsset(3, outputPath, args.prompt)

        context.metadata({
          title: args.prompt,
          metadata: { filePath: outputPath },
        })

        const model = args.model ?? provider.models[0] ?? "unknown"
        const format = ext.replace(/^\./, "")

        return [
          "AIGC image generated successfully.",
          `File: ${outputPath}`,
          `Format: ${format} | Size: ${record.size} bytes | Provider: ${provider.name} | Model: ${model}`,
        ].join("\n")
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        return `Error generating image: ${message}`
      }
    },
  })
}

async function resolveContinueEditingSource(
  sourcePath: string | undefined,
  referenceImages: string[] | undefined,
  projectDir: string,
): Promise<Buffer | undefined> {
  if (sourcePath) {
    return loadImageBuffer(sourcePath, projectDir)
  }

  const firstReference = referenceImages?.[0]
  if (!firstReference) {
    return undefined
  }

  return loadImageBuffer(firstReference, projectDir)
}

async function loadImageBuffer(imagePath: string, projectDir: string): Promise<Buffer> {
  const absolutePath = path.isAbsolute(imagePath) ? imagePath : path.resolve(projectDir, imagePath)
  return fs.readFile(absolutePath)
}

function extFromMime(mimeType: string): string {
  switch (mimeType.toLowerCase()) {
    case "image/png":
      return ".png"
    case "image/jpeg":
      return ".jpg"
    case "image/webp":
      return ".webp"
    case "image/gif":
      return ".gif"
    default:
      return ".png"
  }
}
