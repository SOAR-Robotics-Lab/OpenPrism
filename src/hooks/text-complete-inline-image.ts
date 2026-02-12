import * as fs from "node:fs/promises"
import * as path from "node:path"
import type { Hooks } from "@opencode-ai/plugin"

const SUPPORTED_IMAGE_EXTENSIONS = new Set([".png", ".jpg", ".jpeg", ".webp", ".gif", ".svg"])

const MARKDOWN_IMAGE_REGEX = /!\[([^\]]*)\]\(([^)\s]+)\)/g

const MIME_BY_EXT: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".svg": "image/svg+xml",
}

type TextCompleteOptions = {
  consumeLatestImagePath?: (sessionID: string) => string | undefined
}

export function createInlineImageTextCompleteHook(
  projectDir: string,
  outputDir: string,
  options?: TextCompleteOptions,
): NonNullable<Hooks["experimental.text.complete"]> {
  const normalizedOutputDir = normalizeOutputDir(outputDir)
  const resolvedProjectDir = path.resolve(projectDir)
  const allowedRoot = path.resolve(projectDir, outputDir)

  return async (input, output) => {
    const textWithFallback = maybeAppendFallbackImageMarkdown(
      output.text,
      options?.consumeLatestImagePath?.(input.sessionID),
      resolvedProjectDir,
    )

    output.text = await inlineLocalImageMarkdown(
      textWithFallback,
      allowedRoot,
      resolvedProjectDir,
      normalizedOutputDir,
    )
  }
}

export async function inlineLocalImageMarkdown(
  text: string,
  allowedRoot: string,
  projectDir?: string,
  normalizedOutputDir?: string,
): Promise<string> {
  if (!text.includes("![")) {
    return text
  }

  const matches = Array.from(text.matchAll(MARKDOWN_IMAGE_REGEX))
  if (matches.length === 0) {
    return text
  }

  let transformed = text

  for (const match of matches) {
    const fullMatch = match[0]
    const alt = match[1] ?? ""
    const source = match[2]
    if (!source) {
      continue
    }

    if (source.startsWith("data:") || source.startsWith("http://") || source.startsWith("https://")) {
      continue
    }

    const resolvedPath = resolveSourcePath(source, projectDir, normalizedOutputDir)
    if (!resolvedPath) {
      continue
    }

    if (!isUnderAllowedRoot(resolvedPath, allowedRoot)) {
      continue
    }

    const ext = path.extname(resolvedPath).toLowerCase()
    if (!SUPPORTED_IMAGE_EXTENSIONS.has(ext)) {
      continue
    }

    const dataUri = await fileToDataUri(resolvedPath)
    if (!dataUri) {
      continue
    }

    transformed = transformed.replace(fullMatch, `![${alt}](${dataUri})`)
  }

  return transformed
}

async function fileToDataUri(filePath: string): Promise<string | undefined> {
  const ext = path.extname(filePath).toLowerCase()
  const mime = MIME_BY_EXT[ext]
  if (!mime) {
    return
  }

  try {
    const data = await fs.readFile(filePath)
    const base64 = data.toString("base64")
    return `data:${mime};base64,${base64}`
  } catch {
    return
  }
}

function normalizePathToken(source: string): string {
  const unwrapped = source.startsWith("<") && source.endsWith(">") ? source.slice(1, -1) : source
  try {
    return decodeURI(unwrapped)
  } catch {
    return unwrapped
  }
}

function maybeAppendFallbackImageMarkdown(
  text: string,
  filePath: string | undefined,
  projectDir: string,
): string {
  if (!filePath || text.includes("![")) {
    return text
  }

  const normalizedPath = path.resolve(filePath)
  let markdownPath = normalizedPath

  if (normalizedPath.startsWith(`${projectDir}${path.sep}`)) {
    markdownPath = normalizedPath.slice(projectDir.length + 1).replaceAll("\\", "/")
  }

  const suffix = `\n\n![OpenPrism image](${markdownPath})`
  return `${text}${suffix}`
}

function resolveSourcePath(
  source: string,
  projectDir?: string,
  normalizedOutputDir?: string,
): string | undefined {
  const token = normalizePathToken(source)

  if (projectDir && normalizedOutputDir) {
    const webPrefix = `/${normalizedOutputDir}`
    const relativePrefix = normalizedOutputDir
    const dotRelativePrefix = `./${normalizedOutputDir}`
    if (token === webPrefix || token.startsWith(`${webPrefix}/`)) {
      return path.resolve(projectDir, token.slice(1))
    }
    if (token === relativePrefix || token.startsWith(`${relativePrefix}/`)) {
      return path.resolve(projectDir, token)
    }
    if (token === dotRelativePrefix || token.startsWith(`${dotRelativePrefix}/`)) {
      return path.resolve(projectDir, token.slice(2))
    }
  }

  if (path.isAbsolute(token)) {
    return path.resolve(token)
  }

  return
}

function normalizeOutputDir(outputDir: string): string {
  return outputDir.replaceAll("\\", "/").replace(/^\.\//, "").replace(/^\//, "").replace(/\/$/, "")
}

function isUnderAllowedRoot(filePath: string, allowedRoot: string): boolean {
  return filePath === allowedRoot || filePath.startsWith(`${allowedRoot}${path.sep}`)
}
