export type Challenge = {
  id: string;
  englishPrompt: string;
  exampleMandarinAnswer: string;
  category: string;
  difficulty: "beginner";
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
};

export type TeachingItemStatus = "missing" | "misused";

export type VocabularyTeachingItem = {
  term: string;
  pinyin?: string;
  meaning: string;
  status: TeachingItemStatus;
  learnerAttempt?: string;
  learnerAttemptPinyin?: string;
  correction?: string;
  correctionPinyin?: string;
  explanation: string;
  examples: string[];
  examplePinyin?: string[];
};

export type GrammarPatternTeachingItem = {
  pattern: string;
  status: TeachingItemStatus;
  explanation: string;
  learnerAttempt?: string;
  learnerAttemptPinyin?: string;
  correction?: string;
  correctionPinyin?: string;
  examples: string[];
  examplePinyin?: string[];
};

export type TeachingFeedback = {
  summary: string;
  vocabulary: VocabularyTeachingItem[];
  grammarPatterns: GrammarPatternTeachingItem[];
  nextFocus: string;
};

export type CorrectnessEvaluation = {
  isCorrect: boolean;
  overallScore: number;
  meaningScore: number;
  grammarScore: number;
  naturalnessScore?: number;
  teaching: TeachingFeedback;
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

export type EvaluationReport = CorrectnessEvaluation & {
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
  pronunciationIssues?: PronunciationIssue[];
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
