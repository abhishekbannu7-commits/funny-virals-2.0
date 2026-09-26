import type { AidePlan } from "@/lib/studio/server";
import { callHref, handoffHref, safeHttps, smsHref } from "./device";

export type Card = {
  say: string;
  detail?: string;
  note?: string;
  imageUrl?: string;
  href?: string;
  hrefLabel?: string;
  copy?: string;
};

const ACTIONS = ["answer", "call", "message", "open", "prompt", "image", "content", "studio"] as const;
const TARGETS = ["chatgpt", "claude", "whatsapp", "youtube", "instagram", "maps", "mail", "browser"] as const;

export type WireJob = {
  t: "job";
  id: string;
  say: string;
  action: (typeof ACTIONS)[number];
  phone?: string;
  body?: string;
  target?: (typeof TARGETS)[number];
  url?: string;
  prompt?: string;
  imageUrl?: string;
};

type PlanBits = Pick<AidePlan, "say" | "action" | "phone" | "body" | "target" | "url" | "prompt">;

export function cardFromPlan(plan: PlanBits, imageUrl?: string): Card {
  const safeImage = imageUrl && safeHttps(imageUrl) ? imageUrl : undefined;
  if (plan.action === "call" && plan.phone) {
    const href = callHref(plan.phone);
    return {
      say: plan.say,
      detail: plan.phone,
      href: href ?? undefined,
      hrefLabel: href ? "Open the dialer" : undefined,
      imageUrl: safeImage,
    };
  }
  if (plan.action === "message") {
    return {
      say: plan.say,
      detail: plan.body,
      href: smsHref(plan.phone, plan.body ?? ""),
      hrefLabel: "Open Messages",
      copy: plan.body,
      imageUrl: safeImage,
    };
  }
  if (plan.action === "open" || plan.action === "prompt") {
    const handoff = handoffHref(plan.target, plan.prompt || plan.body, plan.url, plan.phone);
    return {
      say: plan.say,
      detail: plan.prompt || plan.body,
      href: handoff?.href,
      hrefLabel: handoff?.label,
      copy: handoff?.copy ?? undefined,
      imageUrl: safeImage,
    };
  }
  if (plan.action === "content" || plan.action === "image") {
    return { say: plan.say, detail: plan.body, copy: plan.action === "content" ? plan.body : undefined, imageUrl: safeImage };
  }
  return { say: plan.say, detail: plan.body, imageUrl: safeImage };
}

export function planToWire(plan: AidePlan, imageUrl?: string): WireJob {
  return {
    t: "job",
    id: Math.random().toString(36).slice(2, 10),
    say: plan.say.slice(0, 160),
    action: plan.action,
    phone: plan.phone?.slice(0, 40),
    body: plan.body?.slice(0, 2000),
    target: plan.target,
    url: plan.url?.slice(0, 500),
    prompt: plan.prompt?.slice(0, 2000),
    imageUrl: imageUrl && safeHttps(imageUrl) ? imageUrl : undefined,
  };
}

function isTarget(value: unknown): value is WireJob["target"] {
  return typeof value === "string" && (TARGETS as readonly string[]).includes(value);
}

/** Rebuild actions locally. Never trust a href that arrived from the other device. */
export function parseWireJob(data: unknown): WireJob | null {
  if (!data || typeof data !== "object") return null;
  const row = data as Record<string, unknown>;
  if (row.t !== "job" || typeof row.say !== "string" || !row.say.trim()) return null;
  if (typeof row.action !== "string" || !(ACTIONS as readonly string[]).includes(row.action)) return null;
  return {
    t: "job",
    id: typeof row.id === "string" ? row.id.slice(0, 32) : "job",
    say: row.say.trim().slice(0, 160),
    action: row.action as WireJob["action"],
    phone: typeof row.phone === "string" ? row.phone.slice(0, 40) : undefined,
    body: typeof row.body === "string" ? row.body.slice(0, 2000) : undefined,
    target: isTarget(row.target) ? row.target : undefined,
    url: typeof row.url === "string" ? row.url.slice(0, 500) : undefined,
    prompt: typeof row.prompt === "string" ? row.prompt.slice(0, 2000) : undefined,
    imageUrl: typeof row.imageUrl === "string" && safeHttps(row.imageUrl) ? row.imageUrl : undefined,
  };
}

const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export function makeLinkCode() {
  const bytes = new Uint8Array(6);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => ALPHABET[b % ALPHABET.length]).join("");
}

export function normalizeCode(raw: string) {
  return raw.toUpperCase().replace(/[^A-Z2-9]/g, "").slice(0, 6);
}
