import type { Hooks } from "@opencode-ai/plugin"

const DATA_IMAGE_REGEX = /!\[([^\]]*)\]\(data:image\/[^)]+\)/g

const DATA_IMAGE_PLACEHOLDER = "[🖼 $1]"

export function createStripImagesTransformHook(): NonNullable<Hooks["experimental.chat.messages.transform"]> {
  return async (_input, output) => {
    for (const msg of output.messages) {
      for (const part of msg.parts) {
        if (part.type !== "text") continue
        if (!part.text.includes("data:image/")) continue
        part.text = part.text.replace(DATA_IMAGE_REGEX, DATA_IMAGE_PLACEHOLDER)
      }
    }
  }
}
