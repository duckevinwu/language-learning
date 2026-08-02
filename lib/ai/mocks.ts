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
      feedback:
        "Good use of \u6211\u5728\u5b66\u4e2d\u6587 to say what you are currently doing. To sound a little more natural, you can also say \u6211\u6b63\u5728\u5b66\u4e2d\u6587, where \u6b63\u5728 emphasizes an action in progress.",
    };
  }
}
