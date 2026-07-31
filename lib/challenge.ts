import type { Challenge } from "./ai/types";

export const dailyChallenge: Challenge = {
  id: "daily-001-three-months",
  englishPrompt: "I have been learning Chinese for three months.",
  acceptableMandarinExamples: [
    "我学中文学了三个月。",
    "我已经学了三个月中文。",
    "我学汉语已经三个月了。",
  ],
  targetConcepts: ["duration", "了", "中文 / 汉语"],
};
