import type {
  EvaluationInput,
  EvaluationReport,
  MandarinEvaluator,
  SpeechTranscriber,
  TranscriptionResult,
} from "./types";

export class MockSpeechTranscriber implements SpeechTranscriber {
  async transcribe(): Promise<TranscriptionResult> {
    return {
      transcript: "我学中文学了三个月。",
      confidence: 0.94,
    };
  }
}

export class MockMandarinEvaluator implements MandarinEvaluator {
  async evaluate(input: EvaluationInput): Promise<EvaluationReport> {
    return {
      transcript: input.transcription.transcript,
      overallScore: 86,
      meaningScore: 92,
      grammarScore: 84,
      naturalnessScore: 82,
      correctedMandarin: "我学中文学了三个月。",
      pinyin: "Wǒ xué Zhōngwén xué le sān ge yuè.",
      coachingTip:
        "Your meaning is clear. Keep 学 before the object and repeat 学 before the duration to make the time span feel natural.",
      retryInstruction:
        "Say it once more with a small pause after 中文, then keep 三个月 smooth and even.",
    };
  }
}
