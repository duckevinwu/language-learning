import { AIProviderError } from "@/lib/ai/errors";
import { getMandarinEvaluator, getSpeechTranscriber } from "@/lib/ai/providers";
import type { AudioInput, CorrectnessEvaluation } from "@/lib/ai/types";
import { dailyChallenge } from "@/lib/challenge";
import { romanizeMandarin } from "@/lib/mandarin/pinyin";

export async function POST(request: Request) {
  const formData = await request.formData();
  const audio = formData.get("audio");

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
    const transcriber = getSpeechTranscriber();
    const transcription = await transcriber.transcribe(audioInput);

    if (!isMandarinTranscript(transcription.transcript)) {
      return Response.json(
        buildEvaluationReport(transcription.transcript, {
          isCorrect: false,
          overallScore: 0,
          meaningScore: 0,
          grammarScore: 0,
          naturalnessScore: 0,
          feedback:
            "Answer in Mandarin Chinese; English or another language cannot be accepted for this exercise.",
        }),
      );
    }

    const evaluator = getMandarinEvaluator();
    const correctness = await evaluator.evaluate({
      userTranscript: transcription.transcript,
      exampleMandarinAnswer: dailyChallenge.exampleMandarinAnswer,
      englishPrompt: dailyChallenge.englishPrompt,
      targetConcepts: dailyChallenge.targetConcepts,
    });

    return Response.json(
      buildEvaluationReport(transcription.transcript, correctness),
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
  correctness: CorrectnessEvaluation,
) {
  return {
    ...correctness,
    transcript,
    transcriptPinyin: romanizeMandarin(transcript),
    exampleMandarinAnswer: dailyChallenge.exampleMandarinAnswer,
    exampleMandarinPinyin: romanizeMandarin(dailyChallenge.exampleMandarinAnswer),
  };
}
