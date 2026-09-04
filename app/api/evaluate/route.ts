import {
  jsonWithCors,
  preflightResponse,
  rejectDisallowedOrigin,
} from "@/lib/api/cors";
import { AIProviderError } from "@/lib/ai/errors";
import { getStaticExampleBreakdown } from "@/lib/ai/example-breakdown-store";
import { calculateDeterministicScore } from "@/lib/ai/openai";
import {
  getAudioMandarinEvaluator,
  getMandarinEvaluator,
  getPronunciationAssessor,
  getSpeechTranscriber,
} from "@/lib/ai/providers";
import type {
  AudioCorrectnessEvaluation,
  AudioInput,
  Challenge,
  CorrectnessEvaluation,
  EvaluationDebug,
  EvaluationMode,
  EvaluationTiming,
  ExampleSentencePart,
  PronunciationAssessmentResult,
} from "@/lib/ai/types";
import { getChallengeById } from "@/lib/challenge";
import { romanizeMandarin, romanizeMandarinInContext } from "@/lib/mandarin/pinyin";

export async function POST(request: Request) {
  const forbidden = rejectDisallowedOrigin(request);

  if (forbidden) {
    return forbidden;
  }

  const requestStartedAt = performance.now();
  const timings: EvaluationTiming[] = [];
  const maxAudioUploadBytes = getMaxAudioUploadBytes();
  const contentLength = readContentLength(request);

  if (contentLength !== null && contentLength > maxAudioUploadBytes) {
    return jsonWithCors(
      request,
      {
        error: `Audio uploads must be ${maxAudioUploadBytes} bytes or smaller.`,
      },
      { status: 413 },
    );
  }

  let formData: FormData;

  try {
    formData = await measureAsync(timings, "server:parseFormData", () =>
      request.formData(),
    );
  } catch (error) {
    console.error("/api/evaluate form data parsing failed", error);

    return jsonWithCors(
      request,
      { error: "The request form data could not be parsed." },
      { status: 400 },
    );
  }

  const audio = formData.get("audio");
  const challengeId = formData.get("challengeId");
  const evaluationMode = parseEvaluationMode(formData.get("evaluationMode"));

  if (typeof challengeId !== "string" || challengeId.trim().length === 0) {
    return jsonWithCors(
      request,
      { error: "A valid challengeId is required." },
      { status: 400 },
    );
  }

  const challenge = getChallengeById(challengeId);

  if (!challenge) {
    return jsonWithCors(
      request,
      { error: "The requested challenge could not be found." },
      { status: 400 },
    );
  }

  if (!(audio instanceof File) || audio.size === 0) {
    return jsonWithCors(
      request,
      { error: "A non-empty audio file is required." },
      { status: 400 },
    );
  }

  if (audio.size > maxAudioUploadBytes) {
    return jsonWithCors(
      request,
      {
        error: `Audio uploads must be ${maxAudioUploadBytes} bytes or smaller.`,
      },
      { status: 413 },
    );
  }

  if (!isAllowedAudioUpload(audio)) {
    return jsonWithCors(
      request,
      { error: "Audio must be a WAV, WAVE, or WebM recording." },
      { status: 400 },
    );
  }

  const audioInput: AudioInput = {
    data: await measureAsync(timings, "server:readAudioFile", () =>
      audio.arrayBuffer(),
    ),
    mimeType: audio.type || "application/octet-stream",
    filename: audio.name || "recording.webm",
    size: audio.size,
  };
  const exampleBreakdown = measureSync(
    timings,
    "server:exampleBreakdownLookup",
    () =>
      getStaticExampleBreakdown(challenge.id) ??
      buildFallbackExampleBreakdown(challenge.exampleMandarinAnswer),
  );

  try {
    if (
      evaluationMode === "gpt-audio" ||
      evaluationMode === "transcript-gpt-audio"
    ) {
      if (!isWavAudio(audioInput)) {
        return jsonWithCors(
          request,
          { error: "GPT audio evaluation requires a WAV recording." },
          { status: 400 },
        );
      }
    }

    if (evaluationMode === "gpt-audio") {
      const evaluator = getAudioMandarinEvaluator();
      const audioCorrectness = await measureAsync(
        timings,
        "server:gptAudioEvaluation",
        () =>
          evaluator.evaluate({
            audio: audioInput,
            challenge,
          }),
      );
      const report = {
        ...measureSync(timings, "server:buildReport", () =>
          buildEvaluationReport(
            audioCorrectness.transcript,
            audioCorrectness,
            challenge,
            evaluationMode,
            exampleBreakdown,
          ),
        ),
        ...buildDebugTimingsField(timings, requestStartedAt),
      };
      logEvaluationTimings(evaluationMode, timings, requestStartedAt);
      return jsonWithCors(request, report);
    }

    const transcriber = getSpeechTranscriber();
    const transcription = await measureAsync(
      timings,
      "server:transcription",
      () => transcriber.transcribe(audioInput),
    );

    if (!isMandarinTranscript(transcription.transcript)) {
      const report = {
        ...measureSync(timings, "server:buildReport", () =>
          buildEvaluationReport(
            transcription.transcript,
            {
              isCorrect: false,
              overallScore: 0,
              meaningScore: 0,
              grammarScore: 0,
            },
            challenge,
            evaluationMode,
            exampleBreakdown,
          ),
        ),
        ...buildDebugTimingsField(timings, requestStartedAt),
      };
      logEvaluationTimings(evaluationMode, timings, requestStartedAt);
      return jsonWithCors(request, report);
    }

    if (evaluationMode === "transcript-gpt-audio") {
      const evaluator = getAudioMandarinEvaluator();
      const audioCorrectness = await measureAsync(
        timings,
        "server:transcriptGroundedGptAudioEvaluation",
        () =>
          evaluator.evaluate({
            audio: audioInput,
            challenge,
            authoritativeTranscript: transcription.transcript,
          }),
      );
      const report = {
        ...measureSync(timings, "server:buildReport", () =>
          buildEvaluationReport(
            transcription.transcript,
            audioCorrectness,
            challenge,
            evaluationMode,
            exampleBreakdown,
          ),
        ),
        ...buildDebugTimingsField(timings, requestStartedAt),
      };
      logEvaluationTimings(evaluationMode, timings, requestStartedAt);
      return jsonWithCors(request, report);
    }

    const evaluator = getMandarinEvaluator();
    const pronunciationAssessor = getPronunciationAssessor();
    const parallelStartedAt = performance.now();
    const [correctness, pronunciation] = await Promise.all([
      measureAsync(timings, "server:correctnessEvaluation", () =>
        evaluator.evaluate({
          userTranscript: transcription.transcript,
          englishPrompt: challenge.englishPrompt,
          allowedEnglishTokens: getAllowedEnglishTokens(
            challenge.exampleMandarinAnswer,
          ),
        }),
      ),
      measureAsync(timings, "server:pronunciationAssessment", () =>
        pronunciationAssessor.assess({
          audio: audioInput,
          referenceText: transcription.transcript,
        }),
      ),
    ]);
    recordTiming(timings, "server:parallelEvaluation", parallelStartedAt);

    const report = {
      ...measureSync(timings, "server:buildReport", () =>
        buildEvaluationReport(
          transcription.transcript,
          correctness,
          challenge,
          evaluationMode,
          exampleBreakdown,
          pronunciation,
        ),
      ),
      ...buildDebugTimingsField(timings, requestStartedAt),
    };
    logEvaluationTimings(evaluationMode, timings, requestStartedAt);
    return jsonWithCors(request, report);
  } catch (error) {
    recordTiming(timings, "server:totalBeforeError", requestStartedAt);
    console.error("/api/evaluate failed", error);
    if (error instanceof AIProviderError) {
      return buildProviderErrorResponse(request, error);
    }

    return jsonWithCors(
      request,
      { error: "The upstream AI service failed. Try again in a moment." },
      { status: 502 },
    );
  }
}

export async function OPTIONS(request: Request) {
  return preflightResponse(request, ["POST", "OPTIONS"]);
}

async function measureAsync<T>(
  timings: EvaluationTiming[],
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
  timings: EvaluationTiming[],
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

function recordTiming(
  timings: EvaluationTiming[],
  label: string,
  startedAt: number,
) {
  timings.push({
    label,
    durationMs: roundDuration(performance.now() - startedAt),
  });
}

function logEvaluationTimings(
  evaluationMode: EvaluationMode,
  timings: EvaluationTiming[],
  requestStartedAt: number,
) {
  console.info("Audio evaluation timings", {
    evaluationMode,
    timings: [
      ...timings,
      {
        label: "server:total",
        durationMs: roundDuration(performance.now() - requestStartedAt),
      },
    ],
  });
}

function buildDebugTimingsField(
  timings: EvaluationTiming[],
  requestStartedAt: number,
): { debugTimings?: EvaluationDebug } {
  if (!shouldIncludeDebugTimings()) {
    return {};
  }

  return {
    debugTimings: buildDebugTimings(timings, requestStartedAt),
  };
}

function buildDebugTimings(
  timings: EvaluationTiming[],
  requestStartedAt: number,
): EvaluationDebug {
  return {
    server: [
      ...timings,
      {
        label: "server:total",
        durationMs: roundDuration(performance.now() - requestStartedAt),
      },
    ],
  };
}

function getMaxAudioUploadBytes() {
  const configuredValue = Number(process.env.MAX_AUDIO_UPLOAD_BYTES);

  return Number.isFinite(configuredValue) && configuredValue > 0
    ? configuredValue
    : 5000000;
}

function readContentLength(request: Request) {
  const value = request.headers.get("content-length");

  if (!value) {
    return null;
  }

  const contentLength = Number(value);

  return Number.isFinite(contentLength) && contentLength >= 0
    ? contentLength
    : null;
}

function isAllowedAudioUpload(audio: File) {
  const filename = audio.name.toLowerCase();
  const hasValidExtension =
    filename.endsWith(".wav") ||
    filename.endsWith(".wave") ||
    filename.endsWith(".webm");
  const mimeType = audio.type.toLowerCase();

  if (mimeType === "application/octet-stream") {
    return hasValidExtension;
  }

  return (
    mimeType === "audio/wav" ||
    mimeType === "audio/wave" ||
    mimeType === "audio/webm"
  );
}

function shouldIncludeDebugTimings() {
  return (
    process.env.NODE_ENV !== "production" ||
    process.env.INCLUDE_DEBUG_TIMINGS === "true"
  );
}

function buildProviderErrorResponse(request: Request, error: AIProviderError) {
  if (process.env.NODE_ENV === "production" && isUpstreamProviderError(error)) {
    return jsonWithCors(
      request,
      { error: "The upstream AI service failed. Try again in a moment." },
      { status: normalizeUpstreamErrorStatus(error.status) },
    );
  }

  return jsonWithCors(
    request,
    { error: error.message },
    { status: error.status },
  );
}

function isUpstreamProviderError(error: AIProviderError) {
  return (
    error.status >= 500 ||
    error.status === 401 ||
    error.status === 403 ||
    error.status === 429 ||
    error.message.startsWith("OpenAI ") ||
    error.message.startsWith("Azure ")
  );
}

function normalizeUpstreamErrorStatus(status: number) {
  return status >= 400 && status < 600 ? status : 502;
}

function roundDuration(durationMs: number) {
  return Math.round(durationMs * 10) / 10;
}

function parseEvaluationMode(value: FormDataEntryValue | null): EvaluationMode {
  return value === "standard" ||
    value === "gpt-audio" ||
    value === "transcript-gpt-audio"
    ? value
    : "transcript-gpt-audio";
}

function getAllowedEnglishTokens(exampleMandarinAnswer: string) {
  return [
    ...new Set(
      exampleMandarinAnswer.match(/[A-Za-z][A-Za-z'-]*/g)?.filter(
        (token) => /^[A-Z]/.test(token),
      ) ?? [],
    ),
  ];
}

function isWavAudio(audio: AudioInput) {
  return (
    audio.mimeType === "audio/wav" ||
    audio.mimeType === "audio/wave" ||
    audio.filename.toLowerCase().endsWith(".wav")
  );
}

const hanCharacterPattern = /\p{Script=Han}/u;

function isMandarinTranscript(transcript: string) {
  return hasHanCharacters(transcript);
}

function hasHanCharacters(text: string) {
  return hanCharacterPattern.test(text);
}

function buildEvaluationReport(
  transcript: string,
  correctness: CorrectnessEvaluation | AudioCorrectnessEvaluation,
  challenge: Challenge,
  evaluationMode: EvaluationMode,
  exampleBreakdown: ExampleSentencePart[],
  pronunciation?: PronunciationAssessmentResult,
) {
  const pronunciationFields = readPronunciationFields(
    transcript,
    correctness,
    pronunciation,
  );

  return {
    ...correctness,
    overallScore: calculateVisibleOverallScore(correctness, pronunciation),
    evaluationMode,
    transcript,
    transcriptPinyin: romanizeMandarin(transcript),
    exampleMandarinAnswer: challenge.exampleMandarinAnswer,
    exampleMandarinPinyin: romanizeMandarin(challenge.exampleMandarinAnswer),
    exampleBreakdown: enrichExampleBreakdown(
      exampleBreakdown,
      challenge.exampleMandarinAnswer,
    ),
    ...pronunciationFields,
  };
}

function enrichExampleBreakdown(
  breakdown: ExampleSentencePart[],
  exampleMandarinAnswer: string,
): ExampleSentencePart[] {
  const occurrenceCounts = new Map<string, number>();
  const parts = breakdown.length
    ? breakdown
    : buildFallbackExampleBreakdown(exampleMandarinAnswer);

  return parts.map((part) => {
    const occurrenceIndex = occurrenceCounts.get(part.text) ?? 0;
    occurrenceCounts.set(part.text, occurrenceIndex + 1);
    const pinyin = hasHanCharacters(part.text)
      ? romanizeMandarinInContext(part.text, exampleMandarinAnswer, {
          occurrenceIndex,
        })
      : undefined;

    return {
      ...part,
      ...(pinyin ? { pinyin } : {}),
    };
  });
}

function buildFallbackExampleBreakdown(
  exampleMandarinAnswer: string,
): ExampleSentencePart[] {
  return [
    {
      text: exampleMandarinAnswer,
      definition: "Example answer",
    },
  ];
}

function calculateVisibleOverallScore(
  correctness: CorrectnessEvaluation | AudioCorrectnessEvaluation,
  pronunciation?: PronunciationAssessmentResult,
) {
  return calculateDeterministicScore([
    correctness.meaningScore,
    correctness.grammarScore,
    pronunciation?.pronunciationScore ??
      ("pronunciationScore" in correctness
        ? correctness.pronunciationScore
        : correctness.overallScore),
  ]);
}

function readPronunciationFields(
  transcript: string,
  correctness: CorrectnessEvaluation | AudioCorrectnessEvaluation,
  pronunciation?: PronunciationAssessmentResult,
) {
  if (pronunciation) {
    return enrichPronunciationAssessment(pronunciation, transcript);
  }

  if ("pronunciationScore" in correctness) {
    return {
      pronunciationScore: correctness.pronunciationScore,
      toneScore: correctness.toneScore,
      pronunciationNeedsWork: correctness.pronunciationNeedsWork,
      pronunciationFeedback: correctness.pronunciationFeedback,
      pronunciationProvider: correctness.pronunciationProvider,
    };
  }

  return {};
}

function enrichPronunciationAssessment(
  pronunciation: PronunciationAssessmentResult,
  transcript: string,
): PronunciationAssessmentResult {
  return {
    ...pronunciation,
    ...(pronunciation.pronunciationIssues
      ? {
          pronunciationIssues: pronunciation.pronunciationIssues.map((issue) => {
            const pinyin = hasHanCharacters(issue.text)
              ? romanizeMandarinInContext(issue.text, transcript, {
                  hanStartIndex: issue.textHanStartIndex,
                  occurrenceIndex: issue.textOccurrenceIndex,
                })
              : undefined;

            return {
              ...issue,
              ...(pinyin ? { pinyin } : {}),
            };
          }),
        }
      : {}),
  };
}
