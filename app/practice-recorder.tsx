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
      const submissionAudio = await convertBlobToWav(audioBlob);
      const filename = buildRecordingFilename(submissionAudio);
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
            {isBusy ? "Evaluating..." : "Submit WAV"}
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

function buildRecordingFilename(blob: Blob) {
  return blob.type === "audio/wav"
    ? "mandarin-practice.wav"
    : "mandarin-practice.webm";
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

function MandarinLine({
  text,
  pinyin,
  className = "",
}: {
  text?: string;
  pinyin?: string;
  className?: string;
}) {
  if (!text) {
    return null;
  }

  return (
    <div className={className}>
      <p className="text-lg font-medium text-[#1f1b16]">{text}</p>
      {pinyin && <p className="text-xs text-[#756b5d]">{pinyin}</p>}
    </div>
  );
}

function statusLabel(status: string) {
  return status
    .split("-")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function TeachingItem({
  title,
  pinyin,
  status,
  description,
  learnerAttempt,
  learnerAttemptPinyin,
  correction,
  correctionPinyin,
  examples,
  examplePinyin,
}: {
  title: string;
  pinyin?: string;
  status: string;
  description: string;
  learnerAttempt?: string;
  learnerAttemptPinyin?: string;
  correction?: string;
  correctionPinyin?: string;
  examples: string[];
  examplePinyin?: string[];
}) {
  return (
    <div className="space-y-3 border border-[#ded7ca] bg-[#fbf8f1] p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="text-lg font-semibold text-[#1f1b16]">{title}</p>
          {pinyin && <p className="text-xs text-[#756b5d]">{pinyin}</p>}
        </div>
        <span className="rounded-full border border-[#cfc5b6] px-2.5 py-1 text-xs font-medium text-[#5d554b]">
          {statusLabel(status)}
        </span>
      </div>

      <p className="text-sm leading-6 text-[#1f1b16]">{description}</p>

      {(learnerAttempt || correction) && (
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#756b5d]">
              You said
            </p>
            <MandarinLine
              className="mt-1"
              pinyin={learnerAttemptPinyin}
              text={learnerAttempt || "Not included"}
            />
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#756b5d]">
              Use
            </p>
            <MandarinLine
              className="mt-1"
              pinyin={correctionPinyin}
              text={correction || title}
            />
          </div>
        </div>
      )}

      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#756b5d]">
          Examples
        </p>
        <div className="mt-2 space-y-2">
          {examples.map((example, index) => (
            <MandarinLine
              key={`${example}-${index}`}
              pinyin={examplePinyin?.[index]}
              text={example}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

function EvaluationView({
  report,
}: {
  report: EvaluationReport;
}) {
  const scores = [
    ["Meaning", report.meaningScore],
    ["Grammar", report.grammarScore],
    ["Pronunciation", report.pronunciationScore],
  ].filter((score): score is [string, number] => typeof score[1] === "number");
  const hasVocabulary = report.teaching.vocabulary.length > 0;
  const hasGrammar = report.teaching.grammarPatterns.length > 0;
  const pronunciationIssues = report.pronunciationIssues ?? [];

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
          <dt className="font-semibold text-[#756b5d]">Teaching summary</dt>
          <dd className="mt-2 text-[#1f1b16]">{report.teaching.summary}</dd>
        </div>
      </dl>

      {hasVocabulary && (
        <section className="space-y-3">
          <h3 className="text-sm font-semibold uppercase tracking-[0.18em] text-[#756b5d]">
            Vocabulary
          </h3>
          {report.teaching.vocabulary.map((item, index) => (
            <TeachingItem
              correction={item.correction}
              correctionPinyin={item.correctionPinyin}
              description={`${item.meaning}. ${item.explanation}`}
              examplePinyin={item.examplePinyin}
              examples={item.examples}
              key={`${item.term}-${index}`}
              learnerAttempt={item.learnerAttempt}
              learnerAttemptPinyin={item.learnerAttemptPinyin}
              pinyin={item.pinyin}
              status={item.status}
              title={item.term}
            />
          ))}
        </section>
      )}

      {hasGrammar && (
        <section className="space-y-3">
          <h3 className="text-sm font-semibold uppercase tracking-[0.18em] text-[#756b5d]">
            Grammar Pattern
          </h3>
          {report.teaching.grammarPatterns.map((item, index) => (
            <TeachingItem
              correction={item.correction}
              correctionPinyin={item.correctionPinyin}
              description={item.explanation}
              examplePinyin={item.examplePinyin}
              examples={item.examples}
              key={`${item.pattern}-${index}`}
              learnerAttempt={item.learnerAttempt}
              learnerAttemptPinyin={item.learnerAttemptPinyin}
              status={item.status}
              title={item.pattern}
            />
          ))}
        </section>
      )}

      <section className="border-l-4 border-[#bfb4a4] bg-[#fbf8f1] px-4 py-3">
        <h3 className="text-sm font-semibold text-[#756b5d]">Next focus</h3>
        <p className="mt-1 text-sm leading-6 text-[#1f1b16]">
          {report.teaching.nextFocus}
        </p>
      </section>

      {report.pronunciationProvider && (
        <section className="space-y-2 text-sm leading-7">
          <h3 className="font-semibold text-[#756b5d]">Pronunciation</h3>
          {pronunciationIssues.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#756b5d]">
                Sounds to practice
              </p>
              <div className="space-y-2">
                {pronunciationIssues.map((issue) => (
                  <div
                    className="border border-[#ded7ca] bg-[#fbf8f1] p-3"
                    key={`${issue.text}-${issue.score}`}
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <p className="text-xl font-semibold text-[#1f1b16]">
                          {issue.text}
                        </p>
                        {issue.pinyin && (
                          <p className="text-xs text-[#756b5d]">
                            {issue.pinyin}
                          </p>
                        )}
                      </div>
                      <span className="rounded-full border border-[#cfc5b6] px-2.5 py-1 text-xs font-medium text-[#5d554b]">
                        {issue.score}/100
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
          {report.pronunciationProvider && (
            <p className="text-xs text-[#756b5d]">
              {report.pronunciationProvider}
            </p>
          )}
        </section>
      )}
    </div>
  );
}
