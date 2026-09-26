import type { AidePlan } from "@/lib/studio/server";

/**
 * API-minimal + local-first.
 * Order: local processing, then this device's own handoffs, then a direct link
 * between two open screens, then an optional cloud provider.
 * Hosted models (xAI, OpenAI, Anthropic, Gemini, and the rest) are not on this path.
 * This web build cannot use Android package, settings, or notification APIs.
 * It opens the dialer, Messages, and https links, and the person confirms each one.
 */

function spoken(text: string) {
  return text.length > 160 ? `${text.slice(0, 157)}…` : text;
}

export type OfflineMiss = { plan: AidePlan; offerCloud: boolean };

/** Used only after every local engine misses. Does not call a network. */
export function offlineMiss(text: string): OfflineMiss {
  const t = text.trim().replace(/\s+/g, " ");
  if (/^(?:draw|generate|make|create|paint)\b/i.test(t) && /\b(?:image|picture|photo|still|poster)\b/i.test(t)) {
    return {
      offerCloud: false,
      plan: {
        say: spoken("Pictures are optional cloud, on the reel desk. Nothing is generated until you tap there."),
        action: "studio",
      },
    };
  }
  return {
    offerCloud: true,
    plan: {
      say: spoken(
        "This page has no language model. ChatGPT can take those words. Optional cloud stays idle until you turn it on and tap again.",
      ),
      action: "prompt",
      target: "chatgpt",
      prompt: t.slice(0, 2000),
    },
  };
}
