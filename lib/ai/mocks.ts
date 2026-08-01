import type {
  CorrectnessEvaluation,
  MandarinEvaluator,
  SpeechTranscriber,
  TranscriptionResult,
} from "./types";

export class MockSpeechTranscriber implements SpeechTranscriber {
  async transcribe(): Promise<TranscriptionResult> {
    return {
      transcript: "我在学中文。",
      confidence: 0.94,
    };
  }
}

export class MockMandarinEvaluator implements MandarinEvaluator {
  async evaluate(): Promise<CorrectnessEvaluation> {
    return {
      isCorrect: true,
      overallScore: 92,
      meaningScore: 96,
      grammarScore: 90,
      naturalnessScore: 90,
      feedback:
        "Your answer expresses the same meaning as the example and is grammatically natural Mandarin.",
    };
  }
}
