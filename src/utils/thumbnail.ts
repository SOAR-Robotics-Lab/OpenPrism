import { execFile } from "node:child_process"
import * as path from "node:path"
import { detectPythonEnvironment } from "../renderers/matplotlib-bridge.js"

/** Default thumbnail width in pixels. */
const THUMBNAIL_SIZE = 100

/** Quality for WebP output (0-100). */
const WEBP_QUALITY = 60

/**
 * Generate a small WebP thumbnail of an image and return it as a base64 string.
 *
 * Uses Python + Pillow (PIL) via a subprocess.  Pillow is available wherever
 * matplotlib is installed, so no additional dependency is needed.
 *
 * @returns base64-encoded WebP thumbnail, or `undefined` if generation fails
 */
export async function generateThumbnailBase64(
  imagePath: string,
  projectDir: string,
  size: number = THUMBNAIL_SIZE,
  quality: number = WEBP_QUALITY,
): Promise<string | undefined> {
  const absPath = path.isAbsolute(imagePath) ? imagePath : path.resolve(projectDir, imagePath)

  const script = [
    "import sys, io, base64",
    "from PIL import Image",
    `img = Image.open(${JSON.stringify(absPath)})`,
    `img.thumbnail((${size}, ${size}))`,
    "buf = io.BytesIO()",
    `img.save(buf, format='WEBP', quality=${quality})`,
    "sys.stdout.write(base64.b64encode(buf.getvalue()).decode())",
  ].join("\n")

  try {
    const { pythonPath } = await detectPythonEnvironment(projectDir)
    const result = await execPython(pythonPath, script)
    if (result && result.length > 0) {
      return result
    }
    return undefined
  } catch {
    return undefined
  }
}

function execPython(pythonPath: string, script: string): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(pythonPath, ["-c", script], { timeout: 10_000, maxBuffer: 512 * 1024 }, (error, stdout) => {
      if (error) {
        reject(error)
        return
      }
      resolve(stdout.trim())
    })
  })
}
