import type { AidePlan } from "@/lib/studio/server";
import { quickPlan } from "@/lib/assistant/quick";
import { newId, type Fact, type Place, type Reminder, type Vault } from "@/lib/assistant/vault";

export type LocalHit = { plan: AidePlan; vault: Vault; notify: boolean };

function spoken(text: string) {
  return text.length > 160 ? `${text.slice(0, 157)}…` : text;
}

function tidy(text: string) {
  return text.trim().replace(/\s+/g, " ");
}

function keyOf(raw: string) {
  return raw.trim().replace(/^(?:the|my)\s+/i, "").slice(0, 40);
}

function openTasks(vault: Vault) {
  return vault.tasks.filter((task) => !task.done);
}

function upcoming(vault: Vault, now: number) {
  return vault.reminders.filter((item) => !item.fired && item.at > now).sort((a, b) => a.at - b.at);
}

function formatWhen(at: number, now: Date) {
  const sameDay = new Date(at).toDateString() === now.toDateString();
  const clock = new Date(at).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  return sameDay ? clock : `${new Date(at).toLocaleDateString([], { weekday: "short" })} ${clock}`;
}

function durationMs(fragment: string) {
  const t = fragment.trim().toLowerCase();
  if (t === "half an hour" || t === "half hour") return 30 * 60 * 1000;
  if (t === "an hour" || t === "one hour") return 60 * 60 * 1000;
  let ms = 0;
  let matched = false;
  const re = /(\d+(?:\.\d+)?)\s*(hours?|hrs?|minutes?|mins?|seconds?|secs?)/gi;
  for (const match of t.matchAll(re)) {
    matched = true;
    const n = Number(match[1]);
    const unit = match[2].toLowerCase();
    if (unit.startsWith("h")) ms += n * 3_600_000;
    else if (unit.startsWith("m")) ms += n * 60_000;
    else ms += n * 1000;
  }
  if (!matched || ms < 1000 || ms > 24 * 3_600_000) return null;
  return ms;
}

function clockAt(fragment: string, now: Date) {
  const match = fragment.trim().match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm)?$/i);
  if (!match) return null;
  let hour = Number(match[1]);
  const minute = Number(match[2] ?? 0);
  const meridiem = match[3]?.toLowerCase();
  if (minute > 59 || hour > 23) return null;
  if (meridiem === "pm" && hour < 12) hour += 12;
  if (meridiem === "am" && hour === 12) hour = 0;
  if (meridiem) {
    if (hour > 23) return null;
    const due = new Date(now);
    due.setSeconds(0, 0);
    due.setHours(hour, minute, 0, 0);
    if (due.getTime() <= now.getTime()) due.setDate(due.getDate() + 1);
    return due.getTime();
  }
  const base = hour % 24;
  const candidates = [base];
  if (base <= 12) candidates.push((base % 12) + 12);
  let best: number | null = null;
  for (const h of candidates) {
    if (h > 23) continue;
    const due = new Date(now);
    due.setSeconds(0, 0);
    due.setHours(h, minute, 0, 0);
    let at = due.getTime();
    if (at <= now.getTime()) at += 86_400_000;
    if (best === null || at < best) best = at;
  }
  return best;
}

function pushReminder(vault: Vault, text: string, at: number): Vault {
  const reminder: Reminder = { id: newId(), text, at, fired: false };
  const reminders = [...vault.reminders.filter((item) => !item.fired || Date.now() - item.at < 86_400_000), reminder].slice(-20);
  return { ...vault, reminders };
}

function rememberFact(vault: Vault, key: string, value: string): Vault {
  const facts = vault.facts.filter((fact) => fact.key.toLowerCase() !== key.toLowerCase());
  facts.push({ key, value });
  return { ...vault, facts: facts.slice(-40) };
}

function rememberPlace(vault: Vault, name: string, query: string): Vault {
  const places = vault.places.filter((place) => place.name.toLowerCase() !== name.toLowerCase());
  places.push({ name, query });
  return { ...vault, places: places.slice(-12) };
}

function phoneFor(facts: Fact[], name: string) {
  const needle = name.toLowerCase();
  const fact = facts.find((item) => item.key.toLowerCase().includes(needle) && /\+?\d[\d\s().-]{6,}/.test(item.value));
  if (!fact) return null;
  const match = fact.value.match(/\+?\d[\d\s().-]{6,}/);
  return match ? match[0].trim() : null;
}

function placeFor(places: Place[], name: string) {
  return places.find((place) => place.name.toLowerCase() === name.toLowerCase()) ?? null;
}

const UNIT: Record<string, string> = {
  km: "km",
  kilometer: "km",
  kilometers: "km",
  mi: "mi",
  mile: "mi",
  miles: "mi",
  kg: "kg",
  kilogram: "kg",
  kilograms: "kg",
  lb: "lb",
  lbs: "lb",
  pound: "lb",
  pounds: "lb",
  c: "c",
  celsius: "c",
  f: "f",
  fahrenheit: "f",
  m: "m",
  meter: "m",
  meters: "m",
  ft: "ft",
  foot: "ft",
  feet: "ft",
};

function convert(n: number, from: string, to: string) {
  const table: Record<string, (value: number) => number> = {
    "km>mi": (value) => value * 0.621371,
    "mi>km": (value) => value / 0.621371,
    "kg>lb": (value) => value * 2.20462,
    "lb>kg": (value) => value / 2.20462,
    "c>f": (value) => (value * 9) / 5 + 32,
    "f>c": (value) => ((value - 32) * 5) / 9,
    "m>ft": (value) => value * 3.28084,
    "ft>m": (value) => value / 3.28084,
  };
  const fn = table[`${from}>${to}`];
  return fn ? fn(n) : null;
}

function formatNum(n: number) {
  if (!Number.isFinite(n)) return null;
  const rounded = Math.round(n * 1_000_000) / 1_000_000;
  return String(rounded);
}

function evaluate(expr: string) {
  const s = expr.replace(/\s+/g, "");
  if (!s || s.length > 80 || !/^[\d.+\-*/()%]+$/.test(s)) return null;
  let i = 0;
  const peek = () => s[i];
  function parseExpr(): number | null {
    let left = parseTerm();
    if (left === null) return null;
    while (peek() === "+" || peek() === "-") {
      const op = s[i++];
      const right = parseTerm();
      if (right === null) return null;
      left = op === "+" ? left + right : left - right;
    }
    return left;
  }
  function parseTerm(): number | null {
    let left = parseFactor();
    if (left === null) return null;
    while (peek() === "*" || peek() === "/") {
      const op = s[i++];
      const right = parseFactor();
      if (right === null || (op === "/" && right === 0)) return null;
      left = op === "*" ? left * right : left / right;
    }
    return left;
  }
  function parseFactor(): number | null {
    if (peek() === "+") {
      i += 1;
      return parseFactor();
    }
    if (peek() === "-") {
      i += 1;
      const value = parseFactor();
      return value === null ? null : -value;
    }
    if (peek() === "(") {
      i += 1;
      const value = parseExpr();
      if (value === null || peek() !== ")") return null;
      i += 1;
      if (peek() === "%") {
        i += 1;
        return value / 100;
      }
      return value;
    }
    const start = i;
    while (peek() && /[\d.]/.test(peek())) i += 1;
    if (i === start) return null;
    const n = Number(s.slice(start, i));
    if (!Number.isFinite(n)) return null;
    if (peek() === "%") {
      i += 1;
      return n / 100;
    }
    return n;
  }
  const result = parseExpr();
  if (result === null || i !== s.length || !Number.isFinite(result)) return null;
  return result;
}

function tryMath(t: string) {
  const percent = t.match(/^what(?:'s| is)\s+(\d+(?:\.\d+)?)\s*(?:%|percent)\s+of\s+(\d+(?:\.\d+)?)\??$/i);
  if (percent) return (Number(percent[1]) / 100) * Number(percent[2]);
  const prefixed = t.match(/^(?:what(?:'s| is)|calculate|compute)\s+(.+?)\??$/i);
  const bare = /^[\d\s.()+/%*-]+$/.test(t) && /[*/%]/.test(t);
  const spaced = /\d\s+[+\-]\s+\d/.test(t) && /^[\d\s.()+/%*-]+$/.test(t);
  if (!prefixed && !bare && !spaced) return null;
  const raw = (prefixed ? prefixed[1] : t)
    .replace(/\bplus\b/gi, "+")
    .replace(/\bminus\b/gi, "-")
    .replace(/\btimes\b/gi, "*")
    .replace(/\bdivided by\b/gi, "/")
    .replace(/\bpercent\b/gi, "%");
  return evaluate(raw);
}

function tryConvert(t: string) {
  const direct = t.match(/^(?:convert\s+)?(-?\d+(?:\.\d+)?)\s*°?\s*([a-z]+)\s+(?:to|in|into)\s+°?\s*([a-z]+)\??$/i);
  const flipped = t.match(/^how many\s+([a-z]+)\s+(?:is|are|in)\s+(-?\d+(?:\.\d+)?)\s*°?\s*([a-z]+)\??$/i);
  const amount = direct ? Number(direct[1]) : flipped ? Number(flipped[2]) : null;
  const fromName = direct ? direct[2] : flipped ? flipped[3] : "";
  const toName = direct ? direct[3] : flipped ? flipped[1] : "";
  if (amount === null) return null;
  const from = UNIT[fromName.toLowerCase()];
  const to = UNIT[toName.toLowerCase()];
  if (!from || !to) return null;
  return { value: convert(amount, from, to), from, to, amount };
}

function answer(say: string, body?: string): AidePlan {
  return body ? { say: spoken(say), action: "answer", body } : { say: spoken(say), action: "answer" };
}

export function applyLocal(text: string, vault: Vault, now = new Date()): LocalHit | null {
  const t = tidy(text);
  const quick = quickPlan(t);
  if (quick) return { plan: quick, vault, notify: false };

  if (/^(?:be quiet|stop talking|quiet mode)$/i.test(t)) {
    return { plan: answer("I'll stay quiet until you say I can talk."), vault: { ...vault, quiet: true }, notify: false };
  }
  if (/^(?:you can talk|speak up|talk to me)$/i.test(t)) {
    return { plan: answer("Voice is back on."), vault: { ...vault, quiet: false }, notify: false };
  }

  if (/^(?:good morning|brief me|briefing|what should i know)$/i.test(t)) {
    const tasks = openTasks(vault).slice(0, 3);
    const next = upcoming(vault, now.getTime())[0];
    const time = now.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
    const parts = [`It's ${time}.`];
    parts.push(tasks.length ? `${openTasks(vault).length} open: ${tasks.map((task) => task.text).join(", ")}.` : "No open tasks.");
    if (next) parts.push(`Next is ${formatWhen(next.at, now)}: ${next.text}.`);
    return { plan: answer(parts.join(" ")), vault, notify: false };
  }

  const addTask = t.match(/^(?:add task|add a task|todo|task)\s+(.{1,140})$/i);
  if (addTask) {
    const text = addTask[1].trim();
    const tasks = [...vault.tasks, { id: newId(), text, done: false }].slice(-40);
    return { plan: answer(`Added "${text}".`), vault: { ...vault, tasks }, notify: false };
  }
  if (/^(?:my tasks|what(?:'s| is) on my list|show (?:my )?tasks|open tasks)$/i.test(t)) {
    const tasks = openTasks(vault);
    if (!tasks.length) return { plan: answer("Your list is clear."), vault, notify: false };
    const body = tasks.map((task, index) => `${index + 1}. ${task.text}`).join("\n");
    return { plan: answer(`${tasks.length} open.`, body), vault, notify: false };
  }

  const doneNumber = t.match(/^(?:done|finish|complete|check)(?:\s+task)?\s+(\d+)$/i);
  if (doneNumber) {
    const index = Number(doneNumber[1]) - 1;
    const tasks = openTasks(vault);
    const target = tasks[index];
    if (!target) return { plan: answer("That task number isn't on the list."), vault, notify: false };
    return {
      plan: answer(`Checked off "${target.text}".`),
      vault: { ...vault, tasks: vault.tasks.map((task) => (task.id === target.id ? { ...task, done: true } : task)) },
      notify: false,
    };
  }
  const doneText = t.match(/^(?:done|finish|complete|check)\s+(.{1,140})$/i);
  if (doneText && !/^\d+$/.test(doneText[1])) {
    const needle = doneText[1].toLowerCase();
    const target = openTasks(vault).find((task) => task.text.toLowerCase().includes(needle));
    if (!target) return { plan: answer("I don't see that on the open list."), vault, notify: false };
    return {
      plan: answer(`Checked off "${target.text}".`),
      vault: { ...vault, tasks: vault.tasks.map((task) => (task.id === target.id ? { ...task, done: true } : task)) },
      notify: false,
    };
  }
  if (/^clear done(?: tasks)?$/i.test(t)) {
    return {
      plan: answer("Cleared finished tasks."),
      vault: { ...vault, tasks: vault.tasks.filter((task) => !task.done) },
      notify: false,
    };
  }

  const note = t.match(/^(?:note|take a note|make a note)\s+(.{1,240})$/i);
  if (note) {
    const notes = [...vault.notes, { id: newId(), text: note[1].trim(), at: now.getTime() }].slice(-40);
    return { plan: answer("Noted, on this device only."), vault: { ...vault, notes }, notify: false };
  }
  if (/^(?:read|show) (?:my )?notes$/i.test(t)) {
    if (!vault.notes.length) return { plan: answer("No notes yet."), vault, notify: false };
    const body = vault.notes
      .slice(-8)
      .map((item, index) => `${index + 1}. ${item.text}`)
      .join("\n");
    return { plan: answer(`You have ${vault.notes.length} notes.`, body), vault, notify: false };
  }
  const forgetNote = t.match(/^forget note (\d+)$/i);
  if (forgetNote) {
    const index = Number(forgetNote[1]) - 1;
    const visible = vault.notes.slice(-8);
    const target = visible[index];
    if (!target) return { plan: answer("That note isn't in the last eight."), vault, notify: false };
    return {
      plan: answer("Forgot that note."),
      vault: { ...vault, notes: vault.notes.filter((item) => item.id !== target.id) },
      notify: false,
    };
  }

  const remember = t.match(/^remember (?:that )?(.{1,80}?) is (.{1,160})$/i);
  if (remember) {
    const key = keyOf(remember[1]);
    const value = remember[2].trim();
    if (!key) return null;
    let next = rememberFact(vault, key, value);
    if (/^(home|work|office|gym|school)$/i.test(key)) next = rememberPlace(next, key, value);
    return { plan: answer(`I'll remember ${key} on this device.`), vault: next, notify: false };
  }
  if (/^what do you remember\??$/i.test(t)) {
    if (!vault.facts.length) return { plan: answer("I haven't remembered anything here yet."), vault, notify: false };
    const body = vault.facts.map((fact) => `${fact.key}: ${fact.value}`).join("\n");
    return { plan: answer(`I have ${vault.facts.length} saved facts.`, body), vault, notify: false };
  }
  const about = t.match(/^what do you (?:remember|know) about (.+)\??$/i);
  if (about) {
    const needle = about[1].toLowerCase();
    const hits = vault.facts.filter((fact) => fact.key.toLowerCase().includes(needle) || fact.value.toLowerCase().includes(needle));
    if (!hits.length) return { plan: answer(`I don't have anything about ${about[1]}.`), vault, notify: false };
    return { plan: answer(hits.map((fact) => `${fact.key} is ${fact.value}.`).join(" ")), vault, notify: false };
  }

  const savePlace = t.match(/^save ([a-z][\w' ]{0,24}) as (.{2,120})$/i);
  if (savePlace) {
    const name = keyOf(savePlace[1]);
    return {
      plan: answer(`Saved ${name}. Say navigate ${name} when you want the map.`),
      vault: rememberPlace(vault, name, savePlace[2].trim()),
      notify: false,
    };
  }

  const go = t.match(/^(?:navigate|directions|take me)(?: to)? ([a-z][\w' ]{0,40})\.?$/i);
  if (go) {
    const name = go[1].trim();
    const saved = placeFor(vault.places, name) ?? placeFor(vault.places, keyOf(name));
    const query = saved?.query ?? name;
    return {
      plan: {
        say: spoken(saved ? `Map ready for ${saved.name}.` : `Map ready for ${name}.`),
        action: "open",
        target: "maps",
        prompt: query,
      },
      vault,
      notify: false,
    };
  }

  const namedCall = t.match(/^(?:call|dial|ring)\s+([a-z][\w'.-]{0,24}(?:\s+[a-z][\w'.-]{0,24})?)\.?$/i);
  if (namedCall) {
    const phone = phoneFor(vault.facts, namedCall[1]);
    if (phone) {
      return {
        plan: { say: spoken(`Ready to call ${namedCall[1]}. Tap to open the dialer.`), action: "call", phone },
        vault,
        notify: false,
      };
    }
  }
  const namedText = t.match(/^(?:text|sms|message)\s+([a-z][\w'.-]{0,24})\s+(.{1,240})$/i);
  if (namedText) {
    const phone = phoneFor(vault.facts, namedText[1]);
    if (phone) {
      return {
        plan: {
          say: "The text is ready. Nothing sends until you tap Open Messages.",
          action: "message",
          phone,
          body: namedText[2].trim(),
        },
        vault,
        notify: false,
      };
    }
  }

  const timer = t.match(/^(?:set a timer|set timer|start a timer|timer)(?: for)?\s+(.+)$/i);
  if (timer) {
    const ms = durationMs(timer[1]);
    if (!ms) return { plan: answer("Say a timer like 5 minutes or 1 hour."), vault, notify: false };
    const at = now.getTime() + ms;
    return {
      plan: answer(`Timer set. I'll ping while this page is open.`),
      vault: pushReminder(vault, "Timer", at),
      notify: true,
    };
  }
  const remindIn = t.match(/^remind me in\s+(.+?)\s+to\s+(.{1,120})$/i);
  if (remindIn) {
    const ms = durationMs(remindIn[1]);
    if (!ms) return { plan: answer("Say the wait like 20 minutes or 1 hour."), vault, notify: false };
    return {
      plan: answer(`I'll remind you to ${remindIn[2].trim()} while this page is open.`),
      vault: pushReminder(vault, remindIn[2].trim(), now.getTime() + ms),
      notify: true,
    };
  }
  const remindAt = t.match(/^remind me at\s+(\d{1,2}(?::\d{2})?\s*(?:am|pm)?)\s+to\s+(.{1,120})$/i);
  if (remindAt) {
    const at = clockAt(remindAt[1], now);
    if (!at) return { plan: answer("Say a time like 7:30 pm."), vault, notify: false };
    return {
      plan: answer(`Set for ${formatWhen(at, now)}. It rings while Orin is open.`),
      vault: pushReminder(vault, remindAt[2].trim(), at),
      notify: true,
    };
  }
  if (/^(?:my reminders|what(?:'s| is) next|next reminder)$/i.test(t)) {
    const next = upcoming(vault, now.getTime())[0];
    if (!next) return { plan: answer("Nothing scheduled."), vault, notify: false };
    return { plan: answer(`Next is ${formatWhen(next.at, now)}: ${next.text}.`), vault, notify: false };
  }
  if (/^cancel (?:all )?(?:timers|reminders)$/i.test(t)) {
    return {
      plan: answer("Cleared upcoming reminders."),
      vault: { ...vault, reminders: vault.reminders.filter((item) => item.fired) },
      notify: false,
    };
  }
  const cancelOne = t.match(/^cancel reminder (\d+)$/i);
  if (cancelOne) {
    const index = Number(cancelOne[1]) - 1;
    const list = upcoming(vault, now.getTime());
    const target = list[index];
    if (!target) return { plan: answer("That reminder isn't upcoming."), vault, notify: false };
    return {
      plan: answer("Cancelled."),
      vault: { ...vault, reminders: vault.reminders.filter((item) => item.id !== target.id) },
      notify: false,
    };
  }

  const forget = t.match(/^forget (?:that |about )?(.{1,40})$/i);
  if (forget && !/^note\b/i.test(forget[1])) {
    const needle = keyOf(forget[1]).toLowerCase();
    const facts = vault.facts.filter((fact) => !fact.key.toLowerCase().includes(needle));
    const places = vault.places.filter((place) => place.name.toLowerCase() !== needle);
    if (facts.length === vault.facts.length && places.length === vault.places.length) {
      return { plan: answer(`I didn't have ${forget[1]} saved.`), vault, notify: false };
    }
    return { plan: answer(`Forgot ${forget[1]}.`), vault: { ...vault, facts, places }, notify: false };
  }

  if (/^(?:help|what can you do|what do you do|capabilities)\??$/i.test(t)) {
    return {
      plan: answer(
        "Offline: tasks, notes, timers, math, memory, and apps you tap.",
        [
          "Tasks, notes, reminders, and facts stay in this browser.",
          "Math, percentages, dates, and unit conversion stay here.",
          "Call, text, Maps, ChatGPT, Claude, WhatsApp, YouTube, Instagram, and Mail open only after you tap.",
          "This page cannot change Wi-Fi, Bluetooth, system alarms, or read other apps' notifications.",
          "Optional cloud is a separate switch. It does nothing until you turn it on and tap again.",
        ].join("\n"),
      ),
      vault,
      notify: false,
    };
  }

  if (/^(?:open )?(?:the )?(?:reel desk|studio)\.?$/i.test(t)) {
    return {
      plan: {
        say: "Reel desk is open. Cloud buttons there are labeled and stay idle until you tap.",
        action: "studio",
      },
      vault,
      notify: false,
    };
  }

  if (
    /^(?:turn|switch|set|change|enable|disable|toggle)\b.+\b(?:wi-?fi|bluetooth|brightness|volume|airplane|do not disturb|dnd|system alarm)\b/i.test(
      t,
    ) ||
    /^(?:open )?(?:settings|notifications)\.?$/i.test(t)
  ) {
    return {
      plan: answer("This page can't change phone settings or read other apps' notifications. Use the phone's own Settings."),
      vault,
      notify: false,
    };
  }

  const inDays = t.match(/^(?:what day is it|what(?:'s| is) the date) in (\d{1,4}) days?\??$/i);
  if (inDays) {
    const n = Number(inDays[1]);
    if (n > 3650) return { plan: answer("I only look ahead ten years."), vault, notify: false };
    const due = new Date(now);
    due.setDate(due.getDate() + n);
    const label = due.toLocaleDateString([], { weekday: "long", month: "long", day: "numeric", year: "numeric" });
    return { plan: answer(`In ${n} days it is ${label}.`), vault, notify: false };
  }

  const find = t.match(/^(?:search|find)(?: in)? (?:my )?(notes|tasks|memory|facts)(?: for)?\s+(.{1,80})$/i);
  if (find) {
    const kind = find[1].toLowerCase();
    const needle = find[2].toLowerCase();
    if (kind === "notes") {
      const hits = vault.notes.filter((item) => item.text.toLowerCase().includes(needle));
      if (!hits.length) return { plan: answer("No notes match."), vault, notify: false };
      return {
        plan: answer(`${hits.length} notes match.`, hits.slice(-8).map((item) => item.text).join("\n")),
        vault,
        notify: false,
      };
    }
    if (kind === "tasks") {
      const hits = openTasks(vault).filter((item) => item.text.toLowerCase().includes(needle));
      if (!hits.length) return { plan: answer("No open tasks match."), vault, notify: false };
      return { plan: answer(`${hits.length} tasks match.`, hits.map((item) => item.text).join("\n")), vault, notify: false };
    }
    const hits = vault.facts.filter(
      (item) => item.key.toLowerCase().includes(needle) || item.value.toLowerCase().includes(needle),
    );
    if (!hits.length) return { plan: answer("Nothing saved matches."), vault, notify: false };
    return {
      plan: answer(`${hits.length} remembered.`, hits.map((item) => `${item.key}: ${item.value}`).join("\n")),
      vault,
      notify: false,
    };
  }

  const shout = t.match(/^(?:uppercase|upper case|shout)\s+(.{1,400})$/i);
  if (shout) {
    const body = shout[1].toUpperCase();
    return { plan: answer(body.length > 140 ? "Uppercase is ready." : body, body.length > 140 ? body : undefined), vault, notify: false };
  }
  const lower = t.match(/^(?:lowercase|lower case)\s+(.{1,400})$/i);
  if (lower) {
    const body = lower[1].toLowerCase();
    return { plan: answer(body.length > 140 ? "Lowercase is ready." : body, body.length > 140 ? body : undefined), vault, notify: false };
  }
  const titled = t.match(/^title case\s+(.{1,400})$/i);
  if (titled) {
    const body = titled[1].replace(/\w\S*/g, (word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase());
    return { plan: answer(body.length > 140 ? "Title case is ready." : body, body.length > 140 ? body : undefined), vault, notify: false };
  }
  const words = t.match(/^(?:count words|word count|how many words)(?: in| of| are in)?\s+(.{1,400})$/i);
  if (words) {
    const count = words[1].trim().split(/\s+/).filter(Boolean).length;
    return { plan: answer(`${count} ${count === 1 ? "word" : "words"}.`), vault, notify: false };
  }

  const converted = tryConvert(t);
  if (converted?.value !== null && converted) {
    const shown = formatNum(converted.value);
    if (shown) {
      return { plan: answer(`${converted.amount} ${converted.from} is ${shown} ${converted.to}.`), vault, notify: false };
    }
  }

  const math = tryMath(t);
  if (math !== null) {
    const shown = formatNum(math);
    if (shown) return { plan: answer(shown), vault, notify: false };
  }

  return null;
}

export async function senseDevice(text: string): Promise<AidePlan | null> {
  const t = tidy(text);
  if (/^(?:where am i|what(?:'s| is) my location)\??$/i.test(t)) {
    if (!navigator.geolocation) return answer("This browser has no location.");
    return new Promise((resolve) => {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const query = `${pos.coords.latitude.toFixed(5)}, ${pos.coords.longitude.toFixed(5)}`;
          resolve({ say: "Here's this device on the map. Tap to open it.", action: "open", target: "maps", prompt: query });
        },
        () => resolve(answer("Location was blocked. You can still say navigate and a place.")),
        { enableHighAccuracy: false, timeout: 8000, maximumAge: 60_000 },
      );
    });
  }
  if (/^(?:battery|how(?:'s| is) (?:the |my )?battery|battery level)\??$/i.test(t)) {
    const batteryApi = (navigator as Navigator & { getBattery?: () => Promise<{ level: number; charging: boolean }> }).getBattery;
    if (!batteryApi) return answer("This browser doesn't share the battery level.");
    try {
      const battery = await batteryApi();
      const pct = Math.round(battery.level * 100);
      return answer(battery.charging ? `Battery is ${pct}% and charging.` : `Battery is ${pct}%.`);
    } catch {
      return answer("Battery status was blocked.");
    }
  }
  if (/^what(?:'s| is) on my clipboard\??$/i.test(t)) {
    try {
      const clip = (await navigator.clipboard.readText()).trim();
      if (!clip) return answer("The clipboard is empty.");
      return answer("Here's the clipboard.", clip.slice(0, 500));
    } catch {
      return answer("Clipboard read was blocked.");
    }
  }
  return null;
}

export function speakFree(text: string, quiet: boolean) {
  if (quiet || typeof window === "undefined" || !window.speechSynthesis) return;
  const utter = new SpeechSynthesisUtterance(text.slice(0, 220));
  utter.lang = "en-US";
  utter.rate = 1;
  const voices = window.speechSynthesis.getVoices();
  const voice =
    voices.find((item) => /^en/i.test(item.lang) && /female|samantha|google uk/i.test(item.name)) ??
    voices.find((item) => /^en/i.test(item.lang));
  if (voice) utter.voice = voice;
  window.speechSynthesis.cancel();
  window.speechSynthesis.speak(utter);
}

export function reminderLine(text: string) {
  return text === "Timer" ? "Timer done." : text;
}

let sharedAudio: AudioContext | null = null;

export function ding() {
  try {
    const Context = window.AudioContext;
    sharedAudio ??= new Context();
    const osc = sharedAudio.createOscillator();
    const gain = sharedAudio.createGain();
    osc.frequency.value = 660;
    osc.connect(gain);
    gain.connect(sharedAudio.destination);
    const start = sharedAudio.currentTime;
    gain.gain.setValueAtTime(0.05, start);
    gain.gain.exponentialRampToValueAtTime(0.001, start + 0.35);
    osc.start(start);
    osc.stop(start + 0.35);
  } catch {
    /* sound is optional */
  }
}
