import {
  OpenAIMandarinEvaluator,
  OpenAISpeechTranscriber,
} from "./openai";
import type { MandarinEvaluator, SpeechTranscriber } from "./types";

export function getSpeechTranscriber(): SpeechTranscriber {
  return new OpenAISpeechTranscriber();
}

export function getMandarinEvaluator(): MandarinEvaluator {
  return new OpenAIMandarinEvaluator();
}
