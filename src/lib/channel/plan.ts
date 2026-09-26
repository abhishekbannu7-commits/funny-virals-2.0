export type Niche =
  | "medical"
  | "scary"
  | "mystery"
  | "history"
  | "science"
  | "technology"
  | "ai"
  | "facts"
  | "true-crime"
  | "documentary"
  | "finance"
  | "motivation"
  | "gaming"
  | "news"
  | "general";

export type ChannelFormat = "youtube-long" | "youtube-shorts" | "instagram" | "facebook";

export type EpisodeStatus = "idea" | "ready" | "handoff";

export type Check = { name: string; pass: boolean; detail: string; blocks: boolean };

export type SceneBeat = {
  index: number;
  title: string;
  narration: string;
  visual: string;
  endFrame: string;
  sfx: string;
};

export type Episode = {
  number: number;
  title: string;
  premise: string;
  status: EpisodeStatus;
  script: string;
  scenes: SceneBeat[];
  captions: string;
  description: string;
  tags: string[];
  thumbnail: string;
  sourcesReviewed: boolean;
  checks: Check[];
};

export type Channel = {
  id: string;
  prompt: string;
  name: string;
  niche: Niche;
  format: ChannelFormat;
  minutes: number;
  concept: string;
  pillars: string[];
  brand: { colors: string; type: string; intro: string; outro: string; cta: string };
  visual: { style: string; camera: string; lighting: string; aspect: "16:9" | "9:16" };
  audio: { narrator: string; bgm: string; sfx: string; loudness: string };
  episodes: Episode[];
  mode: "assisted" | "autonomous";
  uploadsPerDay: number;
  note: string;
  handoffs: { episode: number; at: string }[];
};

const KEY = "orin-channels-v1";

const NAMES: Record<Niche, string[]> = {
  medical: ["Case Margin", "Ward Notes", "Unlisted Cases"],
  scary: ["Dark Files", "Night Ledger", "The Quiet Floor"],
  mystery: ["Open Questions", "The Missing Hour", "Cold Margin"],
  history: ["Margin of Time", "The Other Record", "After the Date"],
  science: ["Plain Mechanism", "How It Holds", "Field Notes"],
  technology: ["The Stack", "Under the Interface", "Build Log"],
  ai: ["Model Margin", "The Other Desk", "Weight Notes"],
  facts: ["Odd Ledger", "One Fact Further", "Not the Headline"],
  "true-crime": ["Unverified File", "The Statement", "What Was Reported"],
  documentary: ["Long Take", "The Record", "Held Frame"],
  finance: ["Plain Ledger", "No Advice Desk", "The Number"],
  motivation: ["Next Small Move", "Keep the Hour", "Start Anyway"],
  gaming: ["Off Camera", "The Run", "Patch Notes"],
  news: ["Slow Explainer", "What Changed", "The Brief"],
  general: ["Faceless Desk", "The Series", "Open Channel"],
};

const TITLES: Record<Niche, string[]> = {
  scary: [
    "The Room That Wasn't There",
    "The Last Train",
    "The Voice Behind the Wall",
    "The Light Under the Door",
    "A Knock After Midnight",
    "The Hall That Grew",
    "Static on the Baby Monitor",
    "The Seat That Stayed Warm",
    "Floor Three, Again",
    "The Coat on the Chair",
    "Windows That Faced a Wall",
    "The Name on the List",
    "A Call from the Elevator",
    "The Key That Fit",
    "Rain on a Closed Street",
    "The Portrait That Blinked",
    "Boxes in the Attic",
    "The Station After Ours",
    "A Hand on the Railing",
    "The Episode We Don't Number",
  ],
  medical: [
    "The Chart That Changed Overnight",
    "A Fever With No Source",
    "The Scan Nobody Ordered",
    "Two Pulses, One Patient",
    "The Ward That Went Quiet",
    "A Rash That Mapped a City",
    "The Dose That Was Already Given",
    "Night Shift, Unknown Origin",
    "The Lab That Didn't Match",
    "A Cough That Wasn't Lungs",
    "The Monitor That Lied Kindly",
    "Borrowed Symptoms",
    "The Case Filed Under Other",
    "When the Test Was Too Early",
    "A Pain in the Wrong Place",
    "The Consult That Arrived Late",
    "Sterile, and Still Wrong",
    "The Note in the Margin",
    "Discharge, Then Back",
    "What the Textbook Skipped",
  ],
  mystery: ["The Envelope With No Stamp", "Three Clocks, One Time", "The Map That Ended", "A Door Marked Staff", "The Witness Who Arrived Early", "Missing From the Index", "The Key Without a Lock", "Footnotes to Nowhere", "The Alibi of Rain", "Room 0"],
  history: ["The Year They Left Out", "A Letter Never Sent", "The Road That Moved", "After the Treaty", "The Census Line", "A Ship in the Margin", "The Portrait's Other Side", "Market Day, 400 Years On", "The Gate They Closed", "Names in the Ledger"],
  science: ["Why the Ice Sings", "The Slow Clock", "A River Under the City", "Heat That Goes Nowhere", "The Bird That Navigates", "Dust With a Job", "The Curve of a Drop", "Night Vision, Plainly", "What a Seed Counts", "The Quiet Magnet"],
  technology: ["The Button That Waited", "A Cache of Yesterday", "The Protocol Under the App", "When the Clock Skewed", "One Retry Too Many", "The Screen You Don't See", "Packets in the Rain", "The Backup That Wasn't", "Latency as a Place", "The Switch at Dawn"],
  ai: ["The Prompt That Remembered", "Weights, Not Wisdom", "A Model of the Room", "The Answer That Fit Too Well", "Training on Tuesday", "The Token at the Edge", "When the Tool Refused", "A Face That Wasn't Filmed", "The Eval Nobody Ran", "Next to the Model"],
  facts: ["The Library That Floats", "A Color With No Name", "The Longest Echo", "Maps That Disagree", "The Animal That Farms", "A Number in the Desert", "The Street That Changes Width", "Clocks Inside Cells", "The Word That Split", "Rain on Metal Roofs"],
  "true-crime": ["The Statement That Didn't Match", "A Timeline With a Gap", "What the Report Actually Says", "Two Versions of Tuesday", "The Call Log", "Unnamed, On Purpose", "The Charge and the Record", "A Witness, Then a Correction", "Filed, Not Proven", "The Update"],
  documentary: ["The Long Morning", "Holding the Wide Shot", "A Week in One Room", "The Work Between Cuts", "People Off Camera", "The Last Shift", "Paper, Then Voice", "A Town at 6 a.m.", "The Edit That Waited", "Credits, Then Quiet"],
  finance: ["The Fee in the Footnote", "Interest, Slowly", "A Budget for One Week", "What Compounding Is Not", "The Bill That Repeated", "Cash and the Calendar", "A Chart Without a Promise", "The Word Yield", "Saving the Boring Part", "Not a Recommendation"],
  motivation: ["Start Smaller Than the Plan", "The Hour You Keep", "Again, Without the Speech", "One Page", "Leave the Phone Down", "Finish the Ugly Draft", "Walk, Then Work", "The Second Try", "Quiet Progress", "Stop Negotiating"],
  gaming: ["The Run With No Face", "Patch Day", "A Boss, Explained Slowly", "The Route", "Controller Down", "One Life Left", "The Tutorial They Skipped", "Speed, Then Story", "The Glitch That Stayed", "After the Credits"],
  news: ["What Changed Today", "The Sentence Under the Headline", "Three Sources, One Claim", "A Number in Context", "The Update at Noon", "What We Don't Know Yet", "The Policy, Plainly", "A Map of the Story", "Correction", "The Short Version"],
  general: ["The First File", "A Series Starts Quiet", "Episode Without a Host", "The Same Voice", "Hold the Style", "Next in the Ledger", "Off Camera", "The Outline", "One More", "The Desk"],
};

function tidy(text: string) {
  return text.replace(/\s+/g, " ").trim();
}

function hash(text: string) {
  let h = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function isChannelCommand(text: string) {
  const t = tidy(text);
  if (/^(?:open )?(?:the )?(?:channels?|channel studio)\.?$/i.test(t)) return true;
  if (/\bepisode\s*\d+\b/i.test(t) && /\b(?:make|produce|publish|build|render|prepare)\b/i.test(t)) return true;
  if (/\b(?:faceless|channel|series)\b/i.test(t) && /\b(?:make|create|plan|build|start|launch)\b/i.test(t)) return true;
  return false;
}

export function nicheOf(text: string): Niche {
  const t = text.toLowerCase();
  if (/true crime|unsolved|allegation/.test(t)) return "true-crime";
  if (/medic|doctor|hospital|disease|clinic|anatom/.test(t)) return "medical";
  if (/scary|horror|creepy|suspense/.test(t)) return "scary";
  if (/mystery|whodunit/.test(t)) return "mystery";
  if (/history|historical|century/.test(t)) return "history";
  if (/\bscience\b|physics|biology|space/.test(t)) return "science";
  if (/\bai\b|artificial intelligence/.test(t)) return "ai";
  if (/tech|software|gadget/.test(t)) return "technology";
  if (/finance|money|invest|budget/.test(t)) return "finance";
  if (/motivat|discipline|habit/.test(t)) return "motivation";
  if (/game|gaming/.test(t)) return "gaming";
  if (/news|explainer|headline/.test(t)) return "news";
  if (/documentary/.test(t)) return "documentary";
  if (/fact/.test(t)) return "facts";
  return "general";
}

function formatOf(text: string): ChannelFormat {
  const t = text.toLowerCase();
  if (/instagram|reel/.test(t)) return "instagram";
  if (/facebook/.test(t)) return "facebook";
  if (/shorts?\b/.test(t)) return "youtube-shorts";
  return "youtube-long";
}

function minutesOf(text: string, format: ChannelFormat) {
  const m = text.match(/(\d+)\s*[–-]\s*(\d+)\s*min/i) ?? text.match(/(\d+)\s*min/i);
  if (m && m[2]) return Math.min(12, Math.max(3, Number(m[2])));
  if (m) return Math.min(12, Math.max(3, Number(m[1])));
  if (format === "youtube-long") return 8;
  return 1;
}

function episodeCount(text: string) {
  const m = text.match(/\b(\d{1,2})\s*(?:episodes?|ep)\b/i);
  const n = m ? Number(m[1]) : 10;
  return Math.min(20, Math.max(6, n || 10));
}

function topicOf(text: string) {
  let t = tidy(text).replace(/^(?:(?:zoro|orin)[, ]+)?/i, "");
  t = t.replace(/\b(?:create|make|plan|build|start|launch|a|an|the|faceless|channel|for|about|youtube|instagram|facebook|episode|episodes|first|and|prepare|it|publish)\b/gi, " ");
  t = t.replace(/[^a-z0-9\s-]/gi, " ");
  t = tidy(t);
  return t.slice(0, 80) || "original stories";
}

function sensitive(niche: Niche) {
  return niche === "medical" || niche === "true-crime";
}

export function reviewEpisode(channel: Channel, episode: Episode): Check[] {
  const produced = episode.scenes.length > 0;
  const chain = episode.scenes.every((scene, index) => {
    if (index === 0) return true;
    return scene.visual.startsWith("Begins as");
  });
  const checks: Check[] = [
    {
      name: "Package",
      pass: produced && episode.script.length > 40,
      detail: produced ? "Script, scenes, captions, and metadata are on this device." : "Still an idea. Make the episode to fill the package.",
      blocks: true,
    },
    {
      name: "Continuity",
      pass: !produced || chain,
      detail: "Each scene begins on the previous end frame. The narrator and look stay in the channel bible.",
      blocks: true,
    },
    {
      name: "Faceless",
      pass: true,
      detail: "No on-camera host. Narration and cutaways only.",
      blocks: false,
    },
    {
      name: "Captions",
      pass: !produced || episode.captions.length > 20,
      detail: "Captions are the narration, ready to burn in or upload as a file.",
      blocks: true,
    },
    {
      name: "Copyright",
      pass: true,
      detail: "Narration is original to this desk. Music here is not a licensed track. Do not drop in songs you do not own.",
      blocks: false,
    },
  ];
  if (channel.niche === "medical") {
    checks.push({
      name: "Medical",
      pass: episode.sourcesReviewed,
      detail: episode.sourcesReviewed
        ? "You marked sources reviewed. This is still not medical advice, and nothing has been posted."
        : "Fictional case framing only. Not medical advice. Publishing stays blocked until you mark sources reviewed.",
      blocks: true,
    });
  }
  if (channel.niche === "true-crime") {
    checks.push({
      name: "Record",
      pass: episode.sourcesReviewed,
      detail: episode.sourcesReviewed
        ? "You marked the record reviewed. Allegations stay labeled unverified."
        : "Do not turn an unverified claim into a video. Publishing stays blocked until you mark the record reviewed.",
      blocks: true,
    });
  }
  if (channel.niche === "finance") {
    checks.push({
      name: "Finance",
      pass: true,
      detail: "Not financial advice. No promise of returns.",
      blocks: false,
    });
  }
  checks.push({
    name: "Publish",
    pass: false,
    detail: "YouTube upload is not connected. Confirm only unlocks the handoff. Nothing is posted.",
    blocks: false,
  });
  return checks;
}

function blankEpisode(number: number, title: string, premise: string): Episode {
  return {
    number,
    title,
    premise,
    status: "idea",
    script: "",
    scenes: [],
    captions: "",
    description: "",
    tags: [],
    thumbnail: "",
    sourcesReviewed: false,
    checks: [],
  };
}

export function produceEpisode(channel: Channel, number: number): Channel {
  const episode = channel.episodes.find((item) => item.number === number);
  if (!episode) return channel;
  const count = channel.format === "youtube-long" || channel.format === "facebook" ? 6 : 4;
  const hinges = [
    `${channel.name} title card, ${channel.visual.lighting}`,
    "Empty room, same grade, no face",
    "A single object, held in frame",
    "The doorway from the previous shot",
    "Wide again, narrator unseen",
    `${channel.name} end card`,
  ];
  const scenes: SceneBeat[] = [];
  for (let i = 0; i < count; i += 1) {
    const end = hinges[Math.min(i + 1, hinges.length - 1)] ?? hinges[hinges.length - 1];
    const start = i === 0 ? "Black, then the title card." : `Begins as ${hinges[i]}.`;
    scenes.push({
      index: i + 1,
      title: i === count - 1 ? "End card" : `Beat ${i + 1}`,
      narration:
        i === 0
          ? `${episode.title}. ${episode.premise}`
          : i === count - 1
            ? `${channel.brand.cta} ${channel.name} returns with the next file.`
            : `${episode.premise} The frame stays faceless. Same narrator. Same ${channel.visual.style}.`,
      visual: `${start} ${channel.visual.camera}. ${channel.visual.style}.`,
      endFrame: end,
      sfx: i === 0 ? "Low room tone" : i === count - 1 ? "Tone out" : "Soft hit, then room tone",
    });
  }
  const script = scenes.map((scene) => `${scene.title}\n${scene.narration}`).join("\n\n");
  const captions = scenes.map((scene) => scene.narration).join(" ");
  const next: Episode = {
    ...episode,
    status: "ready",
    script,
    scenes,
    captions,
    description: [
      episode.premise,
      channel.niche === "medical" ? "Fictional framing. Not medical advice." : "",
      channel.niche === "true-crime" ? "Unverified. Not a finding of fact." : "",
      channel.niche === "finance" ? "Not financial advice." : "",
      channel.brand.cta,
    ]
      .filter(Boolean)
      .join(" "),
    tags: [channel.niche, "faceless", channel.format, channel.name.toLowerCase().replace(/\s+/g, "")].slice(0, 8),
    thumbnail: `${channel.name}. ${episode.title}. ${channel.visual.style}. No face. Title in ${channel.brand.type}.`,
    sourcesReviewed: episode.sourcesReviewed,
    checks: [],
  };
  next.checks = reviewEpisode(channel, next);
  return {
    ...channel,
    episodes: channel.episodes.map((item) => (item.number === number ? next : item)),
    note: channel.note,
  };
}

export function planChannel(prompt: string): Channel {
  const text = tidy(prompt).slice(0, 500);
  const niche = nicheOf(text);
  const format = formatOf(text);
  const count = episodeCount(text);
  const asked = text.match(/\b(\d{1,2})\s*(?:episodes?|ep)\b/i);
  const seed = hash(text || niche);
  const name = NAMES[niche][seed % NAMES[niche].length] ?? "Faceless Desk";
  const bank = TITLES[niche];
  const topic = topicOf(text);
  const minutes = minutesOf(text, format);
  const aspect = format === "youtube-long" || format === "facebook" ? "16:9" : "9:16";
  const episodes: Episode[] = [];
  for (let n = 1; n <= count; n += 1) {
    const title = bank[(seed + n - 1) % bank.length] ?? `File ${n}`;
    episodes.push(
      blankEpisode(
        n,
        title,
        `${name} — file ${n}. ${topic}. Same series voice. About ${minutes} minutes. Faceless.`,
      ),
    );
  }
  const channel: Channel = {
    id: Math.random().toString(36).slice(2, 10),
    prompt: text,
    name,
    niche,
    format,
    minutes,
    concept: `A faceless ${niche.replace("-", " ")} series. ${topic}. One narrator, one look, no on-camera host.`,
    pillars: ["One series voice", "Continuity with the previous end frame", "Original narration", "Approve before any handoff"],
    brand: {
      colors: "Near-black field, paper type, ice accent",
      type: "Fraunces for titles, Outfit for captions",
      intro: `${name}. A short cold open, then the title.`,
      outro: `End card. ${name}. Next file soon.`,
      cta: "If this file held you, the next one is already in the series.",
    },
    visual: {
      style: niche === "scary" ? "Cinematic, low key, suspense" : niche === "medical" ? "Cool clinical light, no gore" : "Clean cinematic, restrained",
      camera: "Locked wides and slow pushes. No host.",
      lighting: niche === "scary" ? "Practicals and deep shadow" : "Cool, even, readable",
      aspect,
    },
    audio: {
      narrator: "One calm voice for the whole channel",
      bgm: niche === "scary" ? "Sparse drones, no licensed songs" : "Low beds, no licensed songs",
      sfx: "Room tone and soft hits only",
      loudness: "Speech in front. Music under.",
    },
    episodes,
    mode: "assisted",
    uploadsPerDay: 2,
    note:
      asked && Number(asked[1]) > 20
        ? "You asked for more than 20. This desk keeps 20 so the series stays editable. Ask for the next batch later."
        : "Cloud video is off. This is a local package, not a rendered upload.",
    handoffs: [],
  };
  const makeFirst = /episode\s*1|first episode|prepare it/i.test(text);
  return makeFirst ? produceEpisode(channel, 1) : channel;
}

export function loadChannels(): Channel[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as Channel[];
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item) => item && typeof item.name === "string" && Array.isArray(item.episodes));
  } catch {
    return [];
  }
}

export function saveChannels(channels: Channel[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(channels.slice(0, 8)));
  } catch {
    /* private mode */
  }
}

export function blocked(episode: Episode) {
  return episode.checks.some((check) => check.blocks && !check.pass);
}

export function handoffHref(format: ChannelFormat) {
  if (format === "instagram") return "";
  if (format === "facebook") return "https://www.facebook.com/";
  return "https://www.youtube.com/upload";
}
