import { MockMandarinEvaluator, MockSpeechTranscriber } from "./mocks";
import type { MandarinEvaluator, SpeechTranscriber } from "./types";

export function getSpeechTranscriber(): SpeechTranscriber {
  return new MockSpeechTranscriber();
}

export function getMandarinEvaluator(): MandarinEvaluator {
  return new MockMandarinEvaluator();
}
