import * as fs from "node:fs/promises"

type TerminalProtocol = "kitty" | "iterm2" | "sixel" | "none"

function detectProtocol(): TerminalProtocol {
  const term = process.env["TERM"] ?? ""
  const termProgram = process.env["TERM_PROGRAM"] ?? ""
  const kittyPid = process.env["KITTY_PID"]

  if (kittyPid) return "kitty"
  if (termProgram.toLowerCase().includes("iterm")) return "iterm2"
  if (term.includes("sixel")) return "sixel"
  return "none"
}

function encodeKitty(data: Buffer, filePath: string): string {
  const b64 = data.toString("base64")
  const chunks: string[] = []
  const chunkSize = 4096
  for (let i = 0; i < b64.length; i += chunkSize) {
    const chunk = b64.slice(i, i + chunkSize)
    const more = i + chunkSize < b64.length ? 1 : 0
    if (i === 0) {
      chunks.push(`\x1b_Gf=100,a=T,m=${more};${chunk}\x1b\\`)
    } else {
      chunks.push(`\x1b_Gm=${more};${chunk}\x1b\\`)
    }
  }
  return chunks.join("") + `\n${filePath}\n`
}

function encodeIterm2(data: Buffer, filePath: string): string {
  const b64 = data.toString("base64")
  const name = Buffer.from(filePath).toString("base64")
  return `\x1b]1337;File=inline=1;name=${name};size=${data.length}:${b64}\x07\n`
}

export async function displayInTerminal(filePath: string): Promise<string> {
  const protocol = detectProtocol()

  if (protocol === "none") {
    return `[Image generated: ${filePath}]`
  }

  const data = await fs.readFile(filePath)

  switch (protocol) {
    case "kitty":
      return encodeKitty(data, filePath)
    case "iterm2":
      return encodeIterm2(data, filePath)
    case "sixel":
      return `[Sixel rendering not yet implemented. Image at: ${filePath}]`
  }
}

export function getPreviewLink(filePath: string, serverPort = 4096): string {
  const relative = filePath.replace(/.*\.opencode\//, "")
  return `http://localhost:${serverPort}/visuals/${relative}`
}
