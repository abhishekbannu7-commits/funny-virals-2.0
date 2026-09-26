export type Task = { id: string; text: string; done: boolean };
export type Note = { id: string; text: string; at: number };
export type Fact = { key: string; value: string };
export type Place = { name: string; query: string };
export type Reminder = { id: string; text: string; at: number; fired: boolean };

export type Vault = {
  tasks: Task[];
  notes: Note[];
  facts: Fact[];
  places: Place[];
  reminders: Reminder[];
  quiet: boolean;
};

const KEY = "orin-vault-v1";

export function emptyVault(): Vault {
  return { tasks: [], notes: [], facts: [], places: [], reminders: [], quiet: false };
}

function clip(value: unknown, max: number) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function asTasks(value: unknown): Task[] {
  if (!Array.isArray(value)) return [];
  const out: Task[] = [];
  for (const row of value) {
    if (!row || typeof row !== "object") continue;
    const item = row as { id?: unknown; text?: unknown; done?: unknown };
    const text = clip(item.text, 140);
    if (typeof item.id !== "string" || !text) continue;
    out.push({ id: item.id.slice(0, 16), text, done: item.done === true });
    if (out.length >= 40) break;
  }
  return out;
}

function asNotes(value: unknown): Note[] {
  if (!Array.isArray(value)) return [];
  const out: Note[] = [];
  for (const row of value) {
    if (!row || typeof row !== "object") continue;
    const item = row as { id?: unknown; text?: unknown; at?: unknown };
    const text = clip(item.text, 240);
    if (typeof item.id !== "string" || !text) continue;
    out.push({ id: item.id.slice(0, 16), text, at: typeof item.at === "number" ? item.at : 0 });
    if (out.length >= 40) break;
  }
  return out;
}

function asFacts(value: unknown): Fact[] {
  if (!Array.isArray(value)) return [];
  const out: Fact[] = [];
  for (const row of value) {
    if (!row || typeof row !== "object") continue;
    const item = row as { key?: unknown; value?: unknown };
    const key = clip(item.key, 40);
    const fact = clip(item.value, 160);
    if (!key || !fact) continue;
    out.push({ key, value: fact });
    if (out.length >= 40) break;
  }
  return out;
}

function asPlaces(value: unknown): Place[] {
  if (!Array.isArray(value)) return [];
  const out: Place[] = [];
  for (const row of value) {
    if (!row || typeof row !== "object") continue;
    const item = row as { name?: unknown; query?: unknown };
    const name = clip(item.name, 24);
    const query = clip(item.query, 120);
    if (!name || !query) continue;
    out.push({ name, query });
    if (out.length >= 12) break;
  }
  return out;
}

function asReminders(value: unknown): Reminder[] {
  if (!Array.isArray(value)) return [];
  const out: Reminder[] = [];
  const now = Date.now();
  for (const row of value) {
    if (!row || typeof row !== "object") continue;
    const item = row as { id?: unknown; text?: unknown; at?: unknown; fired?: unknown };
    const text = clip(item.text, 140);
    if (typeof item.id !== "string" || !text || typeof item.at !== "number") continue;
    const fired = item.fired === true;
    if (fired && now - item.at > 86_400_000) continue;
    out.push({ id: item.id.slice(0, 16), text, at: item.at, fired });
    if (out.length >= 20) break;
  }
  return out;
}

export function loadVault(): Vault {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return emptyVault();
    const parsed = JSON.parse(raw) as Partial<Vault>;
    return {
      tasks: asTasks(parsed.tasks),
      notes: asNotes(parsed.notes),
      facts: asFacts(parsed.facts),
      places: asPlaces(parsed.places),
      reminders: asReminders(parsed.reminders),
      quiet: parsed.quiet === true,
    };
  } catch {
    return emptyVault();
  }
}

export function saveVault(vault: Vault) {
  try {
    localStorage.setItem(KEY, JSON.stringify(vault));
  } catch {
    /* private mode can refuse storage; the screen still updates */
  }
}

export function newId() {
  return Math.random().toString(36).slice(2, 10);
}
