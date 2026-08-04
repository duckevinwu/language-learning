import { OpenAIGptAudioMandarinEvaluator } from "./openai-audio";
import { OpenAIMandarinEvaluator, OpenAISpeechTranscriber } from "./openai";
import type {
  AudioMandarinEvaluator,
  MandarinEvaluator,
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
