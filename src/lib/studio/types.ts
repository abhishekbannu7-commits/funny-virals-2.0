export const SHOT_SECONDS = 10;
export const DURATIONS = [30, 60, 90, 120] as const;
export type DurationSec = (typeof DURATIONS)[number];
export type CutMode = "cut" | "chain";

export type DialogueLine = {
  t: number;
  line: string;
};

export type Shot = {
  id: string;
  action: string;
  stillPrompt: string;
  videoPrompt: string;
  dialogue: DialogueLine[];
  locked: boolean;
};

export type Project = {
  id: string;
  title: string;
  prompt: string;
  mode: CutMode;
  durationSec: DurationSec;
  style: string;
  heroPrompt: string;
  caption: string;
  hashtags: string[];
  music: { mood: string; bpm: number };
  shots: Shot[];
};

export type ShotMedia = {
  stillUrl?: string;
  videoUrl?: string;
  requestId?: string;
  videoState?: "idle" | "rendering" | "done" | "failed";
  videoError?: string;
};

export type MediaMap = Record<string, ShotMedia>;

export function shotCountFor(duration: DurationSec) {
  return duration / SHOT_SECONDS;
}

export function durationForCount(count: number): DurationSec | null {
  const sec = count * SHOT_SECONDS;
  return (DURATIONS as readonly number[]).includes(sec) ? (sec as DurationSec) : null;
}
