import { execFile } from "node:child_process"
import * as fs from "node:fs/promises"
import * as os from "node:os"
import * as path from "node:path"
import { promisify } from "node:util"
import type { MatplotlibRenderOptions, MatplotlibRenderResult } from "../types.js"

const execFileAsync = promisify(execFile)

async function findPython(): Promise<string> {
  const candidates = ["python3", "python"]

  for (const cmd of candidates) {
    try {
      const { stdout } = await execFileAsync(cmd, ["--version"], { timeout: 5_000 })
      if (stdout.includes("Python 3")) return cmd
    } catch {
      continue
    }
  }

  throw new Error(
    "Python 3 not found. Ensure python3 is installed and available in PATH.",
  )
}

async function checkMatplotlib(pythonPath: string): Promise<boolean> {
  try {
    await execFileAsync(pythonPath, ["-c", "import matplotlib"], { timeout: 10_000 })
    return true
  } catch {
    return false
  }
}

function wrapScript(script: string, outputPath: string, format: string, dpi: number): string {
  const preamble = [
    "import matplotlib",
    "matplotlib.use('Agg')",
    "import matplotlib.pyplot as plt",
    "",
  ].join("\n")

  const postamble = [
    "",
    `plt.savefig(${JSON.stringify(outputPath)}, format=${JSON.stringify(format)}, dpi=${dpi}, bbox_inches='tight')`,
    "plt.close('all')",
  ].join("\n")

  const cleanedScript = script
    .replace(/plt\.show\(\)/g, "pass")
    .replace(/matplotlib\.use\([^)]+\)/g, "pass")

  return preamble + cleanedScript + postamble
}

export async function renderMatplotlib(
  options: MatplotlibRenderOptions,
  outputPath: string,
): Promise<MatplotlibRenderResult> {
  const format = options.format ?? "png"
  const dpi = options.dpi ?? 150
  const pythonPath = options.pythonPath ?? await findPython()

  const hasMpl = await checkMatplotlib(pythonPath)
  if (!hasMpl) {
    throw new Error(
      "matplotlib is not installed. Run: pip install matplotlib",
    )
  }

  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "openprism-mpl-"))
  const scriptFile = path.join(tmpDir, "plot.py")

  try {
    const wrappedScript = wrapScript(options.script, outputPath, format, dpi)
    await fs.writeFile(scriptFile, wrappedScript, "utf-8")

    const { stdout, stderr } = await execFileAsync(pythonPath, [scriptFile], {
      timeout: 60_000,
      cwd: tmpDir,
      env: {
        ...process.env,
        MPLBACKEND: "Agg",
      },
    })

    const stat = await fs.stat(outputPath)
    return {
      filePath: outputPath,
      format,
      size: stat.size,
      stdout,
      stderr,
    }
  } finally {
    await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {})
  }
}

export async function detectPythonEnvironment(projectDir: string): Promise<{
  pythonPath: string
  source: "venv" | "conda" | "system"
}> {
  const venvPython = path.join(projectDir, ".venv", "bin", "python")
  try {
    await fs.access(venvPython)
    return { pythonPath: venvPython, source: "venv" }
  } catch {
    // no .venv found
  }

  const condaPrefix = process.env["CONDA_PREFIX"]
  if (condaPrefix) {
    const condaPython = path.join(condaPrefix, "bin", "python")
    try {
      await fs.access(condaPython)
      return { pythonPath: condaPython, source: "conda" }
    } catch {
      // conda path doesn't resolve
    }
  }

  return { pythonPath: await findPython(), source: "system" }
}
