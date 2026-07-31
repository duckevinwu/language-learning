import { AIProviderError } from "@/lib/ai/errors";
import { getMandarinEvaluator, getSpeechTranscriber } from "@/lib/ai/providers";
import type { AudioInput } from "@/lib/ai/types";
import { dailyChallenge } from "@/lib/challenge";

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
    const evaluator = getMandarinEvaluator();
    const transcription = await transcriber.transcribe(audioInput);
    const report = await evaluator.evaluate({
      challenge: dailyChallenge,
      transcription,
    });

    return Response.json(report);
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
