import "server-only";

import * as SpeechSDK from "microsoft-cognitiveservices-speech-sdk";
import {
  convertWavToAzurePcm16Mono,
  isAzurePcm16MonoWav,
} from "./audio-conversion";
import { AIProviderError } from "./errors";
import { clampScore } from "./openai";
import type {
  PronunciationAssessmentInput,
  PronunciationAssessmentResult,
  PronunciationAssessor,
  PronunciationIssue,
  LanguageCode,
} from "./types";
import { getLanguageProfile } from "@/lib/language";

const AZURE_PROVIDER = "azure-pronunciation-assessment";
const PRONUNCIATION_ISSUE_THRESHOLD = 80;
const MAX_PRONUNCIATION_ISSUES = 3;
const hanCharacterPattern = /[\u3400-\u9fff]/u;

type AzureWord = {
  Word?: string;
  Offset?: number;
  Duration?: number;
  PronunciationAssessment?: {
    AccuracyScore?: number;
    ErrorType?: string;
  };
};

type AzurePronunciationPayload = {
  RecognitionStatus?: string;
  DisplayText?: string;
  NBest?: Array<{
    Display?: string;
    PronunciationAssessment?: {
      AccuracyScore?: number;
      FluencyScore?: number;
      CompletenessScore?: number;
      PronScore?: number;
    };
    Words?: AzureWord[];
  }>;
};

type AzureTiming = {
  label: string;
  durationMs: number;
};

export class AzurePronunciationAssessor implements PronunciationAssessor {
  constructor(private readonly language: LanguageCode = "zh") {}

  async assess(
    input: PronunciationAssessmentInput,
  ): Promise<PronunciationAssessmentResult> {
    if (input.audio.size === 0 || input.audio.data.byteLength === 0) {
      throw new AIProviderError("The uploaded audio file is empty.", 400);
    }

    const key = process.env.AZURE_SPEECH_KEY;
    const region = process.env.AZURE_SPEECH_REGION;

    if (!key || !region) {
      throw new AIProviderError(
        "AZURE_SPEECH_KEY and AZURE_SPEECH_REGION are required for standard pronunciation assessment.",
        500,
      );
    }

    const timings: AzureTiming[] = [];
    const azureAudio = measureSync(timings, "azure:prepareAudio", () =>
      isAzurePcm16MonoWav(input.audio)
        ? { ...input.audio, filename: "azure-pronunciation.wav" }
        : convertWavToAzurePcm16Mono(input.audio),
    );
    const speechConfig = SpeechSDK.SpeechConfig.fromSubscription(key, region);
    speechConfig.speechRecognitionLanguage = getLanguageProfile(this.language).azureLocale;
    speechConfig.outputFormat = SpeechSDK.OutputFormat.Detailed;

    const audioConfig = SpeechSDK.AudioConfig.fromWavFileInput(
      Buffer.from(azureAudio.data),
      azureAudio.filename,
    );
    const recognizer = new SpeechSDK.SpeechRecognizer(
      speechConfig,
      audioConfig,
    );
    const pronunciationConfig = new SpeechSDK.PronunciationAssessmentConfig(
      input.referenceText,
      SpeechSDK.PronunciationAssessmentGradingSystem.HundredMark,
      SpeechSDK.PronunciationAssessmentGranularity.Word,
      false,
    );

    pronunciationConfig.applyTo(recognizer);

    try {
      const result = await measureAsync(timings, "azure:recognizeOnce", () =>
        recognizeOnce(recognizer),
      );

      if (result.reason !== SpeechSDK.ResultReason.RecognizedSpeech) {
        throw new AIProviderError(
          `Azure pronunciation assessment failed: ${result.errorDetails || SpeechSDK.ResultReason[result.reason]}`,
          502,
        );
      }

      const resultJson = result.properties.getProperty(
        SpeechSDK.PropertyId.SpeechServiceResponse_JsonResult,
      );

      return measureSync(timings, "azure:parseResult", () =>
        parseAzurePronunciation(JSON.parse(resultJson)),
      );
    } catch (error) {
      if (error instanceof AIProviderError) {
        throw error;
      }

      throw new AIProviderError(
        error instanceof Error
          ? `Azure pronunciation assessment failed: ${error.message}`
          : "Azure pronunciation assessment failed.",
        502,
      );
    } finally {
      recognizer.close();
      audioConfig.close();
    }
  }
}

async function measureAsync<T>(
  timings: AzureTiming[],
  label: string,
  task: () => Promise<T>,
): Promise<T> {
  const startedAt = performance.now();

  try {
    return await task();
  } finally {
    recordTiming(timings, label, startedAt);
  }
}

function measureSync<T>(
  timings: AzureTiming[],
  label: string,
  task: () => T,
): T {
  const startedAt = performance.now();

  try {
    return task();
  } finally {
    recordTiming(timings, label, startedAt);
  }
}

function recordTiming(timings: AzureTiming[], label: string, startedAt: number) {
  timings.push({
    label,
    durationMs: Math.round((performance.now() - startedAt) * 10) / 10,
  });
}

function recognizeOnce(
  recognizer: SpeechSDK.SpeechRecognizer,
): Promise<SpeechSDK.SpeechRecognitionResult> {
  return new Promise((resolve, reject) => {
    recognizer.recognizeOnceAsync(resolve, reject);
  });
}

function parseAzurePronunciation(
  payload: unknown,
): PronunciationAssessmentResult {
  if (!isAzurePronunciationPayload(payload)) {
    throw new AIProviderError(
      "Azure pronunciation assessment returned incomplete feedback.",
      502,
    );
  }

  const best = payload.NBest?.[0];
  const rawScore = readFullTextPronunciationScore(best);

  if (!Number.isFinite(rawScore)) {
    throw new AIProviderError(
      buildMissingPronunciationScoreMessage(payload),
      502,
    );
  }

  const pronunciationScore = clampScore(rawScore ?? 0);
  const pronunciationIssues = buildPronunciationIssues(best?.Words ?? []);
  const pronunciationNeedsWork =
    pronunciationScore < 80 || pronunciationIssues.length > 0;
  return {
    pronunciationScore,
    pronunciationNeedsWork,
    pronunciationProvider: AZURE_PROVIDER,
    ...(pronunciationIssues.length ? { pronunciationIssues } : {}),
  };
}

function buildPronunciationIssues(words: AzureWord[]): PronunciationIssue[] {
  const textOccurrenceCounts = new Map<string, number>();
  let textHanCursor = 0;

  return words
    .map((word, wordIndex) => {
      const text = word.Word?.trim() ?? "";
      const textOccurrenceIndex = textOccurrenceCounts.get(text) ?? 0;
      const textHanStartIndex = textHanCursor;

      textOccurrenceCounts.set(text, textOccurrenceIndex + 1);
      textHanCursor += countHanCharacters(text);

      return { word, wordIndex, text, textOccurrenceIndex, textHanStartIndex };
    })
    .filter(({ word }) => isUsefulWordScore(word))
    .map(({ word, wordIndex, text, textOccurrenceIndex, textHanStartIndex }) => {
      const score = clampScore(word.PronunciationAssessment?.AccuracyScore ?? 0);
      const errorType = word.PronunciationAssessment?.ErrorType;

      return {
        text,
        score,
        wordIndex,
        textOccurrenceIndex,
        textHanStartIndex,
        ...(errorType && errorType !== "None" ? { errorType } : {}),
        ...(Number.isFinite(word.Offset) ? { offset: word.Offset } : {}),
        ...(Number.isFinite(word.Duration) ? { duration: word.Duration } : {}),
      };
    })
    .filter((issue) => issue.score < PRONUNCIATION_ISSUE_THRESHOLD)
    .sort((left, right) => left.score - right.score)
    .slice(0, MAX_PRONUNCIATION_ISSUES);
}

function countHanCharacters(text: string) {
  return Array.from(text).filter((character) =>
    hanCharacterPattern.test(character),
  ).length;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function readFullTextPronunciationScore(
  best: NonNullable<AzurePronunciationPayload["NBest"]>[number] | undefined,
) {
  const assessment = best?.PronunciationAssessment;

  if (Number.isFinite(assessment?.PronScore)) {
    return assessment?.PronScore;
  }

  if (Number.isFinite(assessment?.AccuracyScore)) {
    return assessment?.AccuracyScore;
  }

  const wordScores = (best?.Words ?? [])
    .map((word) => word.PronunciationAssessment?.AccuracyScore)
    .filter(isFiniteNumber);

  if (wordScores.length) {
    return (
      wordScores.reduce((total, score) => total + score, 0) / wordScores.length
    );
  }

  return undefined;
}

function buildMissingPronunciationScoreMessage(
  payload: AzurePronunciationPayload,
) {
  const status = readPayloadField(payload, "RecognitionStatus");
  const displayText = readPayloadField(payload, "DisplayText");
  const details = [
    status ? `status: ${status}` : undefined,
    displayText ? `display: ${displayText}` : undefined,
  ].filter(Boolean).join(", ");

  return details
    ? `Azure recognized the audio but did not return pronunciation assessment scores (${details}).`
    : "Azure pronunciation assessment did not return pronunciation scores.";
}

function readPayloadField(
  payload: AzurePronunciationPayload,
  field: string,
) {
  const value = (payload as Record<string, unknown>)[field];

  return typeof value === "string" || typeof value === "number"
    ? String(value)
    : undefined;
}

function isUsefulWordScore(word: AzureWord) {
  const text = word.Word?.trim() ?? "";
  const score = word.PronunciationAssessment?.AccuracyScore;

  return text.length > 0 && Number.isFinite(score);
}

function isAzurePronunciationPayload(
  payload: unknown,
): payload is AzurePronunciationPayload {
  return Boolean(payload) && typeof payload === "object";
}
