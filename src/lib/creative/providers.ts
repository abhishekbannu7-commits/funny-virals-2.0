export type ReasoningId = "local" | "gemini" | "chatgpt" | "grok";
export type ImageId = "local" | "chatgpt" | "grok" | "gemini";
export type VideoId = "local" | "veo";
export type VoiceId = "local" | "cloud";
export type MusicId = "local" | "cloud";

export type ProviderRoute = {
  reasoning: ReasoningId;
  image: ImageId;
  video: VideoId;
  voice: VoiceId;
  music: MusicId;
};

export const DEFAULT_ROUTE: ProviderRoute = {
  reasoning: "local",
  image: "local",
  video: "local",
  voice: "local",
  music: "local",
};

export type CloudLane = "reasoning" | "image" | "video" | "voice" | "music";

const REASONING = [
  { id: "local" as const, label: "Local" },
  { id: "gemini" as const, label: "Gemini" },
  { id: "chatgpt" as const, label: "ChatGPT" },
  { id: "grok" as const, label: "Grok" },
];
const IMAGE = [
  { id: "local" as const, label: "Local" },
  { id: "chatgpt" as const, label: "ChatGPT" },
  { id: "grok" as const, label: "Grok" },
  { id: "gemini" as const, label: "Gemini" },
];
const VIDEO = [
  { id: "local" as const, label: "Local" },
  { id: "veo" as const, label: "Gemini/Veo" },
];
const VOICE = [
  { id: "local" as const, label: "Local" },
  { id: "cloud" as const, label: "Cloud" },
];
const MUSIC = [
  { id: "local" as const, label: "Local" },
  { id: "cloud" as const, label: "Cloud" },
];

export const PROVIDER_LANES: {
  lane: CloudLane;
  title: string;
  options: { id: string; label: string }[];
}[] = [
  { lane: "reasoning", title: "Planning", options: REASONING },
  { lane: "image", title: "Image", options: IMAGE },
  { lane: "video", title: "Video", options: VIDEO },
  { lane: "voice", title: "Voice", options: VOICE },
  { lane: "music", title: "Music", options: MUSIC },
];

export function cloudJob(route: ProviderRoute, lane: CloudLane) {
  const id = route[lane];
  if (id === "local") return null;
  const name =
    lane === "video" && id === "veo"
      ? "Gemini/Veo"
      : id === "gemini"
        ? "Gemini"
        : id === "chatgpt"
          ? "ChatGPT"
          : id === "grok"
            ? "Grok"
            : id === "cloud"
              ? lane === "voice"
                ? "Cloud voice"
                : "Cloud music"
              : "Cloud";
  const sends =
    lane === "reasoning"
      ? ["your brief", "the story arc", "scene prompts"]
      : lane === "image"
        ? ["your brief", "the character bible", "scene descriptions"]
        : lane === "video"
          ? ["your brief", "scene prompts", "the previous scene’s end frame"]
          : lane === "voice"
            ? ["narration lines"]
            : ["music mood", "duration"];
  return { name, sends };
}
