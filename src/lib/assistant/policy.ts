const KEY = "orin-cloud-opt-in";

export type NetKind = "Offline" | "On device" | "Local link" | "Optional cloud";

export type Capability = { name: string; net: NetKind; detail: string };

/** Living map of the API-minimal rule. Local is the default. Cloud is never implied. */
export const CAPABILITIES: Capability[] = [
  { name: "Tasks, notes, math, memory", net: "Offline", detail: "Saved in this browser only." },
  { name: "Timers", net: "Offline", detail: "Ring while this page is open." },
  { name: "Spoken reply", net: "Offline", detail: "This device's own voice. No speech API." },
  { name: "Calls and texts", net: "On device", detail: "Opens the dialer or Messages. You tap." },
  { name: "Apps and maps", net: "On device", detail: "A link you confirm. No maps API." },
  { name: "Phone link", net: "Local link", detail: "Two open Zoro screens. Not a locked phone." },
  { name: "Open-ended writing", net: "Optional cloud", detail: "Off by default. Or hand the words to ChatGPT." },
  { name: "Creative studio", net: "Offline", detail: "Plans, edits, and plays the film on this device." },
  { name: "Faceless channels", net: "Offline", detail: "Series, scripts, and metadata stay here. Publish is a handoff." },
  { name: "Cloud stills and clips", net: "Optional cloud", detail: "Shot desk only. Named, and idle until you tap." },
];

export function loadCloudOptIn() {
  try {
    return localStorage.getItem(KEY) === "1";
  } catch {
    return false;
  }
}

export function saveCloudOptIn(on: boolean) {
  try {
    if (on) localStorage.setItem(KEY, "1");
    else localStorage.removeItem(KEY);
  } catch {
    /* private mode can refuse storage */
  }
}
