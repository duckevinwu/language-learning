import "server-only";

import OpenAI, { APIError, toFile } from "openai";
import { AIProviderError } from "./errors";
import type {
  AudioInput,
  CorrectnessEvaluation,
  EvaluationInput,
  MandarinEvaluator,
  SpeechTranscriber,
  TranscriptionResult,
} from "./types";

const TRANSCRIPTION_MODEL = "gpt-transcribe";
const TRANSCRIPTION_LANGUAGES = ["zh", "en"];
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
  async transcribe(input: AudioInput): Promise<TranscriptionResult> {
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
        languages: TRANSCRIPTION_LANGUAGES,
        model: TRANSCRIPTION_MODEL,
        prompt:
          "The speaker is a beginner practicing Mandarin Chinese. Transcribe exactly what they actually say in the language and script they used, even when it is grammatically wrong, semantically wrong, incomplete, unnatural, mixed Mandarin/English, pinyin, or not a good answer to the prompt. Use Chinese characters only for Mandarin words that were actually spoken as Mandarin; do not translate English or pinyin into Chinese characters. Do not infer the intended sentence, do not complete missing words, and do not rewrite the utterance into correct Mandarin. Preserving beginner mistakes is required because those mistakes are what the app teaches from.",
        response_format: "json",
        temperature: 0,
      });

      const transcript = transcription.text.trim();

      if (!transcript) {
        throw new AIProviderError(
          "Transcription did not return any speech. Record a short Mandarin answer and try again.",
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

export class OpenAIMandarinEvaluator implements MandarinEvaluator {
  async evaluate(input: EvaluationInput): Promise<CorrectnessEvaluation> {
    try {
      const client = getOpenAIClient();
      const response = await client.responses.create({
        model: EVALUATION_MODEL,
        input: buildEvaluationPrompt(input),
        instructions:
          "You are a strict but helpful Mandarin coach. Score the user's transcript against the English prompt. Return JSON only.",
        text: {
          format: {
            type: "json_schema",
            name: "mandarin_correctness_evaluation",
            strict: true,
            schema: evaluationReportSchema,
          },
        },
      });

      return parseEvaluationReport(response.output_text);
    } catch (error) {
      if (error instanceof AIProviderError) {
        throw error;
      }

      throw toProviderError(error, "evaluation");
    }
  }
}

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
  return JSON.stringify(
    {
      task: "Evaluate a Mandarin spoken-answer transcript for correctness.",
      userTranscript: input.userTranscript,
      englishPrompt: input.englishPrompt,
      gradingRules: [
        "The user can express the target meaning with wording that differs from any example answer.",
        "This is a Mandarin speaking exercise, not a translation exercise. Do not award meaning credit for English words or sentences merely because they translate the prompt. An entirely English answer must receive meaningScore 0 and isCorrect false. Count every English word in englishWordCount; do not count pinyin that represents Mandarin speech. For a mixed Mandarin/English answer, reduce meaningScore by at least 15 points per English word. English words cannot receive meaning credit, and two English words cap meaningScore at 70.",
        "Award full marks if userTranscript has the same meaning and is grammatically correct Mandarin, even when the wording differs from the example.",
        "Score meaningScore and grammarScore as 0-100 integers, and englishWordCount as a non-negative integer.",
        "Score meaningScore and grammarScore independently. Do not let one score mechanically determine, cap, or pull down the other.",
        "meaningScore measures only whether the user expressed the target meaning. Missing, changed, or incorrect prompt details belong to meaningScore, not grammarScore, when the remaining sentence is grammatical Mandarin.",
        "grammarScore measures only the grammatical form of the literal transcript: Mandarin word order, sentence structure, required function words and particles, classifier use, aspect/tense markers where the utterance requires them, negation/question placement, and whether the result is syntactically interpretable.",
        "For grammarScore, ignore whether the answer matches the English prompt. A fluent, grammatical Mandarin sentence that answers the wrong question can score 90-100 for grammar while receiving a low meaningScore.",
        "Do not penalize grammarScore for vocabulary choice, idiomatic preference, brevity, or omitted prompt details unless they make the actual Mandarin construction ungrammatical or impossible to interpret. Do not penalize pronunciation, tones, recording quality, or punctuation.",
        "Use this grammarScore calibration: 95-100 = fully well-formed Mandarin with no meaningful grammar error; 85-94 = one minor grammar/word-order/particle issue but clearly well-formed; 70-84 = one noticeable or a few minor grammar errors, yet the sentence structure remains clear; 50-69 = repeated or significant grammar errors that make the sentence awkward or partly unclear; 25-49 = broken word order or missing core grammar that makes much of the utterance hard to parse; 0-24 = isolated words, mostly non-Mandarin, or no interpretable Mandarin sentence structure.",
        "When choosing a grammarScore, first classify the transcript into one calibration band, then select a score within that band. Do not use an extreme low score for a single minor error.",
        "Set isCorrect true when the answer would be accepted as correct in a speaking practice exercise.",
        "Do not penalize missing punctuation or minor transcription punctuation differences.",
      ],
    },
    null,
    2,
  );
}

const evaluationReportSchema = {
  type: "object",
  additionalProperties: false,
  required: ["isCorrect", "meaningScore", "grammarScore", "englishWordCount"],
  properties: {
    isCorrect: { type: "boolean" },
    meaningScore: { type: "integer" },
    grammarScore: { type: "integer" },
    englishWordCount: { type: "integer", minimum: 0 },
  },
} as const;

function parseEvaluationReport(outputText: string): CorrectnessEvaluation {
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

  return {
    isCorrect: parsed.isCorrect && parsed.englishWordCount === 0,
    overallScore: calculateDeterministicScore([
      parsed.meaningScore,
      parsed.grammarScore,
    ]),
    meaningScore: applyEnglishWordPenalty(
      parsed.meaningScore,
      parsed.englishWordCount,
    ),
    grammarScore: clampScore(parsed.grammarScore),
  };
}

function isCorrectnessEvaluation(
  value: unknown,
): value is CorrectnessEvaluation & { englishWordCount: number } {
  if (!value || typeof value !== "object") {
    return false;
  }

  const report = value as Record<string, unknown>;
  const scoreFields = ["meaningScore", "grammarScore", "englishWordCount"];

  return (
    typeof report.isCorrect === "boolean" &&
    scoreFields.every((field) => Number.isFinite(report[field]))
  );
}

function applyEnglishWordPenalty(score: number, englishWordCount: number) {
  const maximumScore = Math.max(
    0,
    100 - Math.max(0, Math.floor(englishWordCount)) * 15,
  );

  return Math.min(clampScore(score), maximumScore);
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
