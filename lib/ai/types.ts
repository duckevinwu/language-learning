export type Challenge = {
  id: string;
  englishPrompt: string;
  exampleMandarinAnswer: string;
  category: string;
  difficulty: "beginner";
  targetConcepts: string[];
  notes?: string;
};

export type PublicChallenge = Omit<Challenge, "exampleMandarinAnswer">;

export type AudioInput = {
  data: ArrayBuffer;
  mimeType: string;
  filename: string;
  size: number;
};

export type EvaluationMode = "standard" | "gpt-audio";

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

export type FeedbackSegment =
  | { type: "text"; text: string }
  | { type: "mandarin"; text: string; pinyin: string };

export type CorrectnessEvaluation = {
  isCorrect: boolean;
  overallScore: number;
  meaningScore: number;
  grammarScore: number;
  naturalnessScore: number;
  feedback: string;
};

export type AudioEvaluationInput = {
  audio: AudioInput;
  challenge: Challenge;
};

export type AudioCorrectnessEvaluation = CorrectnessEvaluation & {
  transcript: string;
  pronunciationScore: number;
  toneScore: number;
  pronunciationNeedsWork: boolean;
  pronunciationFeedback?: string;
  pronunciationProvider: string;
};

export type EvaluationReport = CorrectnessEvaluation & {
  feedbackSegments: FeedbackSegment[];
  transcript: string;
  transcriptPinyin: string;
  exampleMandarinAnswer: string;
  exampleMandarinPinyin: string;
  evaluationMode?: EvaluationMode;
  pronunciationScore?: number;
  toneScore?: number;
  pronunciationNeedsWork?: boolean;
  pronunciationFeedback?: string;
  pronunciationProvider?: string;
};

export interface SpeechTranscriber {
  transcribe(input: AudioInput): Promise<TranscriptionResult>;
}

export interface MandarinEvaluator {
  evaluate(input: EvaluationInput): Promise<CorrectnessEvaluation>;
}

export interface AudioMandarinEvaluator {
  evaluate(input: AudioEvaluationInput): Promise<AudioCorrectnessEvaluation>;
}
