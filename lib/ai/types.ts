export type ChallengeDifficulty = "beginner" | "intermediate" | "advanced";

export type Challenge = {
  id: string;
  englishPrompt: string;
  exampleMandarinAnswer: string;
  category: string;
  difficulty: ChallengeDifficulty;
  notes?: string;
};

export type PublicChallenge = Omit<Challenge, "exampleMandarinAnswer">;

export type PublicDailyChallenge = {
  id: string;
  challenges: [PublicChallenge, PublicChallenge, PublicChallenge];
};

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
  englishPrompt?: string;
};

export type ExampleSentencePart = {
  text: string;
  pinyin?: string;
  definition: string;
};

export type CorrectnessEvaluation = {
  isCorrect: boolean;
  overallScore: number;
  meaningScore: number;
  grammarScore: number;
  naturalnessScore?: number;
  exampleBreakdown?: ExampleSentencePart[];
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

export type PronunciationAssessmentInput = {
  audio: AudioInput;
  referenceText: string;
};

export type PronunciationIssue = {
  text: string;
  pinyin?: string;
  score: number;
  errorType?: string;
  wordIndex?: number;
  textOccurrenceIndex?: number;
  textHanStartIndex?: number;
  offset?: number;
  duration?: number;
};

export type PronunciationAssessmentResult = {
  pronunciationScore: number;
  pronunciationNeedsWork: boolean;
  pronunciationFeedback?: string;
  pronunciationProvider: string;
  pronunciationIssues?: PronunciationIssue[];
};

export type EvaluationTiming = {
  label: string;
  durationMs: number;
};

export type EvaluationDebug = {
  client?: EvaluationTiming[];
  server?: EvaluationTiming[];
  audioBytes?: {
    original: number;
    submitted: number;
  };
};

export type EvaluationReport = CorrectnessEvaluation & {
  transcript: string;
  transcriptPinyin: string;
  exampleMandarinAnswer: string;
  exampleMandarinPinyin: string;
  exampleBreakdown: ExampleSentencePart[];
  evaluationMode?: EvaluationMode;
  pronunciationScore?: number;
  toneScore?: number;
  pronunciationNeedsWork?: boolean;
  pronunciationFeedback?: string;
  pronunciationProvider?: string;
  pronunciationIssues?: PronunciationIssue[];
  debugTimings?: EvaluationDebug;
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

export interface PronunciationAssessor {
  assess(
    input: PronunciationAssessmentInput,
  ): Promise<PronunciationAssessmentResult>;
}
