export type Challenge = {
  id: string;
  englishPrompt: string;
  exampleMandarinAnswer: string;
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
  userTranscript: string;
  exampleMandarinAnswer: string;
  englishPrompt?: string;
  targetConcepts?: string[];
};

export type CorrectnessEvaluation = {
  isCorrect: boolean;
  overallScore: number;
  meaningScore: number;
  grammarScore: number;
  naturalnessScore: number;
  feedback: string;
};

export type EvaluationReport = CorrectnessEvaluation & {
  transcript: string;
};

export interface SpeechTranscriber {
  transcribe(input: AudioInput): Promise<TranscriptionResult>;
}

export interface MandarinEvaluator {
  evaluate(input: EvaluationInput): Promise<EvaluationReport>;
}
