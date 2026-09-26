import type { MediaMap, Project } from "@/lib/studio/types";

export const sampleProject: Project = {
  id: "sample-spoon",
  title: "Spoon theory",
  prompt: "A fictional office worker decides a teaspoon is probably fine in the microwave. 30 seconds, phone-camera comedy, one continuous character.",
  mode: "cut",
  durationSec: 30,
  style:
    "Fictional man in his late 20s, short black hair, round wire glasses, navy oxford shirt, no logos. Fluorescent open office, phone photo, natural skin, no text.",
  heroPrompt:
    "Fictional man in his late 20s, short black hair, round wire glasses, navy oxford shirt, holding a teaspoon in a fluorescent office, no text.",
  caption:
    "The microwave said no metal. He heard it as a suggestion.\n\nFictional bit. Voices and clips render when you ask.",
  hashtags: ["funny", "office", "comedy", "reel"],
  music: { mood: "sneaky comedy", bpm: 104 },
  shots: [
    {
      id: "shot-1",
      action: "He clocks the microwave, teaspoon already in his hand, and talks himself into it.",
      stillPrompt:
        "Fictional man, late 20s, short black hair, round wire glasses, navy oxford, holding a teaspoon and glancing at an office microwave. Fluorescent office, phone photo, no text.",
      videoPrompt:
        "He looks from the teaspoon to the microwave, shrugs, and takes one step toward it. Same navy shirt, round glasses, fluorescent office.",
      dialogue: [{ t: 1.2, line: "It says metal. How bad can it be?" }],
      locked: false,
    },
    {
      id: "shot-2",
      action: "He parks the spoon in the microwave like it is a leftover.",
      stillPrompt:
        "Same fictional man, navy shirt, round glasses, placing a teaspoon inside an open office microwave, nervous half-smile. No text.",
      videoPrompt:
        "He sets the teaspoon on the glass plate and slowly closes the microwave door. Same person, same office.",
      dialogue: [{ t: 1.4, line: "Ten seconds. I am a scientist now." }],
      locked: false,
    },
    {
      id: "shot-3",
      action: "Door shut. He steps back and waits for science.",
      stillPrompt:
        "Same fictional man, navy shirt, round glasses, stepped back from a closed microwave, eyes wide, teaspoon still in his other hand. No text.",
      videoPrompt:
        "He steps back from the closed microwave, freezes, and winces at a soft ding. Same person, same office.",
      dialogue: [{ t: 2, line: "If this works I am writing a paper." }],
      locked: false,
    },
  ],
};

export const sampleMedia: MediaMap = {
  "shot-1": { stillUrl: "/studio/shot-1.jpg", videoState: "idle" },
  "shot-2": { stillUrl: "/studio/shot-2.jpg", videoState: "idle" },
  "shot-3": { stillUrl: "/studio/shot-3.jpg", videoState: "idle" },
};
