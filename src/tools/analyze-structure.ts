import { tool } from "@opencode-ai/plugin"
import * as fs from "node:fs/promises"
import * as path from "node:path"

const IGNORED_DIRS = new Set([
  "node_modules", ".git", "dist", "build", "out", ".next",
  "__pycache__", ".venv", "venv", ".tox", "coverage",
  ".opencode", ".cache", ".turbo",
])

const IGNORED_EXTENSIONS = new Set([
  ".lock", ".map", ".min.js", ".min.css",
  ".ico", ".png", ".jpg", ".jpeg", ".gif", ".svg", ".webp",
  ".woff", ".woff2", ".ttf", ".eot",
])

interface TreeNode {
  name: string
  type: "file" | "directory"
  children?: TreeNode[]
  extension?: string
}

async function buildTree(dirPath: string, depth: number, maxDepth: number): Promise<TreeNode[]> {
  if (depth >= maxDepth) return []

  const entries = await fs.readdir(dirPath, { withFileTypes: true })
  const nodes: TreeNode[] = []

  const sorted = entries.sort((a, b) => {
    if (a.isDirectory() && !b.isDirectory()) return -1
    if (!a.isDirectory() && b.isDirectory()) return 1
    return a.name.localeCompare(b.name)
  })

  for (const entry of sorted) {
    if (entry.name.startsWith(".") && entry.isDirectory()) continue
    if (IGNORED_DIRS.has(entry.name)) continue

    if (entry.isDirectory()) {
      const children = await buildTree(
        path.join(dirPath, entry.name),
        depth + 1,
        maxDepth,
      )
      nodes.push({ name: entry.name, type: "directory", children })
    } else {
      const ext = path.extname(entry.name)
      if (IGNORED_EXTENSIONS.has(ext)) continue
      nodes.push({ name: entry.name, type: "file", extension: ext })
    }
  }

  return nodes
}

function treeToMermaid(tree: TreeNode[], projectName: string): string {
  const lines = ["graph TD"]
  let counter = 0

  function nodeId(): string {
    return `n${counter++}`
  }

  function addNodes(nodes: TreeNode[], parentId: string): void {
    for (const node of nodes) {
      const id = nodeId()
      if (node.type === "directory") {
        lines.push(`    ${parentId} --> ${id}[/"${node.name}"/]`)
        if (node.children?.length) {
          addNodes(node.children, id)
        }
      } else {
        lines.push(`    ${parentId} --> ${id}["${node.name}"]`)
      }
    }
  }

  const rootId = nodeId()
  lines.push(`    ${rootId}(("${projectName}"))`)
  addNodes(tree, rootId)

  return lines.join("\n")
}

function treeToText(tree: TreeNode[], prefix = ""): string {
  const lines: string[] = []
  for (let i = 0; i < tree.length; i++) {
    const node = tree[i]!
    const isLast = i === tree.length - 1
    const connector = isLast ? "└── " : "├── "
    const childPrefix = isLast ? "    " : "│   "

    lines.push(`${prefix}${connector}${node.name}`)
    if (node.type === "directory" && node.children?.length) {
      lines.push(treeToText(node.children, prefix + childPrefix))
    }
  }
  return lines.join("\n")
}

export function createAnalyzeStructureTool() {
  return tool({
    description:
      "Analyze the project directory structure and generate a Mermaid architecture diagram or a text tree. Useful for understanding codebase layout, planning refactors, and documenting project structure.",
    args: {
      format: tool.schema
        .enum(["mermaid", "text"])
        .optional()
        .describe("Output format: 'mermaid' for a Mermaid diagram, 'text' for an ASCII tree. Defaults to mermaid"),
      maxDepth: tool.schema
        .number()
        .optional()
        .describe("Maximum directory depth to scan. Defaults to 4"),
      targetPath: tool.schema
        .string()
        .optional()
        .describe("Relative path within the project to analyze. Defaults to project root"),
    },
    async execute(args, context) {
      const maxDepth = args.maxDepth ?? 4
      const rootDir = args.targetPath
        ? path.resolve(context.directory, args.targetPath)
        : context.directory
      const projectName = path.basename(context.worktree)

      try {
        await fs.access(rootDir)
      } catch {
        return `Error: Directory not found: ${rootDir}`
      }

      const tree = await buildTree(rootDir, 0, maxDepth)

      if (args.format === "text") {
        return `Project structure for ${projectName}:\n\n${treeToText(tree)}`
      }

      const mermaidSource = treeToMermaid(tree, projectName)
      return [
        "Generated Mermaid architecture diagram:",
        "",
        "```mermaid",
        mermaidSource,
        "```",
        "",
        `Scanned ${rootDir} (depth: ${maxDepth})`,
      ].join("\n")
    },
  })
}
