import { execFile } from "node:child_process"
import * as fs from "node:fs/promises"
import * as os from "node:os"
import * as path from "node:path"
import { promisify } from "node:util"
import type { MermaidOutputFormat, MermaidRenderOptions, MermaidRenderResult } from "../types.js"

const execFileAsync = promisify(execFile)

const FORMAT_EXT: Record<MermaidOutputFormat, string> = {
  svg: ".svg",
  png: ".png",
  pdf: ".pdf",
}

async function findMmdc(): Promise<string> {
  const candidates = ["mmdc", "npx mmdc"]

  for (const cmd of candidates) {
    try {
      await execFileAsync(cmd.split(" ")[0]!, cmd.split(" ").length > 1 ? [cmd.split(" ")[1]!, "--version"] : ["--version"], {
        timeout: 10_000,
      })
      return cmd
    } catch {
      continue
    }
  }

  throw new Error(
    "mermaid-cli (mmdc) not found. Install it with: npm install -g @mermaid-js/mermaid-cli",
  )
}

function buildMermaidConfig(options: MermaidRenderOptions): object {
  return {
    theme: options.theme ?? "default",
    themeCSS: options.backgroundColor
      ? `* { background: ${options.backgroundColor}; }`
      : undefined,
  }
}

export async function renderMermaid(
  options: MermaidRenderOptions,
  outputPath: string,
): Promise<MermaidRenderResult> {
  const format = options.format ?? "svg"
  const mmdc = await findMmdc()

  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "openprism-mermaid-"))
  const inputFile = path.join(tmpDir, "input.mmd")
  const configFile = path.join(tmpDir, "config.json")

  try {
    await fs.writeFile(inputFile, options.source, "utf-8")
    await fs.writeFile(configFile, JSON.stringify(buildMermaidConfig(options)), "utf-8")

    const args = [
      "--input", inputFile,
      "--output", outputPath,
      "--outputFormat", format,
      "--configFile", configFile,
      "--quiet",
    ]

    if (options.width) {
      args.push("--width", String(options.width))
    }
    if (options.height) {
      args.push("--height", String(options.height))
    }

    const cmdParts = mmdc.split(" ")
    const executable = cmdParts[0]!
    const execArgs = [...cmdParts.slice(1), ...args]

    await execFileAsync(executable, execArgs, {
      timeout: 30_000,
      env: {
        ...process.env,
        PUPPETEER_CHROMIUM_REVISION: "1",
      },
    })

    const stat = await fs.stat(outputPath)
    return {
      filePath: outputPath,
      format,
      size: stat.size,
    }
  } finally {
    await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {})
  }
}

const MERMAID_BLOCK_REGEX = /```mermaid\s*\n([\s\S]*?)```/g

export function extractMermaidBlocks(text: string): string[] {
  const blocks: string[] = []
  let match: RegExpExecArray | null
  while ((match = MERMAID_BLOCK_REGEX.exec(text)) !== null) {
    const content = match[1]?.trim()
    if (content) {
      blocks.push(content)
    }
  }
  MERMAID_BLOCK_REGEX.lastIndex = 0
  return blocks
}

export function validateMermaidSyntax(source: string): { valid: boolean; error?: string } {
  const trimmed = source.trim()
  if (!trimmed) {
    return { valid: false, error: "Empty diagram source" }
  }

  const validStarters = [
    "graph", "flowchart", "sequenceDiagram", "classDiagram",
    "stateDiagram", "erDiagram", "gantt", "pie", "mindmap",
    "timeline", "gitGraph", "block-beta", "architecture-beta",
    "journey", "quadrantChart", "requirementDiagram", "C4Context",
    "sankey-beta", "xychart-beta", "packet-beta",
  ]

  const firstLine = trimmed.split("\n")[0]?.trim() ?? ""
  const startsWithValid = validStarters.some(
    (s) => firstLine.startsWith(s) || firstLine.startsWith(`%%`) || firstLine.startsWith("---"),
  )

  if (!startsWithValid) {
    return {
      valid: false,
      error: `Diagram must start with a valid type keyword. Got: "${firstLine.slice(0, 50)}"`,
    }
  }

  return { valid: true }
}

export { FORMAT_EXT }
