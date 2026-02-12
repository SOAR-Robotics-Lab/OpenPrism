import type { Hooks } from "@opencode-ai/plugin"
import type { OpenPrismConfig } from "../types.js"

export function createSystemPromptHook(
  config: OpenPrismConfig,
): NonNullable<Hooks["experimental.chat.system.transform"]> {
  return async (_input, output) => {
    const sections: string[] = []

    sections.push(
      "## OpenPrism Drawing Capabilities",
      "",
      "You have access to multi-tier drawing tools via the OpenPrism plugin.",
      "Choose the appropriate tier based on the task:",
      "",
    )

    if (config.mermaidEnabled) {
      sections.push(
        "### Tier 1: Mermaid Diagrams",
        "Use for architecture diagrams, flowcharts, sequence diagrams, ER diagrams, state machines, and dependency graphs.",
        "- Tool: `render_mermaid` — renders Mermaid source to SVG/PNG",
        "- Tool: `analyze_structure` — generates a project structure diagram",
        "- You can also include ```mermaid code blocks in your responses; they will be auto-rendered.",
        "- Prefer Mermaid when discussing architecture, planning refactors, or explaining control flow.",
        "",
      )
    }

    if (config.matplotlibEnabled) {
      sections.push(
        "### Tier 2: Matplotlib Data Visualization",
        "Use for data plots, charts, histograms, scatter plots, and any quantitative visualization.",
        "- Tool: `plot_data` — executes a Python/Matplotlib script and saves the output",
        "- Do NOT include plt.show() or matplotlib.use() — they are injected automatically.",
        "- **IMPORTANT**: Always use English for all text in plots (titles, labels, legends, annotations). CJK characters (Chinese, Japanese, Korean) will render as blank squares due to missing fonts in the default Matplotlib environment. If the user requests CJK text, politely note the font limitation and offer an English alternative.",
        "- Prefer Matplotlib when analyzing data, benchmarking, or visualizing algorithm behavior.",
        "",
      )
    }

    if (config.aigcEnabled) {
      sections.push(
        "### Tier 3: AIGC Image Generation",
        "Use for UI mockups, icons, creative assets, and image editing.",
        "- Tool: `generate_image` — prepares AIGC requests via configured MCP servers",
        "- Requires a configured AIGC MCP server (e.g., nano-banana-mcp).",
        "- Prefer AIGC when the user needs visual design assets, UI prototypes, or image manipulation.",
        "",
      )
    }

    sections.push(
      "### Selection Guidelines",
      "- Architecture / Logic → Tier 1 (Mermaid)",
      "- Data / Metrics → Tier 2 (Matplotlib)",
      "- Creative / Visual Assets → Tier 3 (AIGC)",
      "- When unsure, default to Mermaid for structural topics and Matplotlib for data topics.",
    )

    output.system.push(sections.join("\n"))
  }
}
