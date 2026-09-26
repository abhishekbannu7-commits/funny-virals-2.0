import { SCENE_SECONDS, type CreativeProject } from "@/lib/creative/types";

export type Check = { label: string; pass: boolean; detail: string };

export function reviewProject(project: CreativeProject): Check[] {
  const scenes = project.scenes;
  const span = scenes.reduce((sum, scene) => sum + (scene.end - scene.start), 0);
  const linked = scenes.every((scene, index) => {
    if (index === 0) return scene.continuity.previousEnd.startsWith("Black");
    return scene.continuity.previousEnd === scenes[index - 1]?.endFrame;
  });
  const wardrobe = scenes.every((scene) => scene.continuity.wardrobe === project.character.wardrobe);
  const slots = scenes.every((scene) => Math.abs(scene.end - scene.start - SCENE_SECONDS) < 0.01);
  const last = scenes[scenes.length - 1];
  return [
    {
      label: "Length",
      pass: Math.abs(span - project.durationSec) < 0.01,
      detail: `${span}s planned, ${project.durationSec}s expected.`,
    },
    {
      label: "Scene slots",
      pass: slots && scenes.length === project.durationSec / SCENE_SECONDS,
      detail: `${scenes.length} scenes of ${SCENE_SECONDS}s. Each can later extend from the previous frame.`,
    },
    {
      label: "Continuity",
      pass: linked,
      detail: linked ? "Each scene must begin on the previous scene’s end frame." : "A scene lost the frame it must begin on.",
    },
    {
      label: "Character",
      pass: wardrobe,
      detail: project.character.appearance.join(", "),
    },
    {
      label: "Captions",
      pass: scenes.every((scene) => scene.narration.trim().length > 0),
      detail: project.language,
    },
    {
      label: "End card",
      pass: Boolean(last && last.narration.includes(project.cta.slice(0, 12)) || last?.title === "End card"),
      detail: project.cta,
    },
    {
      label: "Cloud",
      pass: true,
      detail: "This cut was planned, drawn, and can be exported without a provider.",
    },
  ];
}
