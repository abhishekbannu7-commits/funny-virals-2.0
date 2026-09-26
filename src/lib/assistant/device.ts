export type DeviceKind = "phone" | "tablet" | "desktop";

export function detectDevice(): DeviceKind {
  const ua = navigator.userAgent;
  const coarse = window.matchMedia("(pointer: coarse)").matches;
  const narrow = window.innerWidth < 520;
  const shortSide = Math.min(window.screen.width, window.screen.height);
  if (/iPad|Tablet/i.test(ua) || (coarse && shortSide >= 600 && !/Mobile/i.test(ua) && !narrow)) return "tablet";
  if (narrow || coarse || /Mobile|Android|iPhone/i.test(ua)) return "phone";
  return "desktop";
}

function digits(phone: string) {
  return phone.replace(/[^\d+]/g, "");
}

export function callHref(phone: string) {
  const n = digits(phone);
  return n ? `tel:${n}` : null;
}

export function smsHref(phone: string | undefined, body: string) {
  const n = phone ? digits(phone) : "";
  const query = body ? `?&body=${encodeURIComponent(body)}` : "";
  return `sms:${n}${query}`;
}

export function safeHttps(url: string) {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:") return null;
    return parsed.toString();
  } catch {
    return null;
  }
}

export function handoffHref(
  target: string | undefined,
  prompt: string | undefined,
  url: string | undefined,
  phone?: string,
) {
  const text = prompt?.trim() ?? "";
  switch (target) {
    case "chatgpt":
      return { href: `https://chatgpt.com/?q=${encodeURIComponent(text)}`, label: "Open ChatGPT", copy: text };
    case "claude":
      return { href: "https://claude.ai/new", label: "Open Claude", copy: text };
    case "whatsapp": {
      const n = phone ? digits(phone).replace(/^\+/, "") : "";
      const href = n
        ? `https://wa.me/${n}?text=${encodeURIComponent(text)}`
        : `https://wa.me/?text=${encodeURIComponent(text)}`;
      return { href, label: "Open WhatsApp", copy: text || null };
    }
    case "youtube":
      return { href: "https://www.youtube.com", label: "Open YouTube", copy: null };
    case "instagram":
      return { href: "https://www.instagram.com", label: "Open Instagram", copy: null };
    case "maps":
      return {
        href: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(text || "nearby")}`,
        label: "Open Maps",
        copy: null,
      };
    case "mail":
      return { href: `mailto:?body=${encodeURIComponent(text)}`, label: "Open mail", copy: null };
    case "browser": {
      const href = url ? safeHttps(url) : null;
      return href ? { href, label: "Open link", copy: null } : null;
    }
    default:
      return null;
  }
}
