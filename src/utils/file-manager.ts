import * as fs from "node:fs/promises"
import * as path from "node:path"
import type { AssetRecord, AssetSummary, DrawingTier, OpenPrismConfig } from "../types.js"
import { DEFAULT_CONFIG } from "../types.js"

const MANIFEST_FILE = "openprism-manifest.json"

const MIME_TYPES: Record<string, string> = {
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".pdf": "application/pdf",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
}

function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

function mimeFromExt(ext: string): string {
  return MIME_TYPES[ext.toLowerCase()] ?? "application/octet-stream"
}

export class FileManager {
  private readonly baseDir: string
  private readonly config: OpenPrismConfig
  private assets: AssetRecord[] = []
  private loaded = false

  constructor(projectDir: string, config?: Partial<OpenPrismConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config }
    this.baseDir = path.resolve(projectDir, this.config.outputDir)
  }

  async ensureDir(): Promise<void> {
    await fs.mkdir(this.baseDir, { recursive: true })
  }

  tierDir(tier: DrawingTier): string {
    const names: Record<DrawingTier, string> = {
      1: "mermaid",
      2: "matplotlib",
      3: "aigc",
    }
    return path.join(this.baseDir, names[tier])
  }

  async ensureTierDir(tier: DrawingTier): Promise<string> {
    const dir = this.tierDir(tier)
    await fs.mkdir(dir, { recursive: true })
    return dir
  }

  generateFilename(prefix: string, ext: string): string {
    const ts = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19)
    const id = Math.random().toString(36).slice(2, 6)
    return `${prefix}-${ts}-${id}${ext}`
  }

  async outputPath(tier: DrawingTier, prefix: string, ext: string): Promise<string> {
    const dir = await this.ensureTierDir(tier)
    return path.join(dir, this.generateFilename(prefix, ext))
  }

  private manifestPath(): string {
    return path.join(this.baseDir, MANIFEST_FILE)
  }

  private async loadManifest(): Promise<void> {
    if (this.loaded) return
    try {
      const raw = await fs.readFile(this.manifestPath(), "utf-8")
      this.assets = JSON.parse(raw) as AssetRecord[]
    } catch {
      this.assets = []
    }
    this.loaded = true
  }

  private async saveManifest(): Promise<void> {
    await this.ensureDir()
    await fs.writeFile(this.manifestPath(), JSON.stringify(this.assets, null, 2), "utf-8")
  }

  async recordAsset(
    tier: DrawingTier,
    filePath: string,
    description: string,
  ): Promise<AssetRecord> {
    await this.loadManifest()
    const stat = await fs.stat(filePath)
    const ext = path.extname(filePath)
    const record: AssetRecord = {
      id: generateId(),
      tier,
      filePath,
      description,
      createdAt: new Date().toISOString(),
      size: stat.size,
      mimeType: mimeFromExt(ext),
    }
    this.assets.push(record)
    await this.saveManifest()
    return record
  }

  async getAssets(): Promise<AssetRecord[]> {
    await this.loadManifest()
    return [...this.assets]
  }

  async summarize(): Promise<AssetSummary> {
    await this.loadManifest()
    const tiers: AssetSummary["tiers"] = {}
    for (const asset of this.assets) {
      const entry = tiers[asset.tier] ?? { count: 0, descriptions: [] }
      entry.count++
      entry.descriptions.push(asset.description)
      tiers[asset.tier] = entry
    }
    return { count: this.assets.length, tiers }
  }

  async cleanup(): Promise<number> {
    await this.loadManifest()
    const cutoff = Date.now() - this.config.cleanupAfterDays * 86_400_000
    const toRemove: AssetRecord[] = []
    const toKeep: AssetRecord[] = []

    for (const asset of this.assets) {
      if (new Date(asset.createdAt).getTime() < cutoff) {
        toRemove.push(asset)
      } else {
        toKeep.push(asset)
      }
    }

    for (const asset of toRemove) {
      try {
        await fs.unlink(asset.filePath)
      } catch {
        // expected: file may no longer exist
      }
    }

    this.assets = toKeep
    await this.saveManifest()
    return toRemove.length
  }

  async getDirectorySize(): Promise<number> {
    try {
      const entries = await fs.readdir(this.baseDir, {
        recursive: true,
        withFileTypes: true,
      })
      let total = 0
      for (const entry of entries) {
        if (entry.isFile()) {
          const fullPath = path.join(entry.parentPath, entry.name)
          const stat = await fs.stat(fullPath)
          total += stat.size
        }
      }
      return total
    } catch {
      return 0
    }
  }

  async shouldCleanup(): Promise<boolean> {
    const sizeBytes = await this.getDirectorySize()
    const limitBytes = this.config.maxOutputSizeMB * 1024 * 1024
    return sizeBytes > limitBytes
  }
}
