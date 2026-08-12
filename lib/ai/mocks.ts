import type {
  CorrectnessEvaluation,
  MandarinEvaluator,
  SpeechTranscriber,
  TranscriptionResult,
} from "./types";

export class MockSpeechTranscriber implements SpeechTranscriber {
  async transcribe(): Promise<TranscriptionResult> {
    return {
      transcript: "\u6211\u5728\u5b66\u4e2d\u6587\u3002",
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
      exampleBreakdown: [
        { text: "\u6211", definition: "I" },
        { text: "\u5728\u5b66", definition: "am studying" },
        { text: "\u4e2d\u6587", definition: "Chinese" },
      ],
    };
  }
}
