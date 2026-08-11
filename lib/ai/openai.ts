import "server-only";

import OpenAI, { APIError, toFile } from "openai";
import { AIProviderError } from "./errors";
import { normalizeTeachingFeedback, teachingFeedbackSchema } from "./teaching";
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
          "You are a strict but helpful Mandarin coach. Score the user's transcript, then return structured learner-facing teaching feedback about vocabulary and Chinese grammar patterns. Return JSON only.",
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
      exampleMandarinAnswer: input.exampleMandarinAnswer,
      englishPrompt: input.englishPrompt,
      gradingRules: [
        "The exampleMandarinAnswer is only one correct example, not the only valid answer.",
        "Award full marks if userTranscript has the same meaning and is grammatically correct Mandarin, even when the wording differs from the example.",
        "Score meaningScore and grammarScore as 0-100 integers.",
        "meaningScore measures whether the user expressed the target meaning.",
        "grammarScore measures Mandarin grammar and word order.",
        "Set isCorrect true when the answer would be accepted as correct in a speaking practice exercise.",
        "Do not penalize missing punctuation or minor transcription punctuation differences.",
        "teaching.summary is for the learner, not an explanation of scoring. Keep it to one concise English sentence.",
        "teaching.vocabulary should list at most 1 high-impact vocabulary item, and only when the learner missed, misused, or chose a noticeably non-optimal word or phrase. Return an empty array when vocabulary is correct and natural.",
        "Mark vocabulary as missing when the needed word or phrase is absent, and misused when the learner used the wrong, awkward, or noticeably non-optimal word or phrase. Do not include vocabulary just to introduce new words or reinforce correct usage.",
        "teaching.grammarPatterns should list at most 1 common beginner Mandarin pattern, and only when the learner missed, misused, or used a noticeably non-optimal structure. Return an empty array when grammar is correct and natural.",
        "For each teaching item, include 1-2 short Mandarin examples. Do not include pinyin; the app adds pinyin automatically.",
        "Keep teaching focused: include only corrective items, choosing the single most important vocabulary issue and the single most important grammar pattern at most.",
        "teaching.nextFocus should be one concrete correction to practice next. If the answer is optimal, say no vocabulary or grammar correction is needed.",
        "Do not mention scores, points, grading categories, or evaluator reasoning in teaching fields.",
      ],
    },
    null,
    2,
  );
}

const evaluationReportSchema = {
  type: "object",
  additionalProperties: false,
  required: [
    "isCorrect",
    "meaningScore",
    "grammarScore",
    "teaching",
  ],
  properties: {
    isCorrect: { type: "boolean" },
    meaningScore: { type: "integer" },
    grammarScore: { type: "integer" },
    teaching: teachingFeedbackSchema,
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

  const teaching = normalizeTeachingFeedback(parsed.teaching);

  if (!teaching) {
    throw new AIProviderError(
      "The evaluator returned incomplete teaching feedback. Try again.",
      502,
    );
  }

  return {
    isCorrect: parsed.isCorrect,
    overallScore: calculateDeterministicScore([
      parsed.meaningScore,
      parsed.grammarScore,
    ]),
    meaningScore: clampScore(parsed.meaningScore),
    grammarScore: clampScore(parsed.grammarScore),
    teaching,
  };
}

function isCorrectnessEvaluation(
  value: unknown,
): value is CorrectnessEvaluation {
  if (!value || typeof value !== "object") {
    return false;
  }

  const report = value as Record<string, unknown>;
  const scoreFields = ["meaningScore", "grammarScore"];

  return (
    typeof report.isCorrect === "boolean" &&
    normalizeTeachingFeedback(report.teaching) !== null &&
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
