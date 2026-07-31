export type Challenge = {
  id: string;
  englishPrompt: string;
  acceptableMandarinExamples: string[];
  targetConcepts: string[];
};

export type AudioInput = {
  data: ArrayBuffer;
  mimeType: string;
  filename: string;
  size: number;
};

export type TranscriptionResult = {
  transcript: string;
  confidence: number;
};

export type EvaluationInput = {
  challenge: Challenge;
  transcription: TranscriptionResult;
};

export type EvaluationReport = {
  transcript: string;
  overallScore: number;
  meaningScore: number;
  grammarScore: number;
  naturalnessScore: number;
  correctedMandarin: string;
  pinyin: string;
  coachingTip: string;
  retryInstruction: string;
};

export interface SpeechTranscriber {
  transcribe(input: AudioInput): Promise<TranscriptionResult>;
}

export interface MandarinEvaluator {
  evaluate(input: EvaluationInput): Promise<EvaluationReport>;
}
