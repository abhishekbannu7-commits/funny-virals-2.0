export const SCENE_SECONDS = 8;
export const DURATIONS = [32, 64, 96, 120] as const;
export type DurationSec = (typeof DURATIONS)[number];
export type Platform = "instagram" | "facebook" | "youtube";
export type Aspect = "9:16" | "16:9";
export type Transition = "cut" | "fade" | "whoosh";
export type CharacterBible = {
  name: string;
  role: string;
  wardrobe: string;
  appearance: string[];
};

export type VisualBible = {
  environment: string;
  lighting: string;
  camera: string;
  palette: string;
};

export type StoryArc = {
  beginning: string;
  middle: string;
  end: string;
};

export type Continuity = {
  characters: string;
  location: string;
  time: string;
  wardrobe: string;
  camera: string;
  lighting: string;
  style: string;
  objects: string;
  previousEnd: string;
  nextStart: string;
  dialogue: string;
  action: string;
  audio: string;
};

export type Scene = {
  id: string;
  index: number;
  start: number;
  end: number;
  title: string;
  action: string;
  narration: string;
  transition: Transition;
  sfx: string;
  shot: string;
  endFrame: string;
  continuity: Continuity;
  locked: boolean;
};

export type CreativeProject = {
  id: string;
  prompt: string;
  title: string;
  concept: string;
  platform: Platform;
  platforms: Platform[];
  durationSec: DurationSec;
  aspect: Aspect;
  language: string;
  style: string;
  story: string;
  arc: StoryArc;
  character: CharacterBible;
  visual: VisualBible;
  caption: string;
  hashtags: string[];
  cta: string;
  privacy: "public" | "unlisted";
  publishRequested: boolean;
  music: { mood: string; bpm: number };
  scenes: Scene[];
};

export type AuditRow = {
  id: string;
  at: number;
  lane: string;
  detail: string;
  sent: boolean;
};

export function sceneAt(project: CreativeProject, time: number) {
  const t = Math.min(Math.max(0, time), Math.max(0, project.durationSec - 0.001));
  return project.scenes.find((scene) => t >= scene.start && t < scene.end) ?? project.scenes[project.scenes.length - 1];
}

export function frameSize(aspect: Aspect) {
  return aspect === "16:9" ? { width: 1280, height: 720 } : { width: 720, height: 1280 };
}
