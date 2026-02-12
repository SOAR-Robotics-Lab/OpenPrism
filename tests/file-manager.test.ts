import * as fs from "node:fs/promises"
import * as os from "node:os"
import * as path from "node:path"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { FileManager } from "../src/utils/file-manager.ts"
import { DEFAULT_CONFIG, type AssetRecord } from "../src/types.ts"

describe("FileManager", () => {
  let tempRoot: string

  beforeEach(async () => {
    tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "openprism-file-manager-"))
  })

  afterEach(async () => {
    await fs.rm(tempRoot, { recursive: true, force: true })
  })

  it("uses default config and resolves base directory from project dir", async () => {
    const manager = new FileManager(tempRoot)
    await manager.ensureDir()
    const expectedBaseDir = path.resolve(tempRoot, DEFAULT_CONFIG.outputDir)
    const stat = await fs.stat(expectedBaseDir)
    expect(stat.isDirectory()).toBe(true)
    expect(manager.tierDir(1)).toBe(path.join(expectedBaseDir, "mermaid"))
  })

  it("uses custom config for output directory resolution", async () => {
    const manager = new FileManager(tempRoot, { outputDir: "custom-output" })
    await manager.ensureDir()
    const expectedBaseDir = path.resolve(tempRoot, "custom-output")
    const stat = await fs.stat(expectedBaseDir)
    expect(stat.isDirectory()).toBe(true)
    expect(manager.tierDir(2)).toBe(path.join(expectedBaseDir, "matplotlib"))
  })

  it("ensureDir creates the base output directory", async () => {
    const manager = new FileManager(tempRoot, { outputDir: "nested/output" })
    const expectedBaseDir = path.resolve(tempRoot, "nested/output")
    await manager.ensureDir()
    const stat = await fs.stat(expectedBaseDir)
    expect(stat.isDirectory()).toBe(true)
  })

  it("tierDir returns the correct subdirectory for each tier", () => {
    const manager = new FileManager(tempRoot)
    const baseDir = path.resolve(tempRoot, DEFAULT_CONFIG.outputDir)
    expect(manager.tierDir(1)).toBe(path.join(baseDir, "mermaid"))
    expect(manager.tierDir(2)).toBe(path.join(baseDir, "matplotlib"))
    expect(manager.tierDir(3)).toBe(path.join(baseDir, "aigc"))
  })

  it("ensureTierDir creates tier-specific subdirectory", async () => {
    const manager = new FileManager(tempRoot)
    const tierPath = await manager.ensureTierDir(3)
    const stat = await fs.stat(tierPath)
    expect(stat.isDirectory()).toBe(true)
    expect(tierPath).toBe(manager.tierDir(3))
  })

  it("generateFilename formats as prefix-timestamp-id.ext", () => {
    const manager = new FileManager(tempRoot)
    const name = manager.generateFilename("diagram", ".svg")
    expect(name).toMatch(/^diagram-\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-[a-z0-9]{4}\.svg$/)
  })

  it("outputPath combines tier directory and generated filename", async () => {
    const manager = new FileManager(tempRoot)
    const output = await manager.outputPath(2, "plot", ".png")
    expect(path.dirname(output)).toBe(manager.tierDir(2))
    expect(path.basename(output)).toMatch(/^plot-\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-[a-z0-9]{4}\.png$/)
  })

  it("recordAsset creates a record, persists manifest, and assigns mime type", async () => {
    const manager = new FileManager(tempRoot)
    const filePath = path.join(await manager.ensureTierDir(1), "sample.svg")
    await fs.writeFile(filePath, "<svg></svg>", "utf-8")

    const record = await manager.recordAsset(1, filePath, "sample mermaid")
    const manifestPath = path.join(path.resolve(tempRoot, DEFAULT_CONFIG.outputDir), "openprism-manifest.json")
    const manifestRaw = await fs.readFile(manifestPath, "utf-8")
    const manifest = JSON.parse(manifestRaw) as AssetRecord[]

    expect(record.tier).toBe(1)
    expect(record.filePath).toBe(filePath)
    expect(record.description).toBe("sample mermaid")
    expect(record.mimeType).toBe("image/svg+xml")
    expect(record.size).toBeGreaterThan(0)
    expect(manifest).toHaveLength(1)
    expect(manifest[0]?.id).toBe(record.id)
  })

  it("getAssets returns a copy and loads persisted manifest from disk", async () => {
    const manager = new FileManager(tempRoot)
    const fileA = path.join(await manager.ensureTierDir(1), "a.png")
    const fileB = path.join(await manager.ensureTierDir(2), "b.pdf")
    await fs.writeFile(fileA, Buffer.from([1, 2, 3]))
    await fs.writeFile(fileB, Buffer.from([4, 5, 6, 7]))
    await manager.recordAsset(1, fileA, "asset a")
    await manager.recordAsset(2, fileB, "asset b")

    const firstRead = await manager.getAssets()
    expect(firstRead).toHaveLength(2)
    firstRead.pop()

    const secondRead = await manager.getAssets()
    expect(secondRead).toHaveLength(2)

    const freshManager = new FileManager(tempRoot)
    const persisted = await freshManager.getAssets()
    expect(persisted).toHaveLength(2)
    expect(persisted.map((asset) => asset.description)).toEqual(expect.arrayContaining(["asset a", "asset b"]))
  })

  it("summarize groups by tier and returns accurate counts", async () => {
    const manager = new FileManager(tempRoot)
    const file1 = path.join(await manager.ensureTierDir(1), "one.svg")
    const file2 = path.join(await manager.ensureTierDir(1), "two.svg")
    const file3 = path.join(await manager.ensureTierDir(3), "three.webp")
    await fs.writeFile(file1, "a", "utf-8")
    await fs.writeFile(file2, "b", "utf-8")
    await fs.writeFile(file3, "c", "utf-8")
    await manager.recordAsset(1, file1, "d1")
    await manager.recordAsset(1, file2, "d2")
    await manager.recordAsset(3, file3, "d3")

    const summary = await manager.summarize()

    expect(summary.count).toBe(3)
    expect(summary.tiers[1]?.count).toBe(2)
    expect(summary.tiers[1]?.descriptions).toEqual(["d1", "d2"])
    expect(summary.tiers[3]?.count).toBe(1)
    expect(summary.tiers[3]?.descriptions).toEqual(["d3"])
    expect(summary.tiers[2]).toBeUndefined()
  })

  it("cleanup removes old assets and keeps recent assets", async () => {
    const manager = new FileManager(tempRoot, { cleanupAfterDays: 1 })
    const oldFile = path.join(await manager.ensureTierDir(1), "old.png")
    const newFile = path.join(await manager.ensureTierDir(2), "new.png")
    await fs.writeFile(oldFile, Buffer.alloc(12))
    await fs.writeFile(newFile, Buffer.alloc(24))
    await manager.recordAsset(1, oldFile, "old")
    await manager.recordAsset(2, newFile, "new")

    const manifestPath = path.join(path.resolve(tempRoot, DEFAULT_CONFIG.outputDir), "openprism-manifest.json")
    const manifestRaw = await fs.readFile(manifestPath, "utf-8")
    const manifest = JSON.parse(manifestRaw) as AssetRecord[]
    const oldDate = new Date(Date.now() - 5 * 86_400_000).toISOString()
    manifest[0] = { ...manifest[0], createdAt: oldDate }
    await fs.writeFile(manifestPath, JSON.stringify(manifest, null, 2), "utf-8")

    const freshManager = new FileManager(tempRoot, { cleanupAfterDays: 1 })
    const removed = await freshManager.cleanup()

    expect(removed).toBe(1)
    await expect(fs.stat(oldFile)).rejects.toThrow()
    const newStat = await fs.stat(newFile)
    expect(newStat.isFile()).toBe(true)

    const remainingAssets = await freshManager.getAssets()
    expect(remainingAssets).toHaveLength(1)
    expect(remainingAssets[0]?.description).toBe("new")
  })

  it("getDirectorySize returns recursive total size in bytes", async () => {
    const manager = new FileManager(tempRoot)
    const tierOneDir = await manager.ensureTierDir(1)
    const tierTwoDir = await manager.ensureTierDir(2)
    const file1 = path.join(tierOneDir, "a.bin")
    const file2 = path.join(tierTwoDir, "b.bin")
    await fs.writeFile(file1, Buffer.alloc(10))
    await fs.writeFile(file2, Buffer.alloc(25))

    const total = await manager.getDirectorySize()
    expect(total).toBe(35)
  })

  it("shouldCleanup compares directory size against maxOutputSizeMB", async () => {
    const overLimit = new FileManager(tempRoot, { maxOutputSizeMB: 0.00001 })
    const smallLimitFile = path.join(await overLimit.ensureTierDir(1), "large-enough.bin")
    await fs.writeFile(smallLimitFile, Buffer.alloc(64))
    await expect(overLimit.shouldCleanup()).resolves.toBe(true)

    const underLimitRoot = await fs.mkdtemp(path.join(os.tmpdir(), "openprism-file-manager-under-"))
    try {
      const underLimit = new FileManager(underLimitRoot, { maxOutputSizeMB: 1 })
      const file = path.join(await underLimit.ensureTierDir(1), "small.bin")
      await fs.writeFile(file, Buffer.alloc(64))
      await expect(underLimit.shouldCleanup()).resolves.toBe(false)
    } finally {
      await fs.rm(underLimitRoot, { recursive: true, force: true })
    }
  })
})
