import "server-only";

import OpenAI, { APIError, toFile } from "openai";
import { AIProviderError } from "./errors";
import type {
  AudioInput,
  CorrectnessEvaluation,
  EvaluationInput,
  LanguageCode,
  LanguageEvaluator,
  SpeechTranscriber,
  TranscriptionResult,
} from "./types";
import { getLanguageProfile } from "@/lib/language";

const TRANSCRIPTION_MODEL = "gpt-transcribe";
const EVALUATION_MODEL = "gpt-5.6-luna";

let openaiClient: OpenAI | null = null;

export function getOpenAIClient() {
  if (!process.env.OPENAI_API_KEY) {
    throw new AIProviderError(
      "OPENAI_API_KEY is not configured. Add it to your environment and restart the server.",
      500,
    );
  }

  openaiClient ??= new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
  });

  return openaiClient;
}

export class OpenAISpeechTranscriber implements SpeechTranscriber {
  async transcribe(
    input: AudioInput,
    language: LanguageCode = "zh",
  ): Promise<TranscriptionResult> {
    if (input.size === 0 || input.data.byteLength === 0) {
      throw new AIProviderError("The uploaded audio file is empty.", 400);
    }

    try {
      const client = getOpenAIClient();
      const audioFile = await toFile(
        new Uint8Array(input.data),
        input.filename,
        { type: input.mimeType },
      );

      const transcription = await client.audio.transcriptions.create({
        file: audioFile,
        language: getLanguageProfile(language).transcriptionLanguage,
        model: TRANSCRIPTION_MODEL,
        prompt: buildTranscriptionPrompt(language),
        response_format: "json",
        temperature: 0,
      });

      const transcript = transcription.text.trim();

      if (!transcript) {
        throw new AIProviderError(
          "Transcription did not return any speech. Record a short answer and try again.",
          422,
        );
      }

      return {
        transcript,
        confidence: 1,
      };
    } catch (error) {
      if (error instanceof AIProviderError) {
        throw error;
      }

      throw toProviderError(error, "transcription");
    }
  }
}

export class OpenAILanguageEvaluator implements LanguageEvaluator {
  async evaluate(input: EvaluationInput): Promise<CorrectnessEvaluation> {
    try {
      const client = getOpenAIClient();
      const response = await client.responses.create({
        model: EVALUATION_MODEL,
        input: buildEvaluationPrompt(input),
        instructions: `You are a strict but helpful ${getLanguageProfile(input.language).label} coach. Score the user's transcript against the English prompt. Return JSON only.`,
        text: {
          format: {
            type: "json_schema",
            name: "language_correctness_evaluation",
            strict: true,
            schema: evaluationReportSchema,
          },
        },
      });

      return parseEvaluationReport(
        response.output_text,
      );
    } catch (error) {
      if (error instanceof AIProviderError) {
        throw error;
      }

      throw toProviderError(error, "evaluation");
    }
  }
}

export class OpenAIMandarinEvaluator extends OpenAILanguageEvaluator {}

export function toProviderError(
  error: unknown,
  stage: "transcription" | "evaluation",
) {
  if (error instanceof APIError) {
    const message = error.message || "OpenAI request failed.";
    const status =
      error.status && error.status >= 400 && error.status < 500
        ? error.status
        : 502;

    return new AIProviderError(`OpenAI ${stage} failed: ${message}`, status);
  }

  if (error instanceof Error) {
    return new AIProviderError(
      `OpenAI ${stage} failed: ${error.message}`,
      502,
    );
  }

  return new AIProviderError(
    `OpenAI ${stage} failed. Try again in a moment.`,
    502,
  );
}

function buildEvaluationPrompt(input: EvaluationInput) {
  const profile = getLanguageProfile(input.language);

  return JSON.stringify(
    {
      task: `Evaluate a ${profile.label} spoken-answer transcript for correctness.`,
      userTranscript: input.userTranscript,
      englishPrompt: input.englishPrompt,
      gradingRules: [
        "The user can express the target meaning with wording that differs from any example answer.",
        `Award full marks if userTranscript has the same meaning and is grammatically correct ${profile.label}, even when the wording differs from the example.`,
        "An entirely English answer is not a target-language answer and must receive meaningScore 0 and isCorrect false. Do not translate the transcript into the target language before scoring it.",
        "Score meaningScore and grammarScore as 0-100 integers.",
        "Score meaningScore and grammarScore independently. Do not let one score mechanically determine, cap, or pull down the other.",
        "meaningScore measures only whether the user expressed the target meaning. Missing, changed, or incorrect prompt details belong to meaningScore, not grammarScore, when the remaining sentence is grammatical target-language speech.",
        `grammarScore measures only the grammatical form of the literal transcript: ${grammarGuidance(profile.code)}`,
        `For grammarScore, ignore whether the answer matches the English prompt. A fluent, grammatical ${profile.label} sentence that answers the wrong question can score 90-100 for grammar while receiving a low meaningScore.`,
        "Do not penalize grammarScore for vocabulary choice, idiomatic preference, brevity, or omitted prompt details unless they make the actual target-language construction ungrammatical or impossible to interpret. Do not penalize pronunciation, recording quality, or punctuation.",
        "Use this grammarScore calibration: 95-100 = fully well-formed with no meaningful grammar error; 85-94 = one minor issue but clearly well-formed; 70-84 = noticeable but understandable errors; 50-69 = repeated or significant errors; 25-49 = much of the utterance is hard to parse; 0-24 = isolated words, mostly non-target-language speech, or no interpretable sentence structure.",
        "When choosing a grammarScore, first classify the transcript into one calibration band, then select a score within that band. Do not use an extreme low score for a single minor error.",
        "Set isCorrect true when the answer would be accepted as correct in a speaking practice exercise.",
        "Do not penalize missing punctuation or minor transcription punctuation differences.",
      ],
    },
    null,
    2,
  );
}

function buildTranscriptionPrompt(language: LanguageCode) {
  const profile = getLanguageProfile(language);
  const scriptGuidance =
    language === "zh"
      ? "Use Chinese characters only for Mandarin words actually spoken as Mandarin; preserve pinyin and English when they are actually spoken."
      : language === "ja"
        ? "Preserve kanji, hiragana, katakana, loanwords, and English exactly as spoken; do not turn an incorrect utterance into correct Japanese."
        : "Preserve Spanish words, accents, English words, and learner mistakes exactly as spoken; do not translate the utterance into Spanish.";

  return `The speaker is a beginner practicing ${profile.label}. Transcribe exactly what they actually say in the language and script they used, even when it is grammatically wrong, semantically wrong, incomplete, unnatural, mixed-language, or not a good answer to the prompt. ${scriptGuidance} Do not infer the intended sentence, complete missing words, or rewrite the utterance into a correct sentence.`;
}

function grammarGuidance(language: LanguageCode) {
  if (language === "zh") {
    return "Mandarin word order, sentence structure, particles, classifiers, aspect markers, negation, question placement, and whether the result is interpretable";
  }

  if (language === "ja") {
    return "Japanese word order, particles, verb forms, tense, negation, counters, politeness, and whether the result is interpretable";
  }

  return "Spanish word order, conjugation, tense, gender and number agreement, pronoun placement, negation, and whether the result is interpretable";
}

const evaluationReportSchema = {
  type: "object",
  additionalProperties: false,
  required: ["isTargetLanguage", "isCorrect", "meaningScore", "grammarScore"],
  properties: {
    isTargetLanguage: { type: "boolean" },
    isCorrect: { type: "boolean" },
    meaningScore: { type: "integer" },
    grammarScore: { type: "integer" },
  },
} as const;

function parseEvaluationReport(
  outputText: string,
): CorrectnessEvaluation {
  let parsed: unknown;

  try {
    parsed = JSON.parse(outputText);
  } catch {
    throw new AIProviderError(
      "The evaluator returned invalid feedback. Try again.",
      502,
    );
  }

  if (!isCorrectnessEvaluation(parsed)) {
    throw new AIProviderError(
      "The evaluator returned incomplete feedback. Try again.",
      502,
    );
  }

  const meaningScore = parsed.isTargetLanguage ? clampScore(parsed.meaningScore) : 0;
  const grammarScore = clampScore(parsed.grammarScore);

  return {
    isCorrect: parsed.isTargetLanguage && parsed.isCorrect,
    overallScore: calculateDeterministicScore([meaningScore, grammarScore]),
    meaningScore,
    grammarScore,
  };
}

function isCorrectnessEvaluation(
  value: unknown,
): value is CorrectnessEvaluation & { isTargetLanguage: boolean } {
  if (!value || typeof value !== "object") {
    return false;
  }

  const report = value as Record<string, unknown>;
  const scoreFields = ["meaningScore", "grammarScore"];

  return (
    typeof report.isTargetLanguage === "boolean" &&
    typeof report.isCorrect === "boolean" &&
    scoreFields.every((field) => Number.isFinite(report[field]))
  );
}

export function calculateDeterministicScore(scores: number[]) {
  if (scores.length === 0) {
    return 0;
  }

  return clampScore(
    scores.reduce((total, score) => total + score, 0) / scores.length,
  );
}
export function clampScore(score: number) {
  return Math.max(0, Math.min(100, Math.round(score)));
}
