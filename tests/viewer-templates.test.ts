import { describe, expect, it } from "vitest"
import {
  imageViewerHtml,
  videoViewerHtml,
  plotlyViewerHtml,
} from "../src/utils/viewer-templates.ts"

describe("imageViewerHtml", () => {
  it("returns valid HTML with title and media URL", () => {
    const html = imageViewerHtml({ title: "Test Image", mediaUrl: "/api/media/img-1" })
    expect(html).toContain("<!DOCTYPE html>")
    expect(html).toContain("<title>Test Image</title>")
    expect(html).toContain('src="/api/media/img-1"')
    expect(html).toContain('alt="Test Image"')
  })

  it("includes click-to-zoom behavior", () => {
    const html = imageViewerHtml({ title: "Zoom", mediaUrl: "/m" })
    expect(html).toContain("zoom-in")
    expect(html).toContain("zoom-out")
    expect(html).toContain("classList.toggle")
    expect(html).toContain('"zoomed"')
  })

  it("escapes HTML special characters in title", () => {
    const html = imageViewerHtml({ title: '<script>alert("xss")</script>', mediaUrl: "/m" })
    expect(html).not.toContain("<script>alert")
    expect(html).toContain("&lt;script&gt;")
    expect(html).toContain("&quot;xss&quot;")
  })

  it("escapes HTML special characters in media URL", () => {
    const html = imageViewerHtml({ title: "t", mediaUrl: '"/><script>alert(1)</script>' })
    expect(html).not.toContain('"/><script>')
    expect(html).toContain("&quot;/&gt;&lt;script&gt;")
  })
})

describe("videoViewerHtml", () => {
  it("returns valid HTML with video element", () => {
    const html = videoViewerHtml({ title: "Test Video", mediaUrl: "/api/media/vid-1", mimeType: "video/mp4" })
    expect(html).toContain("<!DOCTYPE html>")
    expect(html).toContain("<title>Test Video</title>")
    expect(html).toContain("<video")
    expect(html).toContain("controls")
    expect(html).toContain('src="/api/media/vid-1"')
    expect(html).toContain('type="video/mp4"')
  })

  it("includes preload and fallback text", () => {
    const html = videoViewerHtml({ title: "V", mediaUrl: "/m", mimeType: "video/webm" })
    expect(html).toContain('preload="metadata"')
    expect(html).toContain("Your browser does not support the video tag")
  })

  it("escapes title and URL", () => {
    const html = videoViewerHtml({ title: "A<B", mediaUrl: "/x&y", mimeType: "video/mp4" })
    expect(html).toContain("A&lt;B")
    expect(html).toContain("/x&amp;y")
  })
})

describe("plotlyViewerHtml", () => {
  it("returns valid HTML that loads Plotly CDN", () => {
    const html = plotlyViewerHtml({ title: "Test Chart", mediaUrl: "/api/media/plot-1" })
    expect(html).toContain("<!DOCTYPE html>")
    expect(html).toContain("<title>Test Chart</title>")
    expect(html).toContain("plotly")
    expect(html).toContain("cdn.plot.ly")
  })

  it("includes fetch call to media URL", () => {
    const html = plotlyViewerHtml({ title: "C", mediaUrl: "/api/media/xyz" })
    expect(html).toContain('fetch("/api/media/xyz"')
  })

  it("includes chart container and error display", () => {
    const html = plotlyViewerHtml({ title: "C", mediaUrl: "/m" })
    expect(html).toContain('id="chart"')
    expect(html).toContain('id="error"')
    expect(html).toContain("Plotly.newPlot")
  })

  it("escapes title and URL", () => {
    const html = plotlyViewerHtml({ title: "A&B", mediaUrl: "/x\"y" })
    expect(html).toContain("A&amp;B")
    expect(html).toContain("/x&quot;y")
  })

  it("configures responsive mode by default", () => {
    const html = plotlyViewerHtml({ title: "C", mediaUrl: "/m" })
    expect(html).toContain("responsive: true")
  })
})
