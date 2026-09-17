import { AzurePronunciationAssessor } from "./azure-pronunciation";
import { OpenAIGptAudioMandarinEvaluator } from "./openai-audio";
import { OpenAILanguageEvaluator, OpenAISpeechTranscriber } from "./openai";
import type {
  AudioMandarinEvaluator,
  LanguageEvaluator,
  LanguageCode,
  PronunciationAssessor,
  SpeechTranscriber,
} from "./types";

export function getSpeechTranscriber(): SpeechTranscriber {
  return new OpenAISpeechTranscriber();
}

export function getLanguageEvaluator(): LanguageEvaluator {
  return new OpenAILanguageEvaluator();
}

export function getAudioMandarinEvaluator(): AudioMandarinEvaluator {
  return new OpenAIGptAudioMandarinEvaluator();
}

export function getPronunciationAssessor(language: LanguageCode): PronunciationAssessor {
  return new AzurePronunciationAssessor(language);
}
