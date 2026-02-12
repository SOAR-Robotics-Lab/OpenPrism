import { execFile } from "node:child_process"
import * as fs from "node:fs/promises"
import * as os from "node:os"
import * as path from "node:path"
import { promisify } from "node:util"
import { describe, it, expect, beforeEach, afterEach } from "vitest"
import {
  detectPythonEnvironment,
  renderMatplotlib,
} from "../src/renderers/matplotlib-bridge.js"

const execFileAsync = promisify(execFile)

describe("matplotlib-bridge", () => {
  const tempDirs: string[] = []
  const originalCondaPrefix = process.env["CONDA_PREFIX"]

  beforeEach(async () => {
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "openprism-mpl-test-"))
    tempDirs.push(tmpDir)
    delete process.env["CONDA_PREFIX"]
  })

  afterEach(async () => {
    if (originalCondaPrefix === undefined) {
      delete process.env["CONDA_PREFIX"]
    } else {
      process.env["CONDA_PREFIX"] = originalCondaPrefix
    }
    await Promise.all(tempDirs.splice(0).map((dir) => fs.rm(dir, { recursive: true, force: true })))
  })

  it("detects a system Python environment", async () => {
    const env = await detectPythonEnvironment(tempDirs[0]!)

    expect(env.source).toBe("system")
    expect(env.pythonPath.length).toBeGreaterThan(0)
    expect(env.pythonPath).toContain("python")

    const { stdout, stderr } = await execFileAsync(env.pythonPath, ["--version"])
    expect(`${stdout}${stderr}`).toContain("Python 3")
  })

  it("renders a matplotlib plot to PNG", async () => {
    const outputPath = path.join(tempDirs[0]!, "plot.png")
    const script = [
      "import matplotlib.pyplot as plt",
      "plt.plot([1,2,3],[1,4,9])",
      "plt.title(\"Test\")",
    ].join("\n")

    const env = await detectPythonEnvironment(tempDirs[0]!)
    const result = await renderMatplotlib(
      {
        script,
        format: "png",
        pythonPath: env.pythonPath,
      },
      outputPath,
    )

    const stat = await fs.stat(outputPath)
    expect(result.filePath).toBe(outputPath)
    expect(result.format).toBe("png")
    expect(result.size).toBeGreaterThan(0)
    expect(stat.size).toBeGreaterThan(0)
  })

  it("renders successfully when script contains plt.show()", async () => {
    const outputPath = path.join(tempDirs[0]!, "plot-show.png")
    const script = [
      "import matplotlib.pyplot as plt",
      "plt.plot([1,2,3],[1,4,9])",
      "plt.title(\"Test\")",
      "plt.show()",
    ].join("\n")

    const env = await detectPythonEnvironment(tempDirs[0]!)
    const result = await renderMatplotlib(
      {
        script,
        format: "png",
        pythonPath: env.pythonPath,
      },
      outputPath,
    )

    const stat = await fs.stat(outputPath)
    expect(result.filePath).toBe(outputPath)
    expect(result.size).toBeGreaterThan(0)
    expect(stat.size).toBeGreaterThan(0)
  })
})
