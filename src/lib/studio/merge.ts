import type { MediaMap, Project, Shot } from "@/lib/studio/types";

function creativeKey(shot: Shot) {
  return JSON.stringify({
    action: shot.action,
    stillPrompt: shot.stillPrompt,
    videoPrompt: shot.videoPrompt,
    dialogue: shot.dialogue,
  });
}

export function applyRevision(prev: Project, next: Project, media: MediaMap) {
  const prevById = new Map(prev.shots.map((shot) => [shot.id, shot]));
  const dirtyIds: string[] = [];
  const shots = next.shots.map((shot) => {
    const before = prevById.get(shot.id);
    if (before?.locked) return before;
    if (!before || creativeKey(before) !== creativeKey(shot)) dirtyIds.push(shot.id);
    return { ...shot, locked: false };
  });

  const nextMedia: MediaMap = {};
  for (const shot of shots) {
    const old = media[shot.id];
    if (!old) continue;
    if (dirtyIds.includes(shot.id)) {
      nextMedia[shot.id] = {
        stillUrl: old.stillUrl,
        videoState: "idle",
      };
      const before = prevById.get(shot.id);
      if (before && before.stillPrompt !== shot.stillPrompt) {
        nextMedia[shot.id] = { videoState: "idle" };
      }
    } else {
      nextMedia[shot.id] = old;
    }
  }

  return {
    project: { ...next, shots },
    media: nextMedia,
    dirtyIds,
  };
}
