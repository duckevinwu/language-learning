"use client";

import { useEffect, useRef, useState } from "react";
import type {
  EvaluationMode,
  EvaluationReport,
  PublicChallenge,
} from "@/lib/ai/types";

type RecorderStatus =
  | "idle"
  | "recording"
  | "recorded"
  | "submitting"
  | "complete";

type PracticeRecorderProps = {
  challenge: PublicChallenge;
};

export function PracticeRecorder({ challenge }: PracticeRecorderProps) {
  const [currentChallenge, setCurrentChallenge] = useState(challenge);
  const [status, setStatus] = useState<RecorderStatus>("idle");
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [report, setReport] = useState<EvaluationReport | null>(null);
  const [evaluationMode, setEvaluationMode] =
    useState<EvaluationMode>("standard");
  const [isLoadingChallenge, setIsLoadingChallenge] = useState(false);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);
  const audioUrlRef = useRef<string | null>(null);

  useEffect(() => {
    return () => {
      if (audioUrlRef.current) {
        URL.revokeObjectURL(audioUrlRef.current);
      }
      streamRef.current?.getTracks().forEach((track) => track.stop());
    };
  }, []);

  async function startRecording() {
    setError(null);
    setReport(null);
    clearRecording();

    if (!navigator.mediaDevices?.getUserMedia) {
      setError("This browser does not support microphone recording.");
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);

      streamRef.current = stream;
      mediaRecorderRef.current = recorder;
      chunksRef.current = [];

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          chunksRef.current.push(event.data);
        }
      };

      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, {
          type: recorder.mimeType || "audio/webm",
        });
        const nextAudioUrl = URL.createObjectURL(blob);

        setAudioBlob(blob);
        audioUrlRef.current = nextAudioUrl;
        setAudioUrl(nextAudioUrl);
        setStatus("recorded");
        stopStream();
      };

      recorder.start();
      setStatus("recording");
    } catch {
      setError(
        "Microphone access was blocked. Allow microphone permission and try again.",
      );
      setStatus("idle");
      stopStream();
    }
  }

  function stopRecording() {
    const recorder = mediaRecorderRef.current;

    if (recorder?.state === "recording") {
      recorder.stop();
    }
  }

  function clearRecording() {
    if (audioUrlRef.current) {
      URL.revokeObjectURL(audioUrlRef.current);
    }

    audioUrlRef.current = null;
    setAudioBlob(null);
    setAudioUrl(null);
    chunksRef.current = [];
  }

  function stopStream() {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    mediaRecorderRef.current = null;
  }

  function resetPractice() {
    if (mediaRecorderRef.current?.state === "recording") {
      mediaRecorderRef.current.stop();
    }
    stopStream();
    clearRecording();
    setReport(null);
    setError(null);
    setStatus("idle");
  }

  function discardPracticeState() {
    const recorder = mediaRecorderRef.current;

    if (recorder?.state === "recording") {
      recorder.onstop = null;
      recorder.stop();
    }

    stopStream();
    clearRecording();
    setReport(null);
    setError(null);
    setStatus("idle");
  }

  async function loadRandomChallenge() {
    setIsLoadingChallenge(true);
    discardPracticeState();

    try {
      const response = await fetch("/api/challenges/random", {
        cache: "no-store",
      });
      const payload = await response.json();

      if (!response.ok) {
        throw new Error(payload?.error || "Could not load a random prompt.");
      }

      setCurrentChallenge(payload as PublicChallenge);
    } catch (caughtError) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : "Could not load a random prompt.",
      );
    } finally {
      setIsLoadingChallenge(false);
    }
  }

  async function submitRecording() {
    if (!audioBlob || status !== "recorded") {
      return;
    }

    setStatus("submitting");
    setError(null);
    setReport(null);

    try {
      const submissionAudio =
        evaluationMode === "gpt-audio"
          ? await convertBlobToWav(audioBlob)
          : audioBlob;
      const filename = buildRecordingFilename(evaluationMode, audioBlob);
      const formData = new FormData();

      formData.append("audio", submissionAudio, filename);
      formData.append("challengeId", currentChallenge.id);
      formData.append("evaluationMode", evaluationMode);

      const response = await fetch("/api/evaluate", {
        method: "POST",
        body: formData,
      });
      const payload = await response.json();

      if (!response.ok) {
        throw new Error(payload?.error || "Could not evaluate this recording.");
      }

      setReport(payload as EvaluationReport);
      setStatus("complete");
    } catch (caughtError) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : "Could not evaluate this recording.",
      );
      setStatus("recorded");
    }
  }

  const canSubmit = Boolean(audioBlob) && status === "recorded";
  const isBusy = status === "submitting";
  const controlsDisabled = isBusy || isLoadingChallenge;

  return (
    <div className="grid flex-1 content-center gap-8 py-10 lg:grid-cols-[1fr_0.9fr] lg:py-16">
      <section className="space-y-8">
        <div className="space-y-4">
          <p className="text-sm font-medium text-[#756b5d]">Translate aloud</p>
          <h2 className="max-w-2xl text-4xl font-semibold leading-tight sm:text-5xl">
            {currentChallenge.englishPrompt}
          </h2>
        </div>

        <div className="space-y-3 border-y border-[#ded7ca] py-5">
          <div className="flex flex-wrap items-center gap-2">
            <p className="mr-1 text-sm font-medium text-[#756b5d]">
              Target concepts
            </p>
            <span className="rounded-full border border-[#cfc5b6] bg-[#fbf8f1] px-3 py-1 text-xs capitalize text-[#4e473e]">
              {currentChallenge.category}
            </span>
            <span className="rounded-full border border-[#cfc5b6] bg-[#fbf8f1] px-3 py-1 text-xs capitalize text-[#4e473e]">
              {currentChallenge.difficulty}
            </span>
          </div>
          <div className="flex flex-wrap gap-2">
            {currentChallenge.targetConcepts.map((concept) => (
              <span
                key={concept}
                className="rounded-full border border-[#cfc5b6] bg-[#fbf8f1] px-3 py-1 text-sm text-[#4e473e]"
              >
                {concept}
              </span>
            ))}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {(["standard", "gpt-audio"] as const).map((mode) => (
            <button
              aria-pressed={evaluationMode === mode}
              className={`h-10 rounded-md border px-4 text-sm font-semibold transition disabled:cursor-not-allowed ${
                evaluationMode === mode
                  ? "border-[#2c2924] bg-[#2c2924] text-white"
                  : "border-[#bfb4a4] text-[#2c2924] hover:bg-[#eee7dc]"
              }`}
              disabled={controlsDisabled || status === "recording"}
              key={mode}
              onClick={() => {
                setEvaluationMode(mode);
                setReport(null);
                setError(null);
              }}
              type="button"
            >
              {mode === "standard" ? "Standard" : "GPT audio"}
            </button>
          ))}
        </div>

        <div className="flex flex-wrap gap-3">
          <button
            className="h-12 rounded-md border border-[#bfb4a4] px-5 text-sm font-semibold text-[#2c2924] transition hover:bg-[#eee7dc] disabled:cursor-not-allowed disabled:text-[#9c9286]"
            disabled={controlsDisabled}
            onClick={loadRandomChallenge}
            type="button"
          >
            {isLoadingChallenge ? "Loading..." : "Random prompt"}
          </button>

          {status !== "recording" ? (
            <button
              className="h-12 rounded-md bg-[#2c2924] px-5 text-sm font-semibold text-white transition hover:bg-[#403a33] disabled:cursor-not-allowed disabled:bg-[#aaa197]"
              disabled={controlsDisabled}
              onClick={startRecording}
              type="button"
            >
              {audioBlob ? "Record again" : "Record"}
            </button>
          ) : (
            <button
              className="h-12 rounded-md bg-[#9f4f3a] px-5 text-sm font-semibold text-white transition hover:bg-[#8c4634]"
              onClick={stopRecording}
              type="button"
            >
              Stop
            </button>
          )}

          <button
            className="h-12 rounded-md border border-[#bfb4a4] px-5 text-sm font-semibold text-[#2c2924] transition hover:bg-[#eee7dc] disabled:cursor-not-allowed disabled:text-[#9c9286]"
            disabled={!canSubmit || controlsDisabled}
            onClick={submitRecording}
            type="button"
          >
            {isBusy
              ? "Evaluating..."
              : evaluationMode === "gpt-audio"
                ? "Submit WAV"
                : "Submit"}
          </button>

          {(audioBlob || report || error) && (
            <button
              className="h-12 rounded-md px-5 text-sm font-semibold text-[#5d554b] transition hover:bg-[#eee7dc]"
              disabled={controlsDisabled}
              onClick={resetPractice}
              type="button"
            >
              Retry
            </button>
          )}
        </div>

        {status === "recording" && (
          <p className="text-sm text-[#9f4f3a]">Recording...</p>
        )}

        {audioUrl && (
          <div className="space-y-2">
            <p className="text-sm font-medium text-[#756b5d]">Playback</p>
            <audio className="w-full max-w-xl" controls src={audioUrl} />
          </div>
        )}

        {error && (
          <div className="max-w-xl border-l-4 border-[#9f4f3a] bg-[#fff9f4] px-4 py-3 text-sm text-[#663526]">
            {error}
          </div>
        )}
      </section>

      <aside className="border-t border-[#ded7ca] pt-6 lg:border-l lg:border-t-0 lg:pl-8 lg:pt-0">
        {report ? (
          <EvaluationView report={report} />
        ) : (
          <div className="space-y-5 text-[#5d554b]">
            <p className="text-sm font-medium uppercase tracking-[0.18em]">
              Feedback
            </p>
            <p className="text-lg leading-8">
              Record one short answer. You will get a short coaching note on grammar, vocabulary, or natural phrasing.
            </p>
          </div>
        )}
      </aside>
    </div>
  );
}

function buildRecordingFilename(mode: EvaluationMode, blob: Blob) {
  if (mode === "gpt-audio") {
    return "mandarin-practice.wav";
  }

  return `mandarin-practice.${getAudioExtension(blob.type)}`;
}

function getAudioExtension(mimeType: string) {
  const [baseType] = mimeType.toLowerCase().split(";");
  const knownExtensions: Record<string, string> = {
    "audio/webm": "webm",
    "audio/ogg": "ogg",
    "audio/mp4": "m4a",
    "audio/mpeg": "mp3",
    "audio/wav": "wav",
    "audio/wave": "wav",
    "audio/x-wav": "wav",
  };

  return knownExtensions[baseType] ?? "webm";
}

type AudioContextWindow = typeof window & {
  webkitAudioContext?: typeof AudioContext;
};

function createAudioContext() {
  const audioWindow = window as AudioContextWindow;
  const AudioContextConstructor =
    audioWindow.AudioContext ?? audioWindow.webkitAudioContext;

  if (!AudioContextConstructor) {
    throw new Error("WAV conversion is not supported in this browser.");
  }

  return new AudioContextConstructor();
}

async function convertBlobToWav(blob: Blob) {
  const audioContext = createAudioContext();

  try {
    const audioBuffer = await audioContext.decodeAudioData(
      await blob.arrayBuffer(),
    );

    return new Blob([encodeWav(audioBuffer)], { type: "audio/wav" });
  } finally {
    await audioContext.close();
  }
}

function encodeWav(audioBuffer: AudioBuffer) {
  const channelCount = audioBuffer.numberOfChannels;
  const sampleRate = audioBuffer.sampleRate;
  const bytesPerSample = 2;
  const blockAlign = channelCount * bytesPerSample;
  const dataLength = audioBuffer.length * blockAlign;
  const buffer = new ArrayBuffer(44 + dataLength);
  const view = new DataView(buffer);
  let offset = 0;

  function writeString(value: string) {
    for (let index = 0; index < value.length; index += 1) {
      view.setUint8(offset + index, value.charCodeAt(index));
    }
    offset += value.length;
  }

  writeString("RIFF");
  view.setUint32(offset, 36 + dataLength, true);
  offset += 4;
  writeString("WAVE");
  writeString("fmt ");
  view.setUint32(offset, 16, true);
  offset += 4;
  view.setUint16(offset, 1, true);
  offset += 2;
  view.setUint16(offset, channelCount, true);
  offset += 2;
  view.setUint32(offset, sampleRate, true);
  offset += 4;
  view.setUint32(offset, sampleRate * blockAlign, true);
  offset += 4;
  view.setUint16(offset, blockAlign, true);
  offset += 2;
  view.setUint16(offset, bytesPerSample * 8, true);
  offset += 2;
  writeString("data");
  view.setUint32(offset, dataLength, true);
  offset += 4;

  for (let sampleIndex = 0; sampleIndex < audioBuffer.length; sampleIndex += 1) {
    for (let channelIndex = 0; channelIndex < channelCount; channelIndex += 1) {
      const sample = Math.max(
        -1,
        Math.min(1, audioBuffer.getChannelData(channelIndex)[sampleIndex]),
      );
      const pcm = sample < 0 ? sample * 0x8000 : sample * 0x7fff;

      view.setInt16(offset, pcm, true);
      offset += bytesPerSample;
    }
  }

  return buffer;
}

function FeedbackText({
  fallback,
  segments,
}: {
  fallback: string;
  segments?: EvaluationReport["feedbackSegments"];
}) {
  if (!segments?.length) {
    return <>{fallback}</>;
  }

  return (
    <span className="leading-9">
      {segments.map((segment, index) => {
        if (segment.type === "text") {
          return segment.text;
        }

        return (
          <ruby
            className="mx-0.5 whitespace-nowrap text-base font-medium"
            key={`${segment.text}-${index}`}
          >
            {segment.text}
            <rt className="text-[0.65em] font-normal text-[#756b5d]">
              {segment.pinyin}
            </rt>
          </ruby>
        );
      })}
    </span>
  );
}

function EvaluationView({
  report,
}: {
  report: EvaluationReport;
}) {
  const scores = [
    ["Overall", report.overallScore],
    ["Meaning", report.meaningScore],
    ["Grammar", report.grammarScore],
    ["Naturalness", report.naturalnessScore],
  ] as const;
  const pronunciationScores = [
    ["Pronunciation", report.pronunciationScore],
    ["Tones", report.toneScore],
  ].filter((score): score is [string, number] => typeof score[1] === "number");

  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm font-medium uppercase tracking-[0.18em] text-[#756b5d]">
          Feedback
        </p>
        <div className="mt-3 flex flex-wrap items-end gap-3">
          <p className="text-3xl font-semibold">{report.overallScore}/100</p>
          <p className="pb-1 text-sm font-medium text-[#756b5d]">
            {report.isCorrect ? "Correct" : "Needs work"}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        {[...scores, ...pronunciationScores].map(([label, value]) => (
          <div
            className="border border-[#ded7ca] bg-[#fbf8f1] p-4"
            key={label}
          >
            <p className="text-sm text-[#756b5d]">{label}</p>
            <p className="mt-2 text-2xl font-semibold">{value}</p>
          </div>
        ))}
      </div>

      <dl className="space-y-5 text-sm leading-7">
        <div>
          <dt className="font-semibold text-[#756b5d]">Transcript</dt>
          <dd className="mt-1 text-xl text-[#1f1b16]">{report.transcript}</dd>
          <dd className="mt-1 text-sm text-[#756b5d]">
            {report.transcriptPinyin}
          </dd>
        </div>
        <div>
          <dt className="font-semibold text-[#756b5d]">Example answer</dt>
          <dd className="mt-1 text-xl text-[#1f1b16]">
            {report.exampleMandarinAnswer}
          </dd>
          <dd className="mt-1 text-sm text-[#756b5d]">
            {report.exampleMandarinPinyin}
          </dd>
        </div>
        <div>
          <dt className="font-semibold text-[#756b5d]">Coaching</dt>
          <dd className="mt-2 text-[#1f1b16]">
            <FeedbackText
              fallback={report.feedback}
              segments={report.feedbackSegments}
            />
          </dd>
        </div>
        {report.evaluationMode === "gpt-audio" && (
          <div>
            <dt className="font-semibold text-[#756b5d]">Pronunciation</dt>
            {report.pronunciationFeedback ? (
              <dd className="mt-2 text-[#1f1b16]">
                {report.pronunciationFeedback}
              </dd>
            ) : (
              <dd className="mt-2 text-[#1f1b16]">
                Clear. No specific pronunciation correction needed.
              </dd>
            )}
            {report.pronunciationProvider && (
              <dd className="mt-1 text-xs text-[#756b5d]">
                {report.pronunciationProvider}
              </dd>
            )}
          </div>
        )}
      </dl>
    </div>
  );
}
