import * as fs from "node:fs/promises"
import * as http from "node:http"
import * as os from "node:os"
import * as path from "node:path"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { MediaServer } from "../src/utils/media-server.ts"

function httpGet(url: string): Promise<{ status: number; headers: http.IncomingHttpHeaders; body: string }> {
  return new Promise((resolve, reject) => {
    http.get(url, (res) => {
      const chunks: Buffer[] = []
      res.on("data", (chunk: Buffer) => chunks.push(chunk))
      res.on("end", () => {
        resolve({
          status: res.statusCode ?? 0,
          headers: res.headers,
          body: Buffer.concat(chunks).toString("utf-8"),
        })
      })
    }).on("error", reject)
  })
}

describe("MediaServer", () => {
  let tempRoot: string
  let server: MediaServer

  beforeEach(async () => {
    tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "openprism-media-server-"))
    server = new MediaServer(tempRoot)
  })

  afterEach(async () => {
    await fs.rm(tempRoot, { recursive: true, force: true })
  })

  it("starts on a random port and exposes a base URL", async () => {
    await server.ensureStarted()
    const baseUrl = server.getBaseUrl()
    expect(baseUrl).toMatch(/^http:\/\/127\.0\.0\.1:\d+$/)
  })

  it("is idempotent — calling ensureStarted twice uses the same port", async () => {
    await server.ensureStarted()
    const url1 = server.getBaseUrl()
    await server.ensureStarted()
    const url2 = server.getBaseUrl()
    expect(url1).toBe(url2)
  })

  it("throws when getBaseUrl is called before starting", () => {
    expect(() => server.getBaseUrl()).toThrow("Media server has not started")
  })

  it("registers and looks up media items", () => {
    server.registerMedia({
      id: "test-1",
      kind: "image",
      filePath: "/tmp/test.png",
      mimeType: "image/png",
      description: "Test image",
    })

    const item = server.lookupMedia("test-1")
    expect(item).toBeDefined()
    expect(item!.kind).toBe("image")
    expect(item!.description).toBe("Test image")
  })

  it("returns undefined for unknown media IDs", () => {
    expect(server.lookupMedia("nonexistent")).toBeUndefined()
  })

  it("generates correct view URLs", async () => {
    await server.ensureStarted()
    const url = server.viewUrl("abc-123")
    expect(url).toBe(`${server.getBaseUrl()}/view/abc-123`)
  })

  it("returns 404 for unknown routes", async () => {
    await server.ensureStarted()
    const res = await httpGet(`${server.getBaseUrl()}/unknown`)
    expect(res.status).toBe(404)
  })

  it("returns 404 for unregistered media view", async () => {
    await server.ensureStarted()
    const res = await httpGet(`${server.getBaseUrl()}/view/no-such-item`)
    expect(res.status).toBe(404)
  })

  it("serves image viewer HTML for registered image media", async () => {
    const imagePath = path.join(tempRoot, "test.png")
    await fs.writeFile(imagePath, Buffer.from([0x89, 0x50, 0x4e, 0x47]))

    server.registerMedia({
      id: "img-1",
      kind: "image",
      filePath: imagePath,
      mimeType: "image/png",
      description: "Test PNG",
    })
    await server.ensureStarted()

    const res = await httpGet(`${server.getBaseUrl()}/view/img-1`)
    expect(res.status).toBe(200)
    expect(res.headers["content-type"]).toContain("text/html")
    expect(res.body).toContain("Test PNG")
    expect(res.body).toContain("/api/media/img-1")
    expect(res.body).toContain("zoom-in")
  })

  it("serves video viewer HTML for registered video media", async () => {
    const videoPath = path.join(tempRoot, "test.mp4")
    await fs.writeFile(videoPath, Buffer.alloc(10))

    server.registerMedia({
      id: "vid-1",
      kind: "video",
      filePath: videoPath,
      mimeType: "video/mp4",
      description: "Test video",
    })
    await server.ensureStarted()

    const res = await httpGet(`${server.getBaseUrl()}/view/vid-1`)
    expect(res.status).toBe(200)
    expect(res.headers["content-type"]).toContain("text/html")
    expect(res.body).toContain("<video")
    expect(res.body).toContain("video/mp4")
  })

  it("serves plotly viewer HTML for registered plotly media", async () => {
    server.registerMedia({
      id: "plot-1",
      kind: "plotly",
      filePath: "/unused",
      mimeType: "application/json",
      description: "Test chart",
      media: { plotlySpec: { data: [{ x: [1], y: [2], type: "scatter" }] } },
    })
    await server.ensureStarted()

    const res = await httpGet(`${server.getBaseUrl()}/view/plot-1`)
    expect(res.status).toBe(200)
    expect(res.body).toContain("plotly")
    expect(res.body).toContain("/api/media/plot-1")
  })

  it("serves raw image bytes via /api/media/:id", async () => {
    const imageBytes = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a])
    const imagePath = path.join(tempRoot, "raw.png")
    await fs.writeFile(imagePath, imageBytes)

    server.registerMedia({
      id: "raw-1",
      kind: "image",
      filePath: imagePath,
      mimeType: "image/png",
      description: "Raw image",
    })
    await server.ensureStarted()

    const res = await httpGet(`${server.getBaseUrl()}/api/media/raw-1`)
    expect(res.status).toBe(200)
    expect(res.headers["content-type"]).toBe("image/png")
    expect(res.headers["x-content-type-options"]).toBe("nosniff")
  })

  it("serves plotly JSON spec via /api/media/:id", async () => {
    const spec = { data: [{ x: [1, 2], y: [3, 4], type: "bar" }], layout: { title: "Test" } }
    server.registerMedia({
      id: "spec-1",
      kind: "plotly",
      filePath: "/unused",
      mimeType: "application/json",
      description: "Spec test",
      media: { plotlySpec: spec },
    })
    await server.ensureStarted()

    const res = await httpGet(`${server.getBaseUrl()}/api/media/spec-1`)
    expect(res.status).toBe(200)
    expect(res.headers["content-type"]).toContain("application/json")
    const parsed = JSON.parse(res.body)
    expect(parsed.data[0].type).toBe("bar")
    expect(parsed.layout.title).toBe("Test")
  })

  it("returns 403 for file paths outside allowed root", async () => {
    const outsidePath = path.join(os.tmpdir(), "outside-test.png")
    await fs.writeFile(outsidePath, Buffer.from([0x89, 0x50]))

    server.registerMedia({
      id: "escape-1",
      kind: "image",
      filePath: outsidePath,
      mimeType: "image/png",
      description: "Escape attempt",
    })
    await server.ensureStarted()

    const res = await httpGet(`${server.getBaseUrl()}/api/media/escape-1`)
    expect(res.status).toBe(403)

    await fs.rm(outsidePath, { force: true })
  })

  it("returns 500 for plotly api when plotlySpec is missing", async () => {
    server.registerMedia({
      id: "no-spec",
      kind: "plotly",
      filePath: "/unused",
      mimeType: "application/json",
      description: "Missing spec",
    })
    await server.ensureStarted()

    const res = await httpGet(`${server.getBaseUrl()}/api/media/no-spec`)
    expect(res.status).toBe(500)
    expect(res.body).toContain("missing")
  })

  it("returns 400 for invalid (empty) media id in view route", async () => {
    await server.ensureStarted()
    const res = await httpGet(`${server.getBaseUrl()}/view/`)
    expect(res.status).toBe(400)
  })
})
