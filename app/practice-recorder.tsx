"use client";

import { useEffect, useRef, useState } from "react";
import type { EvaluationReport, PublicChallenge } from "@/lib/ai/types";

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
    if (!audioBlob || status === "recording") {
      return;
    }

    setStatus("submitting");
    setError(null);
    setReport(null);

    const formData = new FormData();
    formData.append("audio", audioBlob, "mandarin-practice.webm");
    formData.append("challengeId", currentChallenge.id);

    try {
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

  const canSubmit = Boolean(audioBlob) && status !== "recording";
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
            {isBusy ? "Evaluating..." : "Submit"}
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
              Record one short answer. The evaluator will judge whether your
              Mandarin is semantically and grammatically correct.
            </p>
          </div>
        )}
      </aside>
    </div>
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
        {scores.map(([label, value]) => (
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
          <dt className="font-semibold text-[#756b5d]">Correctness</dt>
          <dd className="mt-1 text-[#1f1b16]">{report.feedback}</dd>
        </div>
      </dl>
    </div>
  );
}
