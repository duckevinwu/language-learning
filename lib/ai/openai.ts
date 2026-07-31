import "server-only";

import OpenAI, { APIError, toFile } from "openai";
import { AIProviderError } from "./errors";
import type {
  AudioInput,
  CorrectnessEvaluation,
  EvaluationInput,
  EvaluationReport,
  MandarinEvaluator,
  SpeechTranscriber,
  TranscriptionResult,
} from "./types";

const TRANSCRIPTION_MODEL = "gpt-transcribe";
const EVALUATION_MODEL = "gpt-5.6-luna";

let openaiClient: OpenAI | null = null;

function getOpenAIClient() {
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
        model: TRANSCRIPTION_MODEL,
        language: "zh",
        prompt:
          "The speaker is practicing Mandarin Chinese. Transcribe only what they said in Chinese characters.",
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
  async evaluate(input: EvaluationInput): Promise<EvaluationReport> {
    try {
      const client = getOpenAIClient();
      const response = await client.responses.create({
        model: EVALUATION_MODEL,
        input: buildEvaluationPrompt(input),
        instructions:
          "You are a strict Mandarin evaluator. Judge only whether the user's transcript is semantically correct and grammatically natural. Do not generate a corrected translation, pinyin, or retry instruction. Return JSON only.",
        max_output_tokens: 450,
        text: {
          format: {
            type: "json_schema",
            name: "mandarin_correctness_evaluation",
            strict: true,
            schema: evaluationReportSchema,
          },
        },
      });

      return parseEvaluationReport(response.output_text, input);
    } catch (error) {
      if (error instanceof AIProviderError) {
        throw error;
      }

      throw toProviderError(error, "evaluation");
    }
  }
}

function toProviderError(error: unknown, stage: "transcription" | "evaluation") {
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
      targetConcepts: input.targetConcepts,
      gradingRules: [
        "The exampleMandarinAnswer is only one correct example, not the only valid answer.",
        "Award full marks if userTranscript has the same meaning and is grammatically correct Mandarin, even when the wording differs from the example.",
        "Score 0-100 integers.",
        "meaningScore measures whether the user expressed the target meaning.",
        "grammarScore measures Mandarin grammar and word order.",
        "naturalnessScore measures whether the wording sounds natural to a Mandarin speaker.",
        "overallScore should reflect the practical correctness of the user's answer.",
        "Set isCorrect true when the answer would be accepted as correct in a speaking practice exercise.",
        "Do not penalize missing punctuation or minor transcription punctuation differences.",
        "Do not generate a corrected answer, pinyin, or retry instruction.",
        "feedback must be one concise English sentence about correctness only.",
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
    "overallScore",
    "meaningScore",
    "grammarScore",
    "naturalnessScore",
    "feedback",
  ],
  properties: {
    isCorrect: { type: "boolean" },
    overallScore: { type: "integer" },
    meaningScore: { type: "integer" },
    grammarScore: { type: "integer" },
    naturalnessScore: { type: "integer" },
    feedback: { type: "string" },
  },
} as const;

function parseEvaluationReport(
  outputText: string,
  input: EvaluationInput,
): EvaluationReport {
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
    transcript: input.userTranscript,
    isCorrect: parsed.isCorrect,
    overallScore: clampScore(parsed.overallScore),
    meaningScore: clampScore(parsed.meaningScore),
    grammarScore: clampScore(parsed.grammarScore),
    naturalnessScore: clampScore(parsed.naturalnessScore),
    feedback: parsed.feedback.trim(),
  };
}

function isCorrectnessEvaluation(
  value: unknown,
): value is CorrectnessEvaluation {
  if (!value || typeof value !== "object") {
    return false;
  }

  const report = value as Record<string, unknown>;
  const textFields = ["feedback"];
  const scoreFields = [
    "overallScore",
    "meaningScore",
    "grammarScore",
    "naturalnessScore",
  ];

  return (
    typeof report.isCorrect === "boolean" &&
    textFields.every((field) => typeof report[field] === "string") &&
    scoreFields.every((field) => Number.isFinite(report[field]))
  );
}

function clampScore(score: number) {
  return Math.max(0, Math.min(100, Math.round(score)));
}
