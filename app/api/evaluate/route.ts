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
  const requestStartedAt = performance.now();
  const timings: EvaluationTiming[] = [];
  const formData = await measureAsync(timings, "server:parseFormData", () =>
    request.formData(),
  );
  const audio = formData.get("audio");
  const challengeId = formData.get("challengeId");
  const evaluationMode = parseEvaluationMode(formData.get("evaluationMode"));

  if (typeof challengeId !== "string" || challengeId.trim().length === 0) {
    return Response.json(
      { error: "A valid challengeId is required." },
      { status: 400 },
    );
  }

  const challenge = getChallengeById(challengeId);

  if (!challenge) {
    return Response.json(
      { error: "The requested challenge could not be found." },
      { status: 400 },
    );
  }

  if (!(audio instanceof File) || audio.size === 0) {
    return Response.json(
      { error: "A non-empty audio file is required." },
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
    if (evaluationMode === "gpt-audio") {
      if (!isWavAudio(audioInput)) {
        return Response.json(
          { error: "GPT audio evaluation requires a WAV recording." },
          { status: 400 },
        );
      }

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
        debugTimings: buildDebugTimings(timings, requestStartedAt),
      };
      logEvaluationTimings(challengeId, evaluationMode, timings);

      return Response.json(report);
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
        debugTimings: buildDebugTimings(timings, requestStartedAt),
      };
      logEvaluationTimings(challengeId, evaluationMode, timings);

      return Response.json(report);
    }

    const evaluator = getMandarinEvaluator();
    const pronunciationAssessor = getPronunciationAssessor();
    const parallelStartedAt = performance.now();
    const [correctness, pronunciation] = await Promise.all([
      measureAsync(timings, "server:correctnessEvaluation", () =>
        evaluator.evaluate({
          userTranscript: transcription.transcript,
          englishPrompt: challenge.englishPrompt,
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
      debugTimings: buildDebugTimings(timings, requestStartedAt),
    };
    logEvaluationTimings(challengeId, evaluationMode, timings);

    return Response.json(report);
  } catch (error) {
    recordTiming(timings, "server:totalBeforeError", requestStartedAt);
    console.error("/api/evaluate failed", error);
    logEvaluationTimings(
      typeof challengeId === "string" ? challengeId : "unknown",
      evaluationMode,
      timings,
    );

    if (error instanceof AIProviderError) {
      return Response.json({ error: error.message }, { status: error.status });
    }

    return Response.json(
      { error: "The upstream AI service failed. Try again in a moment." },
      { status: 502 },
    );
  }
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

function logEvaluationTimings(
  challengeId: string,
  evaluationMode: EvaluationMode,
  timings: EvaluationTiming[],
) {
  console.info("/api/evaluate timings", {
    challengeId,
    evaluationMode,
    timings,
  });
}

function roundDuration(durationMs: number) {
  return Math.round(durationMs * 10) / 10;
}

function parseEvaluationMode(value: FormDataEntryValue | null): EvaluationMode {
  return value === "gpt-audio" ? "gpt-audio" : "standard";
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
