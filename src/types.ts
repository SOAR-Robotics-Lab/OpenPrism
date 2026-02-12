/**
 * OpenPrism — Shared type definitions for the multi-tier drawing plugin.
 */

// ---------------------------------------------------------------------------
// Tier classification
// ---------------------------------------------------------------------------

/** The three rendering tiers supported by OpenPrism. */
export type DrawingTier = 1 | 2 | 3

/**
 * Human-readable names for each tier.
 */
export const TIER_NAMES: Record<DrawingTier, string> = {
  1: "Mermaid (Architecture & Logic)",
  2: "Matplotlib (Data Visualization)",
  3: "AIGC (Generative Image)",
}

// ---------------------------------------------------------------------------
// Mermaid (Tier 1)
// ---------------------------------------------------------------------------

/** Supported Mermaid diagram types. */
export type MermaidDiagramType =
  | "flowchart"
  | "sequenceDiagram"
  | "classDiagram"
  | "stateDiagram"
  | "erDiagram"
  | "gantt"
  | "pie"
  | "mindmap"
  | "timeline"
  | "gitgraph"
  | "block"
  | "architecture"

/** Output format for server-side rendered Mermaid diagrams. */
export type MermaidOutputFormat = "svg" | "png" | "pdf"

/** Configuration for the Mermaid SSR renderer. */
export interface MermaidRenderOptions {
  /** Mermaid source code. */
  source: string
  /** Desired output format. Defaults to "svg". */
  format?: MermaidOutputFormat
  /** Mermaid theme name. Defaults to "default". */
  theme?: "default" | "dark" | "forest" | "neutral"
  /** Background color (CSS). Defaults to "transparent". */
  backgroundColor?: string
  /** Diagram width in pixels. */
  width?: number
  /** Diagram height in pixels. */
  height?: number
}

/** Result of a successful Mermaid render. */
export interface MermaidRenderResult {
  /** Absolute path to the generated file. */
  filePath: string
  /** Format of the output file. */
  format: MermaidOutputFormat
  /** Size in bytes. */
  size: number
}

// ---------------------------------------------------------------------------
// Matplotlib (Tier 2)
// ---------------------------------------------------------------------------

/** Configuration for the Matplotlib Python bridge. */
export interface MatplotlibRenderOptions {
  /** Python script source code (must use Matplotlib). */
  script: string
  /** Output filename (without extension). Auto-generated if omitted. */
  outputName?: string
  /** Output format. Defaults to "png". */
  format?: "png" | "svg" | "pdf"
  /** DPI for raster output. Defaults to 150. */
  dpi?: number
  /** Path to Python executable. Auto-detected if omitted. */
  pythonPath?: string
}

/** Result of a Matplotlib render. */
export interface MatplotlibRenderResult {
  /** Absolute path to the generated image. */
  filePath: string
  /** Format of the output file. */
  format: "png" | "svg" | "pdf"
  /** Size in bytes. */
  size: number
  /** Standard output from the Python process. */
  stdout: string
  /** Standard error from the Python process (warnings, etc.). */
  stderr: string
}

// ---------------------------------------------------------------------------
// AIGC (Tier 3)
// ---------------------------------------------------------------------------

/** Supported AIGC operations. */
export type AIGCOperation = "generate" | "edit" | "continue_editing" | "restore"

/** Configuration for an AIGC image generation request. */
export interface AIGCRenderOptions {
  /** Operation type. */
  operation: AIGCOperation
  /** Text prompt describing the desired image. */
  prompt: string
  /** Path to source image (required for edit/restore operations). */
  sourcePath?: string
  /** Paths to reference images for style guidance. */
  referenceImages?: string[]
}

/** Result of an AIGC generation. */
export interface AIGCRenderResult {
  /** Absolute path to the generated image. */
  filePath: string
  /** The prompt used for generation. */
  prompt: string
  /** Operation performed. */
  operation: AIGCOperation
  /** Size in bytes. */
  size: number
}

// ---------------------------------------------------------------------------
// Asset management
// ---------------------------------------------------------------------------

/** Metadata record for a generated visual asset. */
export interface AssetRecord {
  /** Unique identifier. */
  id: string
  /** Which tier produced this asset. */
  tier: DrawingTier
  /** Absolute path to the file. */
  filePath: string
  /** Human-readable description / prompt. */
  description: string
  /** ISO 8601 timestamp of creation. */
  createdAt: string
  /** File size in bytes. */
  size: number
  /** MIME type of the output. */
  mimeType: string
}

/** Summary of all assets in the current session, used for compaction. */
export interface AssetSummary {
  /** Total number of generated assets. */
  count: number
  /** Summaries per tier. */
  tiers: Partial<Record<DrawingTier, {
    count: number
    descriptions: string[]
  }>>
}

// ---------------------------------------------------------------------------
// Plugin configuration
// ---------------------------------------------------------------------------

/** Runtime configuration for the OpenPrism plugin. */
export interface OpenPrismConfig {
  /** Base directory for generated output. Defaults to ".opencode/plots". */
  outputDir: string
  /** Whether Tier 1 (Mermaid) is enabled. Defaults to true. */
  mermaidEnabled: boolean
  /** Whether Tier 2 (Matplotlib) is enabled. Defaults to true. */
  matplotlibEnabled: boolean
  /** Whether Tier 3 (AIGC) is enabled. Defaults to true. */
  aigcEnabled: boolean
  /** Maximum directory size in MB before auto-cleanup triggers. Defaults to 500. */
  maxOutputSizeMB: number
  /** Number of days after which old assets are cleaned up. Defaults to 30. */
  cleanupAfterDays: number
}

/** Default plugin configuration. */
export const DEFAULT_CONFIG: OpenPrismConfig = {
  outputDir: ".opencode/plots",
  mermaidEnabled: true,
  matplotlibEnabled: true,
  aigcEnabled: true,
  maxOutputSizeMB: 500,
  cleanupAfterDays: 30,
}
