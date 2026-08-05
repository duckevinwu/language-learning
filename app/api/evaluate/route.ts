import { AIProviderError } from "@/lib/ai/errors";
import {
  getAudioMandarinEvaluator,
  getMandarinEvaluator,
  getSpeechTranscriber,
} from "@/lib/ai/providers";
import type {
  AudioCorrectnessEvaluation,
  AudioInput,
  Challenge,
  CorrectnessEvaluation,
  EvaluationMode,
  TeachingFeedback,
} from "@/lib/ai/types";
import { getChallengeById } from "@/lib/challenge";
import { romanizeMandarin } from "@/lib/mandarin/pinyin";

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
            naturalnessScore: 0,
            teaching: {
              summary:
                "Practice this one in Mandarin Chinese with full Mandarin word order.",
              vocabulary: challenge.targetConcepts.slice(0, 1).map((concept) => ({
                term: concept,
                meaning: "Target vocabulary for this prompt.",
                status: "missing" as const,
                explanation:
                  "This prompt needs this Chinese word or phrase, but the answer was not recognizable Mandarin.",
                examples: [challenge.exampleMandarinAnswer],
              })),
              grammarPatterns: [],
              nextFocus:
                "Say the full answer in Mandarin, then compare it with the example answer.",
            },
          },
          challenge,
          evaluationMode,
        ),
      );
    }

    const evaluator = getMandarinEvaluator();
    const correctness = await evaluator.evaluate({
      userTranscript: transcription.transcript,
      exampleMandarinAnswer: challenge.exampleMandarinAnswer,
      englishPrompt: challenge.englishPrompt,
      targetConcepts: challenge.targetConcepts,
    });

    return Response.json(
      buildEvaluationReport(
        transcription.transcript,
        correctness,
        challenge,
        evaluationMode,
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
const nonMandarinScriptPattern =
  /[\p{Script=Latin}\p{Script=Cyrillic}\p{Script=Greek}\p{Script=Hangul}\p{Script=Hiragana}\p{Script=Katakana}]/u;

function isMandarinTranscript(transcript: string) {
  return (
    hanCharacterPattern.test(transcript) &&
    !nonMandarinScriptPattern.test(transcript)
  );
}

function buildEvaluationReport(
  transcript: string,
  correctness: CorrectnessEvaluation | AudioCorrectnessEvaluation,
  challenge: Challenge,
  evaluationMode: EvaluationMode,
) {
  return {
    ...correctness,
    evaluationMode,
    teaching: enrichTeachingFeedback(correctness.teaching),
    transcript,
    transcriptPinyin: romanizeMandarin(transcript),
    exampleMandarinAnswer: challenge.exampleMandarinAnswer,
    exampleMandarinPinyin: romanizeMandarin(challenge.exampleMandarinAnswer),
    ...("pronunciationScore" in correctness
      ? {
          pronunciationScore: correctness.pronunciationScore,
          toneScore: correctness.toneScore,
          pronunciationNeedsWork: correctness.pronunciationNeedsWork,
          pronunciationFeedback: correctness.pronunciationFeedback,
          pronunciationProvider: correctness.pronunciationProvider,
        }
      : {}),
  };
}


function enrichTeachingFeedback(teaching: TeachingFeedback): TeachingFeedback {
  return {
    ...teaching,
    vocabulary: teaching.vocabulary.map((item) => ({
      ...item,
      pinyin: romanizeMandarin(item.term),
      ...(item.learnerAttempt
        ? { learnerAttemptPinyin: romanizeMandarin(item.learnerAttempt) }
        : {}),
      ...(item.correction
        ? { correctionPinyin: romanizeMandarin(item.correction) }
        : {}),
      examplePinyin: item.examples.map(romanizeMandarin),
    })),
    grammarPatterns: teaching.grammarPatterns.map((item) => ({
      ...item,
      ...(item.learnerAttempt
        ? { learnerAttemptPinyin: romanizeMandarin(item.learnerAttempt) }
        : {}),
      ...(item.correction
        ? { correctionPinyin: romanizeMandarin(item.correction) }
        : {}),
      examplePinyin: item.examples.map(romanizeMandarin),
    })),
  };
}
