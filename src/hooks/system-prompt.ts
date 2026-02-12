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
        "### Tier 2a: Matplotlib Data Visualization (Static)",
        "Use for publication-quality static plots that require heavy backend data processing.",
        "- Tool: `plot_data` — executes a Python/Matplotlib script and saves the output",
        "- Do NOT include plt.show() or matplotlib.use() — they are injected automatically.",
        "- **IMPORTANT**: Always use English for all text in plots (titles, labels, legends, annotations). CJK characters (Chinese, Japanese, Korean) will render as blank squares due to missing fonts in the default Matplotlib environment. If the user requests CJK text, politely note the font limitation and offer an English alternative.",
        "- Best for: large dataset processing, complex statistical analysis, multi-panel figures, custom rendering.",
        "- Prefer Matplotlib when the data must be computed or fetched on the backend (files, APIs, databases).",
        "",
      )
    }

    if (config.plotlyEnabled) {
      sections.push(
        "### Tier 2b: Plotly.js Interactive Charts",
        "Use for interactive data exploration where the user benefits from zoom, hover, and filter capabilities.",
        "- Tool: `plot_interactive` — creates a Plotly.js chart from a JSON spec and returns a viewer URL",
        "- The `spec` argument is a JSON string with `data` (array of traces), `layout`, and optional `config`.",
        "- The chart opens in the browser as an interactive page (zoom, pan, hover tooltips, legend toggle).",
        "- Best for: data already available in the conversation context, trend exploration, comparison charts.",
        "- Prefer Plotly when the user wants to interact with the data (zoom into regions, compare series, export).",
        "",
      )

      if (config.matplotlibEnabled) {
        sections.push(
          "#### When to choose Matplotlib vs Plotly:",
          "- Data requires backend computation (read files, run algorithms) → `plot_data` (Matplotlib)",
          "- Data is available in context and user wants interactivity → `plot_interactive` (Plotly)",
          "- Static publication-quality figure needed → `plot_data` (Matplotlib)",
          "- Quick exploration / comparison of known values → `plot_interactive` (Plotly)",
          "",
        )
      }
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
      "- Static data plots / heavy computation → Tier 2a (Matplotlib)",
      "- Interactive data exploration → Tier 2b (Plotly)",
      "- Creative / Visual Assets → Tier 3 (AIGC)",
      "- When unsure, default to Mermaid for structural topics, Plotly for simple data, Matplotlib for complex data.",
      "",
      "### Media Display",
      "- All generated images appear as clickable thumbnails in chat. Click to open the full viewer in a new tab.",
      "- Plotly charts open as fully interactive pages (zoom, hover, legend toggle).",
      "- You can reference local image or video files using markdown: `![description](path/to/file)`",
      "  The plugin will automatically create viewable thumbnails for files under the output directory.",
    )

    output.system.push(sections.join("\n"))
  }
}
