import "server-only";

import * as SpeechSDK from "microsoft-cognitiveservices-speech-sdk";
import { convertWavToAzurePcm16Mono } from "./audio-conversion";
import { AIProviderError } from "./errors";
import { clampScore } from "./openai";
import type {
  PronunciationAssessmentInput,
  PronunciationAssessmentResult,
  PronunciationAssessor,
  PronunciationIssue,
} from "./types";

const AZURE_PROVIDER = "azure-pronunciation-assessment";
const AZURE_LANGUAGE = "zh-CN";
const PRONUNCIATION_ISSUE_THRESHOLD = 80;
const MAX_PRONUNCIATION_ISSUES = 3;

type AzureWord = {
  Word?: string;
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

export class AzurePronunciationAssessor implements PronunciationAssessor {
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

    const azureAudio = convertWavToAzurePcm16Mono(input.audio);
    const speechConfig = SpeechSDK.SpeechConfig.fromSubscription(key, region);
    speechConfig.speechRecognitionLanguage = AZURE_LANGUAGE;
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
      SpeechSDK.PronunciationAssessmentGranularity.Phoneme,
      false,
    );

    pronunciationConfig.applyTo(recognizer);

    try {
      const result = await recognizeOnce(recognizer);

      if (result.reason !== SpeechSDK.ResultReason.RecognizedSpeech) {
        throw new AIProviderError(
          `Azure pronunciation assessment failed: ${result.errorDetails || SpeechSDK.ResultReason[result.reason]}`,
          502,
        );
      }

      const resultJson = result.properties.getProperty(
        SpeechSDK.PropertyId.SpeechServiceResponse_JsonResult,
      );

      return parseAzurePronunciation(JSON.parse(resultJson));
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
  return words
    .filter(isUsefulWordScore)
    .map((word) => {
      const score = clampScore(word.PronunciationAssessment?.AccuracyScore ?? 0);
      const text = word.Word?.trim() ?? "";
      const errorType = word.PronunciationAssessment?.ErrorType;

      return {
        text,
        score,
        ...(errorType && errorType !== "None" ? { errorType } : {}),
      };
    })
    .filter((issue) => issue.score < PRONUNCIATION_ISSUE_THRESHOLD)
    .sort((left, right) => left.score - right.score)
    .slice(0, MAX_PRONUNCIATION_ISSUES);
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
  const score = word.PronunciationAssessment?.AccuracyScore;

  return Boolean(word.Word?.trim()) && Number.isFinite(score);
}

function isAzurePronunciationPayload(
  payload: unknown,
): payload is AzurePronunciationPayload {
  return Boolean(payload) && typeof payload === "object";
}
