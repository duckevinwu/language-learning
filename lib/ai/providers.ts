import { AzurePronunciationAssessor } from "./azure-pronunciation";
import { OpenAIGptAudioMandarinEvaluator } from "./openai-audio";
import { OpenAIMandarinEvaluator, OpenAISpeechTranscriber } from "./openai";
import type {
  AudioMandarinEvaluator,
  MandarinEvaluator,
  PronunciationAssessor,
  SpeechTranscriber,
} from "./types";

export function getSpeechTranscriber(): SpeechTranscriber {
  return new OpenAISpeechTranscriber();
}

export function getMandarinEvaluator(): MandarinEvaluator {
  return new OpenAIMandarinEvaluator();
}

export function getAudioMandarinEvaluator(): AudioMandarinEvaluator {
  return new OpenAIGptAudioMandarinEvaluator();
}

export function getPronunciationAssessor(): PronunciationAssessor {
  return new AzurePronunciationAssessor();
}
