/**
 * WebRTC signaling for the phone link. Rendezvous only (roster + SDP/ICE).
 * Device actions travel on the peer connection, not through here.
 *
 * With DATABASE_URL (deployed), signals go through Postgres so any instance
 * can serve any poll. Without it (local preview), a process-local map is used
 * so the server does not boot the embedded database.
 */
import { z } from "zod";
import type { PeerRow, RtcPollResponse, SignalRow } from "./p2p";

const ID = z.string().regex(/^[a-zA-Z0-9_-]{1,64}$/);
const signalSchema = z.object({
  op: z.literal("signal"),
  room: ID,
  from: ID,
  to: ID,
  kind: z.enum(["offer", "answer", "ice"]),
  payload: z.unknown().refine((v) => v !== undefined && JSON.stringify(v).length <= 32_768, {
    message: "payload too large",
  }),
});
const leaveSchema = z.object({ op: z.literal("leave"), room: ID, peer: ID });
const postSchema = z.discriminatedUnion("op", [signalSchema, leaveSchema]);

const PEER_TTL_MS = 30_000;
const SIGNAL_TTL_MS = 60_000;

type MemPeer = { room: string; id: string; name: string; seen: number };
type MemSignal = {
  id: number;
  room: string;
  to: string;
  from: string;
  kind: SignalRow["kind"];
  payload: unknown;
  at: number;
};

const memory = {
  peers: new Map<string, MemPeer>(),
  signals: [] as MemSignal[],
  nextId: 1,
};

function peerKey(room: string, id: string) {
  return `${room}\0${id}`;
}

function prune(now: number) {
  for (const [key, peer] of memory.peers) {
    if (now - peer.seen > PEER_TTL_MS) memory.peers.delete(key);
  }
  if (memory.signals.length > 400) {
    memory.signals = memory.signals.filter((row) => now - row.at < SIGNAL_TTL_MS);
  }
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });
}

function handleMemoryGet(url: URL): Response {
  const parsed = z
    .object({
      room: ID,
      peer: ID,
      name: z.string().max(64).default(""),
      since: z.coerce.number().int().min(0).default(0),
    })
    .safeParse({
      room: url.searchParams.get("room"),
      peer: url.searchParams.get("peer"),
      name: url.searchParams.get("name") ?? "",
      since: url.searchParams.get("since") ?? 0,
    });
  if (!parsed.success) return json({ error: "invalid query" }, 400);
  const { room, peer, name, since } = parsed.data;
  const now = Date.now();
  if (since === 0 || Math.random() < 0.02) prune(now);
  memory.peers.set(peerKey(room, peer), { room, id: peer, name, seen: now });
  const peers: PeerRow[] = [];
  for (const row of memory.peers.values()) {
    if (row.room !== room || now - row.seen > PEER_TTL_MS) continue;
    peers.push({ id: row.id, name: row.name });
    if (peers.length >= 32) break;
  }
  peers.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const signals = memory.signals
    .filter((row) => row.room === room && row.to === peer && row.id > since && now - row.at < SIGNAL_TTL_MS)
    .slice(0, 200);
  const body: RtcPollResponse = {
    peers,
    signals: signals.map((row) => ({ id: row.id, from: row.from, kind: row.kind, payload: row.payload })),
  };
  return json(body);
}

function handleMemoryPost(body: unknown): Response {
  const parsed = postSchema.safeParse(body);
  if (!parsed.success) return json({ error: "invalid request" }, 400);
  const msg = parsed.data;
  if (msg.op === "signal") {
    memory.signals.push({
      id: memory.nextId++,
      room: msg.room,
      to: msg.to,
      from: msg.from,
      kind: msg.kind,
      payload: msg.payload,
      at: Date.now(),
    });
    if (memory.signals.length > 800) memory.signals.splice(0, memory.signals.length - 400);
  } else {
    memory.peers.delete(peerKey(msg.room, msg.peer));
  }
  return json({ ok: true });
}

async function handleMemory(request: Request): Promise<Response> {
  if (request.method === "GET") return handleMemoryGet(new URL(request.url));
  if (request.method === "POST") {
    try {
      return handleMemoryPost(await request.json());
    } catch {
      return json({ error: "invalid JSON" }, 400);
    }
  }
  return json({ error: "method not allowed" }, 405);
}

export async function handleSignaling(request: Request): Promise<Response> {
  try {
    if (process.env.DATABASE_URL?.trim()) {
      const db = await import("./signaling-db.server");
      return db.handleSignaling(request);
    }
    return await handleMemory(request);
  } catch (error) {
    console.error("[rtc] signaling error:", error);
    return json({ error: "signaling failed" }, 500);
  }
}
