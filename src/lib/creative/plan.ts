import type { Aspect, Continuity, CreativeProject, DurationSec, Platform, Scene, Transition } from "@/lib/creative/types";
import { DURATIONS, SCENE_SECONDS } from "@/lib/creative/types";

type Beat = "establish" | "approach" | "discover" | "interact" | "turn" | "emotion" | "reveal" | "cta";

const CAMERA: Record<Beat, string> = {
  establish: "Wide, locked off",
  approach: "Following, same height",
  discover: "Slow push in",
  interact: "Medium, over the shoulder",
  turn: "Handheld, then settles",
  emotion: "Close, still",
  reveal: "Pull back to the wide",
  cta: "Centered, hold",
};

function tidy(text: string) {
  return text.replace(/\s+/g, " ").trim();
}

export function durationChoice(text: string, fallback: DurationSec): DurationSec {
  const t = text.toLowerCase();
  if (/2\s*-?\s*min/.test(t)) return 120;
  if (/90\s*-?\s*sec|1\.5\s*-?\s*min/.test(t)) return 96;
  if (/\b1\s*-?\s*min\b|60\s*-?\s*sec/.test(t)) return 64;
  if (/30\s*-?\s*sec|32\s*-?\s*sec/.test(t)) return 32;
  return fallback;
}

function platformsOf(text: string): Platform[] {
  if (/\beverywhere\b/i.test(text)) return ["instagram", "facebook", "youtube"];
  const found: Platform[] = [];
  if (/instagram|reel/i.test(text)) found.push("instagram");
  if (/facebook/i.test(text)) found.push("facebook");
  if (/youtube/i.test(text)) found.push("youtube");
  return found.length ? found : ["instagram"];
}

function aspectOf(platforms: Platform[], text: string): Aspect {
  if (/16:9|widescreen|landscape/i.test(text)) return "16:9";
  if (platforms.length === 1 && platforms[0] === "youtube" && /documentary|widescreen/i.test(text)) return "16:9";
  return "9:16";
}

function languageOf(text: string) {
  const te = /telugu/i.test(text);
  const en = /english/i.test(text);
  if (te && en) return "Telugu-English";
  if (te) return "Telugu-English";
  if (/hindi/i.test(text)) return "Hindi-English";
  return "English";
}

function topicOf(text: string) {
  let t = tidy(text);
  t = t.replace(/^(?:(?:zoro|orin)[, ]+)?(?:please )?(?:make|create|produce|build|generate)\s+/i, "");
  t = t.replace(/^(?:me\s+)?(?:a|an)\s+/i, "");
  t = t.replace(/\b\d+\s*-?\s*(?:second|sec|minute|min)s?\b/gi, " ");
  t = t.replace(/\b(?:cinematic|emotional|realistic|funny|instagram|facebook|youtube|reel|video|film|short|documentary|format|narration|subtitles|subtitle|bgm|music)\b/gi, " ");
  t = t.replace(/\b(?:telugu|english|hindi|about|with|and|then|show|final|make|it|post|publish|everywhere)\b/gi, " ");
  t = t.replace(/[^a-z0-9\s]/gi, " ");
  t = tidy(t);
  return t.slice(0, 80) || "the subject";
}

function titleOf(topic: string) {
  const raw = topic.replace(/\w\S*/g, (word) => word.charAt(0).toUpperCase() + word.slice(1));
  return raw.length > 42 ? `${raw.slice(0, 41)}…` : raw;
}

function beatAt(index: number, count: number): Beat {
  if (index === 0) return "establish";
  if (index === count - 1) return "cta";
  if (index === count - 2) return "reveal";
  const mid: Beat[] = ["approach", "discover", "interact", "turn", "emotion"];
  return mid[(index - 1) % mid.length] ?? "approach";
}

function lineFor(beat: Beat, topic: string, bilingual: boolean) {
  const english: Record<Beat, string> = {
    establish: `A quiet open. ${topic} is already in the room.`,
    approach: `The same person keeps walking. Nothing in the wardrobe changes.`,
    discover: `${topic} comes into view, one object at a time.`,
    interact: `A hand meets the display. ${topic} answers.`,
    turn: `The plan shifts. ${topic} is no longer far away.`,
    emotion: `A still beat. This is why ${topic} matters.`,
    reveal: `The whole of ${topic}, in one frame.`,
    cta: `See what ${topic} becomes next.`,
  };
  const line = english[beat];
  if (bilingual && beat === "cta") return `${line} ఇది భవిష్యత్తు.`;
  if (bilingual && beat === "emotion") return `${line} ఇది మన కథ.`;
  return line;
}

function locationAt(index: number, count: number, place: string) {
  const stops = [
    `${place}, entrance`,
    `corridor into ${place}`,
    `${place}, diagnostic bay`,
    `holographic alcove`,
    `quiet side of ${place}`,
    `the reveal bay`,
    `closing frame`,
  ];
  const at = Math.round((index / Math.max(1, count - 1)) * (stops.length - 1));
  return stops[at] ?? stops[0] ?? place;
}

function timeAt(index: number, count: number) {
  const ratio = index / Math.max(1, count - 1);
  if (ratio < 0.34) return "Morning";
  if (ratio < 0.7) return "Day";
  return "Dusk";
}

function lightAt(index: number, count: number) {
  const ratio = index / Math.max(1, count - 1);
  if (ratio < 0.34) return "Cool practicals, ice rim";
  if (ratio < 0.7) return "Soft overhead, same palette";
  return "Lower key, ice edge remains";
}

function transitionFor(beat: Beat): Transition {
  if (beat === "establish" || beat === "cta" || beat === "emotion") return "fade";
  if (beat === "approach" || beat === "reveal") return "whoosh";
  return "cut";
}

function tagsFor(topic: string, platforms: Platform[]) {
  const words = topic
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((word) => word.length > 2)
    .slice(0, 3);
  const base = ["zoro", ...words];
  if (platforms.includes("instagram")) base.push("reels");
  if (platforms.includes("youtube")) base.push("shorts");
  return [...new Set(base)].slice(0, 6);
}

function hinge(index: number, name: string) {
  const lines = [
    `${name} puts a hand on the door`,
    `the door opening, ${name} in the same coat`,
    `${name} steps through, badge visible`,
    `the display lighting the same coat`,
    `${name} turns from the display`,
    `a close frame on the same face`,
    `the wide room behind ${name}`,
  ];
  return lines[index % lines.length] ?? lines[0];
}

function blankContinuity(): Continuity {
  return {
    characters: "",
    location: "",
    time: "",
    wardrobe: "",
    camera: "",
    lighting: "",
    style: "",
    objects: "",
    previousEnd: "",
    nextStart: "",
    dialogue: "",
    action: "",
    audio: "",
  };
}

export function relink(project: CreativeProject): CreativeProject {
  const scenes = project.scenes.map((scene, index) => {
    const prev = project.scenes[index - 1];
    const next = project.scenes[index + 1];
    const continuity: Continuity = {
      ...scene.continuity,
      characters: project.character.name,
      wardrobe: project.character.wardrobe,
      style: project.style,
      action: scene.action,
      dialogue: scene.narration,
      previousEnd: prev ? prev.endFrame : "Black. First frame.",
      nextStart: next ? `Must begin: ${scene.endFrame}` : "No scene follows.",
      audio: `${project.music.mood} bed${scene.sfx === "none" ? "" : `, ${scene.sfx}`}. Caption on the frame.`,
    };
    return { ...scene, continuity };
  });
  return {
    ...project,
    story: scenes.map((scene, index) => `${index + 1}. ${scene.title}`).join(" "),
    scenes,
  };
}

export function planProject(prompt: string, fallback: DurationSec = 32): CreativeProject {
  const text = tidy(prompt);
  const durationSec = durationChoice(text, fallback);
  if (!(DURATIONS as readonly number[]).includes(durationSec)) {
    throw new Error("Duration must be a multiple of 8 seconds.");
  }
  const count = durationSec / SCENE_SECONDS;
  const platforms = platformsOf(text);
  const topic = topicOf(text);
  const bilingual = /telugu|hindi/i.test(text);
  const doctor = /\b(doctors?|physicians?|hospitals?|medicine|medical)\b/i.test(topic) || /\b(doctors?|medicine|medical)\b/i.test(text);
  const character = doctor
    ? {
        name: "Dr. Arjun",
        role: "physician",
        wardrobe: "Charcoal coat, same in every scene",
        appearance: ["same face", "same hairstyle", "same coat", "same ID badge"],
      }
    : {
        name: "Mina",
        role: "lead",
        wardrobe: "One coat, same in every scene",
        appearance: ["same face", "same hairstyle", "same coat"],
      };
  const place = doctor ? "the future hospital" : "the set";
  const style = /funny|comedy/i.test(text) ? "Dry comedy, hard cuts, one character" : "Cinematic, realistic, restrained";
  const mood = /emotional/i.test(text) ? "still" : /funny|comedy/i.test(text) ? "dry" : "pulse";
  const bpm = mood === "still" ? 76 : mood === "dry" ? 96 : 104;
  const cta = "Follow for the next frame.";
  const scenes: Scene[] = Array.from({ length: count }, (_, index) => {
    const beat = beatAt(index, count);
    const start = index * SCENE_SECONDS;
    const endFrame = index === count - 1 ? "End card holds" : hinge(index, character.name);
    const begun = index === 0 ? `${character.name} enters ${locationAt(index, count, place)}.` : `Begins as ${hinge(index - 1, character.name)}.`;
    const action = `${begun} Ends with ${endFrame}.`;
    const narration = lineFor(beat, topic, bilingual);
    return {
      id: `scene-${index + 1}`,
      index,
      start,
      end: start + SCENE_SECONDS,
      title: beat === "cta" ? "End card" : beat.charAt(0).toUpperCase() + beat.slice(1),
      action,
      narration,
      transition: transitionFor(beat),
      sfx: transitionFor(beat) === "whoosh" ? "whoosh" : "none",
      shot: `${CAMERA[beat]}. Hold the same face and coat.`,
      endFrame,
      locked: false,
      continuity: {
        ...blankContinuity(),
        location: locationAt(index, count, place),
        time: timeAt(index, count),
        lighting: lightAt(index, count),
        camera: CAMERA[beat],
        objects: beat === "interact" || beat === "discover" ? "Holographic display" : "None added",
      },
    };
  });
  const project: CreativeProject = {
    id: Math.random().toString(36).slice(2, 10),
    prompt: text.slice(0, 500),
    title: titleOf(topic),
    concept: `${style} ${platforms[0]} piece about ${topic}, told as one continuous visit.`,
    platform: platforms[0] ?? "instagram",
    platforms,
    durationSec,
    aspect: aspectOf(platforms, text),
    language: languageOf(text),
    style,
    story: "",
    arc: {
      beginning: `${character.name} enters ${place} and meets ${topic}.`,
      middle: "The same face, hair, coat, and rooms carry the turn. No new person is introduced.",
      end: `${character.name} faces the camera. ${cta}`,
    },
    character,
    visual: {
      environment: place,
      lighting: "Cool cinematic light, ice rim, unchanged",
      camera: "Cinematic, shallow depth of field",
      palette: "Near-black, paper, ice",
    },
    caption: `${titleOf(topic)}. ${cta}`,
    hashtags: tagsFor(topic, platforms),
    cta,
    privacy: "public",
    publishRequested: /\b(post|publish|everywhere)\b/i.test(text),
    music: { mood, bpm },
    scenes,
  };
  return relink(project);
}

export function clock(seconds: number) {
  const total = Math.max(0, Math.floor(seconds));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}
