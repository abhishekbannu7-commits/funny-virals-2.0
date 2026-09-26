import type { AidePlan } from "@/lib/studio/server";

const TARGETS: Record<string, NonNullable<AidePlan["target"]>> = {
  chatgpt: "chatgpt",
  claude: "claude",
  whatsapp: "whatsapp",
  youtube: "youtube",
  instagram: "instagram",
  maps: "maps",
  mail: "mail",
  gmail: "mail",
};

function spoken(text: string) {
  return text.length > 160 ? `${text.slice(0, 157)}…` : text;
}

/** Instant device actions. Natural language still goes to the model. */
export function quickPlan(text: string): AidePlan | null {
  const t = text.trim().replace(/\s+/g, " ");
  if (/^(what(?:'s| is) the time|what time is it)\??$/i.test(t)) {
    return {
      say: spoken(`It's ${new Date().toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}.`),
      action: "answer",
    };
  }
  if (/^(what(?:'s| is) (?:the )?date|what day is it|what's today)\??$/i.test(t)) {
    return {
      say: spoken(
        `Today is ${new Date().toLocaleDateString([], { weekday: "long", month: "long", day: "numeric" })}.`,
      ),
      action: "answer",
    };
  }
  const call = t.match(/^(?:call|dial|ring)\s+(\+?[\d][\d\s().-]{6,})\.?$/i);
  if (call) {
    const phone = call[1].trim();
    return { say: spoken(`Ready to call ${phone}. Tap to open the dialer.`), action: "call", phone };
  }
  const sms = t.match(/^(?:text|sms|message)\s+(\+?[\d][\d\s().-]{6,})\s+(.{1,500})$/i);
  if (sms) {
    return {
      say: "The text is ready. Nothing sends until you tap Open Messages.",
      action: "message",
      phone: sms[1].trim(),
      body: sms[2].trim(),
    };
  }
  const open = t.match(/^(?:open|launch|start)\s+(chatgpt|claude|whatsapp|youtube|instagram|maps|mail|gmail)\.?$/i);
  if (open) {
    const key = open[1].toLowerCase();
    const target = TARGETS[key];
    const label = key === "gmail" ? "Mail" : key.charAt(0).toUpperCase() + key.slice(1);
    return { say: spoken(`${label} is ready. Tap to open it.`), action: "open", target };
  }
  return null;
}
