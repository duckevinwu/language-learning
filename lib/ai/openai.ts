import "server-only";

import OpenAI, { APIError, toFile } from "openai";
import { AIProviderError } from "./errors";
import type {
  AudioInput,
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
          "You are a strict but helpful Mandarin tutor. Evaluate meaning, grammar, and naturalness against the English prompt and accepted Mandarin examples. Return JSON only.",
        max_output_tokens: 700,
        text: {
          format: {
            type: "json_schema",
            name: "mandarin_evaluation_report",
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
    const status = error.status && error.status >= 400 && error.status < 500 ? error.status : 502;

    return new AIProviderError(
      `OpenAI ${stage} failed: ${message}`,
      status,
    );
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
      task: "Evaluate a Mandarin spoken-answer transcript.",
      transcript: input.transcription.transcript,
      confidence: input.transcription.confidence,
      englishPrompt: input.challenge.englishPrompt,
      acceptableMandarinExamples: input.challenge.acceptableMandarinExamples,
      targetConcepts: input.challenge.targetConcepts,
      gradingRules: [
        "Score 0-100 integers.",
        "Grade meaning, grammar, and naturalness conservatively.",
        "Do not penalize missing punctuation.",
        "If the transcript is unrelated, empty, or not Mandarin, use low scores and provide a useful correction.",
        "correctedMandarin must be a natural answer to the English prompt in Chinese characters.",
        "pinyin must match correctedMandarin with tone marks or tone numbers.",
        "coachingTip and retryInstruction must each be one concise English sentence.",
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
    "transcript",
    "overallScore",
    "meaningScore",
    "grammarScore",
    "naturalnessScore",
    "correctedMandarin",
    "pinyin",
    "coachingTip",
    "retryInstruction",
  ],
  properties: {
    transcript: { type: "string" },
    overallScore: { type: "integer" },
    meaningScore: { type: "integer" },
    grammarScore: { type: "integer" },
    naturalnessScore: { type: "integer" },
    correctedMandarin: { type: "string" },
    pinyin: { type: "string" },
    coachingTip: { type: "string" },
    retryInstruction: { type: "string" },
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

  if (!isEvaluationReport(parsed)) {
    throw new AIProviderError(
      "The evaluator returned incomplete feedback. Try again.",
      502,
    );
  }

  return {
    ...parsed,
    transcript: parsed.transcript.trim() || input.transcription.transcript,
    overallScore: clampScore(parsed.overallScore),
    meaningScore: clampScore(parsed.meaningScore),
    grammarScore: clampScore(parsed.grammarScore),
    naturalnessScore: clampScore(parsed.naturalnessScore),
  };
}

function isEvaluationReport(value: unknown): value is EvaluationReport {
  if (!value || typeof value !== "object") {
    return false;
  }

  const report = value as Record<string, unknown>;
  const textFields = [
    "transcript",
    "correctedMandarin",
    "pinyin",
    "coachingTip",
    "retryInstruction",
  ];
  const scoreFields = [
    "overallScore",
    "meaningScore",
    "grammarScore",
    "naturalnessScore",
  ];

  return (
    textFields.every((field) => typeof report[field] === "string") &&
    scoreFields.every((field) => Number.isFinite(report[field]))
  );
}

function clampScore(score: number) {
  return Math.max(0, Math.min(100, Math.round(score)));
}