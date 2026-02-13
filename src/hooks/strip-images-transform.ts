import type { Hooks } from "@opencode-ai/plugin"

const HTML_LINKED_IMAGE_REGEX = /<a\s[^>]*href="([^"]*)"[^>]*>\s*<img\s[^>]*src="data:image\/[^"]*"[^>]*\/?\s*>\s*<\/a>/g
const HTML_STANDALONE_IMAGE_REGEX = /<img\s[^>]*src="data:image\/[^"]*"[^>]*\/?\s*>/g
const MD_CLICKABLE_DATA_IMAGE_REGEX = /\[!\[([^\]]*)\]\(data:image\/[^)]+\)\]\(([^)]+)\)/g
const MD_STANDALONE_DATA_IMAGE_REGEX = /!\[([^\]]*)\]\(data:image\/[^)]+\)/g

export function createStripImagesTransformHook(): NonNullable<Hooks["experimental.chat.messages.transform"]> {
  return async (_input, output) => {
    for (const msg of output.messages) {
      for (const part of msg.parts) {
        if (part.type !== "text") continue
        if (!part.text.includes("data:image/")) continue
        part.text = part.text
          .replace(HTML_LINKED_IMAGE_REGEX, (_match, href: string) => `[image](${href})`)
          .replace(HTML_STANDALONE_IMAGE_REGEX, (match) => {
            const altMatch = /alt="([^"]*)"/.exec(match)
            return `[${altMatch?.[1] || "image"}]`
          })
          .replace(MD_CLICKABLE_DATA_IMAGE_REGEX, "[$1]($2)")
          .replace(MD_STANDALONE_DATA_IMAGE_REGEX, "[$1]")
      }
    }
  }
}
