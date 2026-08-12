import { AIProviderError } from "@/lib/ai/errors";
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
  EvaluationMode,
  ExampleSentencePart,
  PronunciationAssessmentResult,
} from "@/lib/ai/types";
import { getChallengeById } from "@/lib/challenge";
import { romanizeMandarin, romanizeMandarinInContext } from "@/lib/mandarin/pinyin";

export async function POST(request: Request) {
  const formData = await request.formData();
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
    data: await audio.arrayBuffer(),
    mimeType: audio.type || "application/octet-stream",
    filename: audio.name || "recording.webm",
    size: audio.size,
  };

  try {
    if (evaluationMode === "gpt-audio") {
      if (!isWavAudio(audioInput)) {
        return Response.json(
          { error: "GPT audio evaluation requires a WAV recording." },
          { status: 400 },
        );
      }

      const evaluator = getAudioMandarinEvaluator();
      const audioCorrectness = await evaluator.evaluate({
        audio: audioInput,
        challenge,
      });

      return Response.json(
        buildEvaluationReport(
          audioCorrectness.transcript,
          audioCorrectness,
          challenge,
          evaluationMode,
        ),
      );
    }

    const transcriber = getSpeechTranscriber();
    const transcription = await transcriber.transcribe(audioInput);

    if (!isMandarinTranscript(transcription.transcript)) {
      return Response.json(
        buildEvaluationReport(
          transcription.transcript,
          {
            isCorrect: false,
            overallScore: 0,
            meaningScore: 0,
            grammarScore: 0,
            exampleBreakdown: buildFallbackExampleBreakdown(
              challenge.exampleMandarinAnswer,
            ),
          },
          challenge,
          evaluationMode,
        ),
      );
    }

    const evaluator = getMandarinEvaluator();
    const pronunciationAssessor = getPronunciationAssessor();
    const [correctness, pronunciation] = await Promise.all([
      evaluator.evaluate({
        userTranscript: transcription.transcript,
        exampleMandarinAnswer: challenge.exampleMandarinAnswer,
        englishPrompt: challenge.englishPrompt,
      }),
      pronunciationAssessor.assess({
        audio: audioInput,
        referenceText: transcription.transcript,
      }),
    ]);

    return Response.json(
      buildEvaluationReport(
        transcription.transcript,
        correctness,
        challenge,
        evaluationMode,
        pronunciation,
      ),
    );
  } catch (error) {
    console.error("/api/evaluate failed", error);

    if (error instanceof AIProviderError) {
      return Response.json({ error: error.message }, { status: error.status });
    }

    return Response.json(
      { error: "The upstream AI service failed. Try again in a moment." },
      { status: 502 },
    );
  }
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
      correctness.exampleBreakdown,
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
