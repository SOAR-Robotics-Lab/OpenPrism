import * as fs from "node:fs/promises"
import { createReadStream } from "node:fs"
import * as http from "node:http"
import * as path from "node:path"
import { imageViewerHtml, plotlyViewerHtml, videoViewerHtml } from "./viewer-templates.js"
import type { MediaKind, MediaMetadata } from "../types.js"

interface MediaItem {
  id: string
  kind: MediaKind
  filePath: string
  mimeType: string
  description: string
  media?: MediaMetadata
}

export class MediaServer {
  private readonly allowedRoot: string
  private readonly media = new Map<string, MediaItem>()
  private server?: http.Server
  private port?: number
  private starting?: Promise<void>

  constructor(allowedRoot: string) {
    this.allowedRoot = path.resolve(allowedRoot)
  }

  async ensureStarted(): Promise<void> {
    if (this.server && this.port) {
      return
    }

    if (this.starting) {
      await this.starting
      return
    }

    this.starting = new Promise((resolve, reject) => {
      const server = http.createServer((req, res) => {
        void this.handleRequest(req, res)
      })

      server.once("error", reject)
      server.listen(0, "127.0.0.1", () => {
        const address = server.address()
        if (!address || typeof address === "string") {
          reject(new Error("Unable to determine media server address"))
          return
        }

        this.server = server
        this.port = address.port
        server.unref()
        process.once("exit", () => {
          server.close()
        })
        resolve()
      })
    })

    try {
      await this.starting
    } finally {
      this.starting = undefined
    }
  }

  getBaseUrl(): string {
    if (!this.port) {
      throw new Error("Media server has not started")
    }
    return `http://127.0.0.1:${this.port}`
  }

  viewUrl(mediaId: string): string {
    return `${this.getBaseUrl()}/view/${encodeURIComponent(mediaId)}`
  }

  mediaUrl(mediaId: string): string {
    return `${this.getBaseUrl()}/api/media/${encodeURIComponent(mediaId)}`
  }

  registerMedia(item: {
    id: string
    kind: MediaKind
    filePath: string
    mimeType: string
    description: string
    media?: MediaMetadata
  }): void {
    this.media.set(item.id, { ...item })
  }

  lookupMedia(id: string): MediaItem | undefined {
    return this.media.get(id)
  }

  private applyBaseHeaders(res: http.ServerResponse): void {
    res.setHeader("Cache-Control", "no-store")
    res.setHeader("X-Content-Type-Options", "nosniff")
  }

  private sendStatus(res: http.ServerResponse, status: number, message: string): void {
    this.applyBaseHeaders(res)
    res.statusCode = status
    res.setHeader("Content-Type", "text/plain; charset=utf-8")
    res.end(message)
  }

  private sendHtml(res: http.ServerResponse, html: string): void {
    this.applyBaseHeaders(res)
    res.statusCode = 200
    res.setHeader("Content-Type", "text/html; charset=utf-8")
    res.end(html)
  }

  private async handleRequest(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    if (req.method !== "GET") {
      this.sendStatus(res, 405, "Method Not Allowed")
      return
    }

    const requestUrl = new URL(req.url ?? "/", "http://127.0.0.1")
    const pathname = requestUrl.pathname

    if (pathname.startsWith("/view/")) {
      const mediaId = this.decodePathSegment(pathname.slice("/view/".length))
      if (!mediaId) {
        this.sendStatus(res, 400, "Invalid media id")
        return
      }

      const item = this.media.get(mediaId)
      if (!item) {
        this.sendStatus(res, 404, "Media item not found")
        return
      }

      this.handleViewRequest(res, item)
      return
    }

    if (pathname.startsWith("/api/media/")) {
      const mediaId = this.decodePathSegment(pathname.slice("/api/media/".length))
      if (!mediaId) {
        this.sendStatus(res, 400, "Invalid media id")
        return
      }

      const item = this.media.get(mediaId)
      if (!item) {
        this.sendStatus(res, 404, "Media item not found")
        return
      }

      await this.handleApiMediaRequest(res, item)
      return
    }

    this.sendStatus(res, 404, "Not Found")
  }

  private handleViewRequest(res: http.ServerResponse, item: MediaItem): void {
    const title = item.description || item.id
    const mediaUrl = `/api/media/${encodeURIComponent(item.id)}`

    if (item.kind === "image") {
      this.sendHtml(res, imageViewerHtml({ title, mediaUrl }))
      return
    }

    if (item.kind === "video") {
      this.sendHtml(res, videoViewerHtml({ title, mediaUrl, mimeType: item.mimeType }))
      return
    }

    if (item.kind === "plotly") {
      this.sendHtml(res, plotlyViewerHtml({ title, mediaUrl }))
      return
    }

    this.sendStatus(res, 400, `Unsupported media kind: ${item.kind}`)
  }

  private async handleApiMediaRequest(res: http.ServerResponse, item: MediaItem): Promise<void> {
    if (item.kind === "plotly") {
      if (item.media?.plotlySpec === undefined) {
        this.sendStatus(res, 500, "Plotly metadata is missing")
        return
      }
      this.applyBaseHeaders(res)
      res.statusCode = 200
      res.setHeader("Content-Type", "application/json; charset=utf-8")
      res.end(JSON.stringify(item.media.plotlySpec))
      return
    }

    try {
      const resolved = path.resolve(item.filePath)
      const realPath = await fs.realpath(resolved)
      if (!this.isPathAllowed(realPath)) {
        this.sendStatus(res, 403, "Access denied")
        return
      }

      this.applyBaseHeaders(res)
      res.statusCode = 200
      res.setHeader("Content-Type", item.mimeType)

      await new Promise<void>((resolve, reject) => {
        const stream = createReadStream(realPath)
        stream.once("error", reject)
        stream.once("end", resolve)
        stream.pipe(res)
      })
    } catch {
      this.sendStatus(res, 404, "Media file not found")
    }
  }

  private isPathAllowed(targetPath: string): boolean {
    const rel = path.relative(this.allowedRoot, targetPath)
    return !rel.startsWith("..") && !path.isAbsolute(rel)
  }

  private decodePathSegment(value: string): string | undefined {
    if (!value || value.includes("/")) {
      return undefined
    }

    try {
      const decoded = decodeURIComponent(value)
      if (!decoded || decoded.includes("/")) {
        return undefined
      }
      return decoded
    } catch {
      return undefined
    }
  }
}
