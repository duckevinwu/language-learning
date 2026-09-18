import type { EvaluationMode, LanguageCode } from "./ai/types";

export type LanguageProfile = {
  code: LanguageCode;
  label: string;
  azureLocale: string;
  transcriptionLanguage: string;
  speechSynthesisLanguage: string;
  readingLabel?: string;
  supportsToneScore: boolean;
  evaluationModes: EvaluationMode[];
};

const languageProfiles: Record<LanguageCode, LanguageProfile> = {
  zh: {
    code: "zh",
    label: "Chinese",
    azureLocale: "zh-CN",
    transcriptionLanguage: "zh",
    speechSynthesisLanguage: "zh-CN",
    readingLabel: "Pinyin",
    supportsToneScore: true,
    evaluationModes: ["transcript-gpt-audio", "standard", "gpt-audio"],
  },
  es: {
    code: "es",
    label: "Spanish",
    azureLocale: "es-MX",
    transcriptionLanguage: "es",
    speechSynthesisLanguage: "es-MX",
    supportsToneScore: false,
    evaluationModes: ["transcript-gpt-audio", "standard"],
  },
  ja: {
    code: "ja",
    label: "Japanese",
    azureLocale: "ja-JP",
    transcriptionLanguage: "ja",
    speechSynthesisLanguage: "ja-JP",
    readingLabel: "Romaji",
    supportsToneScore: false,
    evaluationModes: ["transcript-gpt-audio", "standard"],
  },
};

export const LANGUAGE_OPTIONS = Object.values(languageProfiles);

export function getLanguageProfile(code: LanguageCode): LanguageProfile {
  return languageProfiles[code];
}

export function parseLanguageCode(value: unknown): LanguageCode {
  return value === "es" || value === "ja" ? value : "zh";
}

export function isLanguageCode(value: unknown): value is LanguageCode {
  return value === "zh" || value === "es" || value === "ja";
}
