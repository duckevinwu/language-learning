import { AzurePronunciationAssessor } from "./azure-pronunciation";
import { OpenAIGptAudioEvaluator } from "./openai-audio";
import { OpenAILanguageEvaluator, OpenAISpeechTranscriber } from "./openai";
import type {
  AudioLanguageEvaluator,
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

export function getAudioLanguageEvaluator(): AudioLanguageEvaluator {
  return new OpenAIGptAudioEvaluator();
}

export function getPronunciationAssessor(language: LanguageCode): PronunciationAssessor {
  return new AzurePronunciationAssessor(language);
}
