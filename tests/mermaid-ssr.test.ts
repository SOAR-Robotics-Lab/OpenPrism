import * as fs from "node:fs/promises"
import * as os from "node:os"
import * as path from "node:path"
import { describe, it, expect, beforeEach, afterEach } from "vitest"
import {
  FORMAT_EXT,
  extractMermaidBlocks,
  renderMermaid,
  validateMermaidSyntax,
} from "../src/renderers/mermaid-ssr.js"

describe("mermaid-ssr", () => {
  const tempDirs: string[] = []
  const originalPath = process.env["PATH"] ?? ""

  beforeEach(async () => {
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "openprism-mermaid-test-"))
    tempDirs.push(tmpDir)
    process.env["PATH"] = `${path.join(process.cwd(), "node_modules", ".bin")}:${originalPath}`
  })

  afterEach(async () => {
    process.env["PATH"] = originalPath
    await Promise.all(tempDirs.splice(0).map((dir) => fs.rm(dir, { recursive: true, force: true })))
  })

  describe("validateMermaidSyntax", () => {
    it("accepts supported starter diagram keywords", () => {
      const validSources = [
        "flowchart TD\nA-->B",
        "sequenceDiagram\nA->>B: ping",
        "classDiagram\nclass Animal",
        "erDiagram\nCAR ||--o{ NAMED-DRIVER : allows",
        "gantt\ntitle Test\ndateFormat YYYY-MM-DD",
        "pie title Pets\n\"Dogs\" : 386",
        "mindmap\n  root((mind))",
      ]

      for (const source of validSources) {
        expect(validateMermaidSyntax(source)).toEqual({ valid: true })
      }
    })

    it("rejects empty diagram source", () => {
      expect(validateMermaidSyntax("   ")).toEqual({
        valid: false,
        error: "Empty diagram source",
      })
    })

    it("rejects invalid first line", () => {
      const result = validateMermaidSyntax("not-a-diagram\nA-->B")
      expect(result.valid).toBe(false)
      expect(result.error).toContain("Diagram must start with a valid type keyword")
      expect(result.error).toContain("not-a-diagram")
    })
  })

  describe("extractMermaidBlocks", () => {
    it("extracts multiple mermaid blocks from markdown", () => {
      const markdown = [
        "# Title",
        "```mermaid",
        "flowchart TD",
        "A-->B",
        "```",
        "text",
        "```mermaid",
        "sequenceDiagram",
        "A->>B: Hi",
        "```",
      ].join("\n")

      expect(extractMermaidBlocks(markdown)).toEqual([
        "flowchart TD\nA-->B",
        "sequenceDiagram\nA->>B: Hi",
      ])
    })

    it("returns empty array when no mermaid block exists", () => {
      expect(extractMermaidBlocks("```ts\nconst a = 1\n```\nplain text")).toEqual([])
    })

    it("ignores empty mermaid blocks", () => {
      const markdown = "```mermaid\n\n```\n```mermaid\n   \n```"
      expect(extractMermaidBlocks(markdown)).toEqual([])
    })

    it("resets regex lastIndex between calls", () => {
      const markdown = "```mermaid\nflowchart TD\nA-->B\n```"
      expect(extractMermaidBlocks(markdown)).toEqual(["flowchart TD\nA-->B"])
      expect(extractMermaidBlocks(markdown)).toEqual(["flowchart TD\nA-->B"])
    })
  })

  describe("FORMAT_EXT", () => {
    it("maps output formats to file extensions", () => {
      expect(FORMAT_EXT).toEqual({
        svg: ".svg",
        png: ".png",
        pdf: ".pdf",
      })
    })
  })

  describe("renderMermaid", () => {
    it("renders a flowchart into an SVG file", async () => {
      const outputPath = path.join(tempDirs[0]!, "diagram.svg")
      const result = await renderMermaid(
        {
          source: "flowchart TD\nA[Start]-->B[End]",
          format: "svg",
        },
        outputPath,
      )

      expect(result.filePath).toBe(outputPath)
      expect(result.format).toBe("svg")
      expect(result.size).toBeGreaterThan(0)

      const output = await fs.readFile(outputPath, "utf-8")
      expect(output).toContain("<svg")
    })
  })
})
