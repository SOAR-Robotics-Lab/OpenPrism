import { randomUUID } from "node:crypto"
import * as fs from "node:fs/promises"
import * as path from "node:path"
import type { Hooks } from "@opencode-ai/plugin"
import type { MediaServer } from "../utils/media-server.js"

const SUPPORTED_IMAGE_EXTENSIONS = new Set([".png", ".jpg", ".jpeg", ".webp", ".gif", ".svg"])

const MARKDOWN_IMAGE_REGEX = /!\[([^\]]*)\]\(([^)\s]+)\)/g

const VIEWER_URL_REGEX = /ViewerURL:\s*(http:\/\/127\.0\.0\.1:\d+\/view\/[^\s]+)/g

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
  mediaServer?: MediaServer
}

export function createInlineImageTextCompleteHook(
  projectDir: string,
  _outputDir: string,
  options?: TextCompleteOptions,
): NonNullable<Hooks["experimental.text.complete"]> {
  const resolvedProjectDir = path.resolve(projectDir)

  return async (input, output) => {
    const textWithFallback = maybeAppendFallbackImageMarkdown(
      output.text,
      options?.consumeLatestImagePath?.(input.sessionID),
      resolvedProjectDir,
    )

    output.text = await inlineLocalImageMarkdown(
      textWithFallback,
      resolvedProjectDir,
      options?.mediaServer,
      resolvedProjectDir,
    )
  }
}

export async function inlineLocalImageMarkdown(
  text: string,
  allowedRoot: string,
  mediaServer?: MediaServer,
  projectDir?: string,
): Promise<string> {
  let transformed = text

  transformed = replaceViewerUrls(transformed)

  if (!transformed.includes("![")) {
    return transformed
  }

  const matches = Array.from(transformed.matchAll(MARKDOWN_IMAGE_REGEX))
  if (matches.length === 0) {
    return transformed
  }

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

    const candidates = resolveSourcePaths(source, projectDir)
    if (candidates.length === 0) {
      continue
    }

    let resolvedPath: string | undefined
    for (const candidate of candidates) {
      if (!isUnderAllowedRoot(candidate, allowedRoot)) {
        continue
      }
      const ext = path.extname(candidate).toLowerCase()
      if (!SUPPORTED_IMAGE_EXTENSIONS.has(ext)) {
        continue
      }
      const exists = await fileExists(candidate)
      if (exists) {
        resolvedPath = candidate
        break
      }
    }

    if (!resolvedPath) {
      continue
    }

    const ext = path.extname(resolvedPath).toLowerCase()
    const mime = MIME_BY_EXT[ext] ?? "image/png"
    const viewerUrl = await registerImageWithServer(mediaServer, resolvedPath, alt, mime)
    const label = alt || "View image"
    const replacement = viewerUrl
      ? `[🖼 ${label}](${viewerUrl})`
      : `[🖼 ${label}](${source})`
    transformed = transformed.replace(fullMatch, replacement)
  }

  return transformed
}

function replaceViewerUrls(text: string): string {
  return text.replace(VIEWER_URL_REGEX, (_fullMatch, url: string) => {
    return `[📊 Open Interactive Chart](${url})`
  })
}

async function registerImageWithServer(
  mediaServer: MediaServer | undefined,
  filePath: string,
  description: string,
  mimeType: string,
): Promise<string | undefined> {
  if (!mediaServer) {
    return undefined
  }

  try {
    await mediaServer.ensureStarted()
    const id = randomUUID()
    mediaServer.registerMedia({ id, kind: "image", filePath, mimeType, description })
    return mediaServer.viewUrl(id)
  } catch {
    return undefined
  }
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath)
    return true
  } catch {
    return false
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

function resolveSourcePaths(
  source: string,
  projectDir?: string,
): string[] {
  const token = normalizePathToken(source)
  const candidates: string[] = []

  if (projectDir) {
    const stripped = token.startsWith("./") ? token.slice(2) : token.startsWith("/") ? token.slice(1) : token
    if (stripped) {
      candidates.push(path.resolve(projectDir, stripped))
    }
  }

  if (path.isAbsolute(token)) {
    candidates.push(path.resolve(token))
  }

  return candidates
}

function isUnderAllowedRoot(filePath: string, allowedRoot: string): boolean {
  return filePath === allowedRoot || filePath.startsWith(`${allowedRoot}${path.sep}`)
}
