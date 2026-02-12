import type { Hooks } from "@opencode-ai/plugin"
import type { FileManager } from "../utils/file-manager.js"

export function createSessionCompactionHook(
  fileManager: FileManager,
): NonNullable<Hooks["experimental.session.compacting"]> {
  return async (_input, output) => {
    const summary = await fileManager.summarize()

    if (summary.count === 0) return

    const lines: string[] = [
      "## OpenPrism Visual Assets Summary",
      "",
      `Total generated assets: ${summary.count}`,
      "",
    ]

    const tierLabels: Record<number, string> = {
      1: "Mermaid Diagrams",
      2: "Matplotlib Plots",
      3: "AIGC Images",
    }

    for (const [tierStr, data] of Object.entries(summary.tiers)) {
      const tier = Number(tierStr)
      const label = tierLabels[tier] ?? `Tier ${tier}`
      lines.push(`### ${label} (${data.count} assets)`)

      for (const desc of data.descriptions.slice(0, 10)) {
        lines.push(`- ${desc}`)
      }

      if (data.descriptions.length > 10) {
        lines.push(`- ... and ${data.descriptions.length - 10} more`)
      }

      lines.push("")
    }

    lines.push(
      "Preserve this context to maintain awareness of previously generated visual assets.",
    )

    output.context.push(lines.join("\n"))
  }
}
