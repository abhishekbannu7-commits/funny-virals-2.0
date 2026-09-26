import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { durationForCount, type CutMode, type DurationSec, type Project, type Shot } from "@/lib/studio/types";

const durationSchema = z.union([z.literal(30), z.literal(60), z.literal(90), z.literal(120)]);

const lineSchema = z.object({
  t: z.coerce.number().min(0).max(9.5),
  line: z.string().trim().min(1).max(120),
});

const shotDraftSchema = z.object({
  action: z.string().trim().min(1).max(280),
  stillPrompt: z.string().trim().min(1).max(500),
  videoPrompt: z.string().trim().min(1).max(500),
  dialogue: z.array(lineSchema).max(2),
});

const planSchema = z.object({
  refused: z.boolean().optional(),
  reason: z.string().max(240).optional(),
  title: z.string().trim().min(1).max(80),
  style: z.string().trim().min(1).max(500),
  heroPrompt: z.string().trim().min(1).max(500),
  caption: z.string().trim().min(1).max(2200),
  hashtags: z.array(z.string().trim().min(1).max(40)).min(1).max(8),
  music: z.object({
    mood: z.string().trim().min(1).max(80),
    bpm: z.coerce.number().min(70).max(140),
  }),
  note: z.string().max(200).optional(),
  shots: z.array(shotDraftSchema).min(1).max(12),
});

const reviseShotSchema = shotDraftSchema.extend({
  id: z.string().min(1).max(80),
});

const reviseSchema = planSchema.extend({
  shots: z.array(reviseShotSchema).min(1).max(12),
});

type Ok<T> = { ok: true } & T;
type Err = { ok: false; error: string };

function apiKey() {
  return process.env.XAI_API_KEY;
}

async function readError(res: Response) {
  try {
    const body = (await res.json()) as { error?: { message?: string } | string };
    if (typeof body.error === "string") return body.error.slice(0, 180);
    if (body.error && typeof body.error === "object" && body.error.message) {
      return body.error.message.slice(0, 180);
    }
  } catch {
    /* ignore */
  }
  return `Request failed (${res.status})`;
}

function parseJson(text: string): unknown {
  const trimmed = text.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
  return JSON.parse(fenced?.[1] ?? trimmed);
}

function reasonOf(json: unknown) {
  if (!json || typeof json !== "object") return "That prompt can't be made into a reel.";
  const reason = (json as { reason?: unknown }).reason;
  return typeof reason === "string" && reason.trim() ? reason.slice(0, 240) : "That prompt can't be made into a reel.";
}

function refusedPlan(json: unknown) {
  return !!json && typeof json === "object" && (json as { refused?: unknown }).refused === true;
}

async function chatJson(system: string, user: string): Promise<Ok<{ json: unknown }> | Err> {
  const key = apiKey();
  if (!key) return { ok: false, error: "AI is not available in this environment." };

  const send = (withFormat: boolean) =>
    fetch("https://api.x.ai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${key}`,
      },
      body: JSON.stringify({
        model: "grok-4.5",
        temperature: 0.7,
        max_tokens: 3500,
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
        ...(withFormat ? { response_format: { type: "json_object" } } : {}),
      }),
    });

  let res = await send(true);
  if (res.status === 400) res = await send(false);
  if (!res.ok) return { ok: false, error: await readError(res) };
  const body = (await res.json()) as { choices?: { message?: { content?: string } }[] };
  const content = body.choices?.[0]?.message?.content ?? "";
  try {
    return { ok: true, json: parseJson(content) };
  } catch {
    return { ok: false, error: "The plan came back unreadable. Try again." };
  }
}

const DIRECTOR = `You are the director of a vertical comedy studio. Return JSON only.
Rules:
- Fictional characters only. Never depict a real named person. Never write sexual content involving anyone under 18. If the prompt asks for either, set refused true and give a short reason, and still include a dummy title.
- Each shot is exactly 10 seconds. Write the requested number of shots, no more.
- Dialogue is spoken inside the shot. t is seconds from the shot start, between 0 and 9. At most 2 short lines per shot.
- stillPrompt and heroPrompt must repeat the same character description so later images match. No text in the image.
- videoPrompt describes motion only, and repeats the character.
- style is one frozen look applied to every shot.
- hashtags have no # sign.
- caption is the post caption, under 400 characters, plus a line that the bit is fictional if a person appears.
- music.bpm is 70-140.`;

function shotsFromDraft(drafts: z.infer<typeof shotDraftSchema>[], ids?: string[]): Shot[] {
  return drafts.map((draft, index) => ({
    id: ids?.[index] ?? `shot-${crypto.randomUUID().slice(0, 8)}`,
    action: draft.action,
    stillPrompt: draft.stillPrompt,
    videoPrompt: draft.videoPrompt,
    dialogue: draft.dialogue,
    locked: false,
  }));
}

function projectFromPlan(
  plan: z.infer<typeof planSchema>,
  input: { prompt: string; mode: CutMode; durationSec: DurationSec; id?: string },
  ids?: string[],
): Project | Err {
  if (plan.refused) {
    return { ok: false, error: plan.reason || "That prompt can't be made into a reel." };
  }
  const expected = input.durationSec / 10;
  if (plan.shots.length !== expected) {
    return {
      ok: false,
      error: `The plan had ${plan.shots.length} shots, not ${expected}. Try again.`,
    };
  }
  const duration = durationForCount(plan.shots.length);
  if (!duration) return { ok: false, error: "Shot count is not a supported length." };
  return {
    id: input.id ?? `reel-${crypto.randomUUID().slice(0, 8)}`,
    title: plan.title,
    prompt: input.prompt,
    mode: input.mode,
    durationSec: duration,
    style: plan.style,
    heroPrompt: plan.heroPrompt,
    caption: plan.caption,
    hashtags: plan.hashtags.map((tag) => tag.replace(/^#/, "")),
    music: plan.music,
    shots: shotsFromDraft(plan.shots, ids),
  };
}

export const directReel = createServerFn({ method: "POST" })
  .validator((input: unknown) =>
    z
      .object({
        prompt: z.string().trim().min(8).max(800),
        durationSec: durationSchema,
        mode: z.enum(["cut", "chain"]),
      })
      .parse(input),
  )
  .handler(async ({ data }): Promise<{ ok: true; project: Project } | Err> => {
    const count = data.durationSec / 10;
    const result = await chatJson(
      DIRECTOR,
      `Prompt: ${data.prompt}\nMode: ${data.mode === "chain" ? "one continuous scene, each shot starts where the last ends" : "hard cuts, same character"}\nShots required: ${count}\nEach shot is 10 seconds. Total ${data.durationSec} seconds.`,
    );
    if (!result.ok) return result;
    if (refusedPlan(result.json)) return { ok: false, error: reasonOf(result.json) };
    const parsed = planSchema.safeParse(result.json);
    if (!parsed.success) return { ok: false, error: "The plan did not match the shot format. Try again." };
    const project = projectFromPlan(parsed.data, data);
    if ("ok" in project) return project;
    return { ok: true, project };
  });

const shotInputSchema = z.object({
  id: z.string().min(1).max(80),
  action: z.string().max(280),
  stillPrompt: z.string().max(500),
  videoPrompt: z.string().max(500),
  dialogue: z.array(lineSchema).max(2),
  locked: z.boolean(),
});

export const reviseReel = createServerFn({ method: "POST" })
  .validator((input: unknown) =>
    z
      .object({
        instruction: z.string().trim().min(2).max(400),
        project: z.object({
          id: z.string(),
          title: z.string(),
          prompt: z.string(),
          mode: z.enum(["cut", "chain"]),
          durationSec: durationSchema,
          style: z.string(),
          heroPrompt: z.string(),
          caption: z.string(),
          hashtags: z.array(z.string()),
          music: z.object({ mood: z.string(), bpm: z.number() }),
          shots: z.array(shotInputSchema).min(1).max(12),
        }),
      })
      .parse(input),
  )
  .handler(async ({ data }): Promise<{ ok: true; project: Project; note: string } | Err> => {
    const prev = data.project;
    const result = await chatJson(
      `${DIRECTOR}\nYou are revising an existing plan. Keep the same number of shots. Keep each shot id. Copy locked shots unchanged, word for word. Return JSON with the same fields plus id on every shot, and a short note.`,
      `Instruction: ${data.instruction}\nCurrent plan:\n${JSON.stringify(prev)}`,
    );
    if (!result.ok) return result;
    if (refusedPlan(result.json)) return { ok: false, error: reasonOf(result.json) };
    const parsed = reviseSchema.safeParse(result.json);
    if (!parsed.success) return { ok: false, error: "The edit did not match the shot format. Try again." };
    if (parsed.data.refused) {
      return { ok: false, error: parsed.data.reason || "That edit can't be made." };
    }
    if (parsed.data.shots.length !== prev.shots.length) {
      return { ok: false, error: "Edits keep the same number of shots. Change the length and generate again." };
    }

    const returned = new Map(parsed.data.shots.map((shot) => [shot.id, shot]));
    const shots: Shot[] = prev.shots.map((shot) => {
      if (shot.locked) return shot;
      const next = returned.get(shot.id);
      if (!next) return shot;
      return {
        id: shot.id,
        action: next.action,
        stillPrompt: next.stillPrompt,
        videoPrompt: next.videoPrompt,
        dialogue: next.dialogue,
        locked: false,
      };
    });

    const project: Project = {
      ...prev,
      title: parsed.data.title,
      style: parsed.data.style,
      heroPrompt: parsed.data.heroPrompt,
      caption: parsed.data.caption,
      hashtags: parsed.data.hashtags.map((tag) => tag.replace(/^#/, "")),
      music: parsed.data.music,
      shots,
    };
    return { ok: true, project, note: parsed.data.note ?? "Updated the plan." };
  });

export const generateStill = createServerFn({ method: "POST" })
  .validator((input: unknown) => z.object({ prompt: z.string().trim().min(8).max(800) }).parse(input))
  .handler(async ({ data }): Promise<{ ok: true; url: string } | Err> => {
    const key = apiKey();
    if (!key) return { ok: false, error: "AI is not available in this environment." };
    const res = await fetch("https://api.x.ai/v1/images/generations", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${key}`,
      },
      body: JSON.stringify({
        model: "grok-imagine-image-2.0",
        prompt: data.prompt,
        n: 1,
        aspect_ratio: "9:16",
        resolution: "1k",
        quality: "low",
        response_format: "url",
      }),
    });
    if (!res.ok) return { ok: false, error: await readError(res) };
    const body = (await res.json()) as { data?: { url?: string }[] };
    const url = body.data?.[0]?.url;
    if (!url) return { ok: false, error: "No still came back." };
    return { ok: true, url };
  });

export const startClip = createServerFn({ method: "POST" })
  .validator((input: unknown) =>
    z
      .object({
        prompt: z.string().trim().min(8).max(800),
        imageUrl: z.string().min(12).max(2_000_000),
      })
      .parse(input),
  )
  .handler(async ({ data }): Promise<{ ok: true; requestId: string } | Err> => {
    const key = apiKey();
    if (!key) return { ok: false, error: "AI is not available in this environment." };
    const res = await fetch("https://api.x.ai/v1/videos/generations", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${key}`,
      },
      body: JSON.stringify({
        model: "grok-imagine-video-1.5",
        prompt: data.prompt,
        duration: 10,
        image: { url: data.imageUrl },
      }),
    });
    if (!res.ok) return { ok: false, error: await readError(res) };
    const body = (await res.json()) as { request_id?: string };
    if (!body.request_id) return { ok: false, error: "Video start did not return an id." };
    return { ok: true, requestId: body.request_id };
  });

export const pollClip = createServerFn({ method: "POST" })
  .validator((input: unknown) => z.object({ requestId: z.string().min(4).max(200) }).parse(input))
  .handler(async ({ data }): Promise<{ ok: true; status: string; url?: string } | Err> => {
    const key = apiKey();
    if (!key) return { ok: false, error: "AI is not available in this environment." };
    const res = await fetch(`https://api.x.ai/v1/videos/${encodeURIComponent(data.requestId)}`, {
      headers: { Authorization: `Bearer ${key}` },
    });
    if (!res.ok) return { ok: false, error: await readError(res) };
    const body = (await res.json()) as { status?: string; video?: { url?: string } };
    const status = body.status ?? "pending";
    return { ok: true, status, url: body.video?.url };
  });

export const speakLine = createServerFn({ method: "POST" })
  .validator((input: unknown) => z.object({ text: z.string().trim().min(1).max(160) }).parse(input))
  .handler(async ({ data }): Promise<{ ok: true; audioBase64: string; mime: string } | Err> => {
    const key = apiKey();
    if (!key) return { ok: false, error: "AI is not available in this environment." };
    const res = await fetch("https://api.x.ai/v1/tts", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${key}`,
      },
      body: JSON.stringify({
        text: data.text,
        voice_id: "eve",
        language: "en",
      }),
    });
    if (!res.ok) return { ok: false, error: await readError(res) };
    const mime = res.headers.get("content-type") || "audio/mpeg";
    const audioBase64 = Buffer.from(await res.arrayBuffer()).toString("base64");
    if (!audioBase64) return { ok: false, error: "Voice came back empty." };
    return { ok: true, audioBase64, mime: mime.split(";")[0] || "audio/mpeg" };
  });

const aideSchema = z.object({
  refused: z.boolean().optional(),
  reason: z.string().max(240).optional(),
  say: z.string().trim().min(1).max(160),
  action: z.enum(["answer", "call", "message", "open", "prompt", "image", "content", "studio"]),
  phone: z.string().trim().max(40).optional(),
  body: z.string().trim().max(2000).optional(),
  target: z.enum(["chatgpt", "claude", "whatsapp", "youtube", "instagram", "maps", "mail", "browser"]).optional(),
  url: z.string().trim().max(500).optional(),
  prompt: z.string().trim().max(2000).optional(),
  imagePrompt: z.string().trim().max(500).optional(),
});

export type AidePlan = z.infer<typeof aideSchema>;

export const askAide = createServerFn({ method: "POST" })
  .validator((input: unknown) =>
    z
      .object({
        command: z.string().trim().min(2).max(800),
        history: z
          .array(
            z.object({
              who: z.enum(["you", "orin"]),
              text: z.string().trim().min(1).max(400),
            }),
          )
          .max(8)
          .optional(),
      })
      .parse(input),
  )
  .handler(async ({ data }): Promise<{ ok: true; plan: AidePlan } | Err> => {
    const history = (data.history ?? []).map((turn) => `${turn.who === "you" ? "User" : "Zoro"}: ${turn.text}`).join("\n");
    const user = history ? `Recent turns:\n${history}\n\nNow: ${data.command}` : data.command;
    const result = await chatJson(
      `You are Zoro, a calm personal aide on the user's own phone, tablet, or a screen linked to them. Return JSON only.
You do not place calls, send messages, or open apps yourself. You prepare one action the user will confirm with a tap.
Fields:
- say: one short sentence, under 160 characters, spoken aloud. Say what you prepared, never that it is already sent or dialed.
- action: answer | call | message | open | prompt | image | content | studio
- phone: digits for a call, SMS, or WhatsApp, include +country code when the user gave one
- body: SMS or email text, or the finished piece of writing
- target: chatgpt | claude | whatsapp | youtube | instagram | maps | mail | browser
- url: only for target browser, and only an https address the user named
- prompt: the exact prompt to hand to ChatGPT or Claude, a WhatsApp message, or a maps query
- imagePrompt: a picture description. Fictional subjects only. No real named person. No sexual content involving anyone under 18.
Use recent turns for follow-ups such as "text that" or "give that to Claude".
Use open when they name an app. WhatsApp is target whatsapp, with the message in prompt.
Use studio when they want the reel timeline. Use content for captions, scripts, posts, and notes. Use answer for questions.
If they ask for a crime, an account takeover, harassment of a real person, or sexual content involving a minor, set refused true, say a brief refusal, and use action answer.`,
      user,
    );
    if (!result.ok) return result;
    if (refusedPlan(result.json)) return { ok: false, error: reasonOf(result.json) };
    const parsed = aideSchema.safeParse(result.json);
    if (!parsed.success) return { ok: false, error: "I didn't catch a clear action. Try again." };
    if (parsed.data.refused) return { ok: false, error: parsed.data.reason || parsed.data.say };
    return { ok: true, plan: parsed.data };
  });
