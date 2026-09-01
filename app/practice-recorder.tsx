"use client";

import { useEffect, useRef, useState } from "react";
import type {
  EvaluationMode,
  EvaluationReport,
  EvaluationTiming,
  PublicDailyChallenge,
} from "@/lib/ai/types";
import { BrowserSpeechSynthesisProvider } from "@/lib/speech/browser-speech-synthesis";

const PASSING_SCORE = 75;
const CHALLENGE_COUNT = 3;
const MAX_RECORDING_SECONDS = 30;
const CLIENT_WAV_SAMPLE_RATE = 16000;

type RecorderStatus =
  | "idle"
  | "recording"
  | "recorded"
  | "submitting"
  | "complete";

type PracticeRecorderProps = {
  dailyChallenge: PublicDailyChallenge;
};

type DayEndReason = "completed";

export function PracticeRecorder({ dailyChallenge }: PracticeRecorderProps) {
  const [currentDay, setCurrentDay] = useState(dailyChallenge);
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const [stepReports, setStepReports] = useState<(EvaluationReport | null)[]>(
    [],
  );
  const [dayEndReason, setDayEndReason] = useState<DayEndReason | null>(null);
  const [status, setStatus] = useState<RecorderStatus>("idle");
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [evaluationMode, setEvaluationMode] =
    useState<EvaluationMode>("standard");
  const [isLoadingChallenge, setIsLoadingChallenge] = useState(false);
  const [recordingElapsedSeconds, setRecordingElapsedSeconds] = useState(0);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);
  const audioUrlRef = useRef<string | null>(null);
  const recordingStartedAtRef = useRef<number | null>(null);
  const recordingIntervalRef = useRef<ReturnType<typeof setInterval> | null>(
    null,
  );
  const recordingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );
  const speechProviderRef = useRef(new BrowserSpeechSynthesisProvider());
  const speechRequestIdRef = useRef(0);
  const [speakingKey, setSpeakingKey] = useState<string | null>(null);

  const currentChallenge = currentDay.challenges[currentStepIndex];
  const report = stepReports[currentStepIndex] ?? null;
  const scorePassed = Boolean(report && report.overallScore >= PASSING_SCORE);
  const isLastChallenge = currentStepIndex === CHALLENGE_COUNT - 1;
  const attemptedReports = stepReports.filter(
    (stepReport): stepReport is EvaluationReport => Boolean(stepReport),
  );
  const passingCount = stepReports.filter(
    (stepReport) =>
      Boolean(stepReport && stepReport.overallScore >= PASSING_SCORE),
  ).length;

  useEffect(() => {
    const speechProvider = speechProviderRef.current;

    return () => {
      speechRequestIdRef.current += 1;
      speechProvider.cancel();
      if (audioUrlRef.current) {
        URL.revokeObjectURL(audioUrlRef.current);
      }
      clearRecordingTimer();
      streamRef.current?.getTracks().forEach((track) => track.stop());
    };
  }, []);

  async function startRecording() {
    setError(null);
    clearCurrentReport();
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
        clearRecordingTimer();
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
      startRecordingTimer();
    } catch {
      setError(
        "Microphone access was blocked. Allow microphone permission and try again.",
      );
      setStatus("idle");
      clearRecordingTimer();
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

    clearRecordingTimer();
    setRecordingElapsedSeconds(0);
    audioUrlRef.current = null;
    setAudioBlob(null);
    setAudioUrl(null);
    chunksRef.current = [];
  }

  function startRecordingTimer() {
    clearRecordingTimer();
    recordingStartedAtRef.current = Date.now();
    setRecordingElapsedSeconds(0);

    recordingIntervalRef.current = setInterval(() => {
      const startedAt = recordingStartedAtRef.current;

      if (!startedAt) {
        return;
      }

      setRecordingElapsedSeconds(
        Math.min(
          MAX_RECORDING_SECONDS,
          Math.floor((Date.now() - startedAt) / 1000),
        ),
      );
    }, 250);

    recordingTimeoutRef.current = setTimeout(() => {
      setRecordingElapsedSeconds(MAX_RECORDING_SECONDS);

      const recorder = mediaRecorderRef.current;

      if (recorder?.state === "recording") {
        recorder.stop();
      }
    }, MAX_RECORDING_SECONDS * 1000);
  }

  function clearRecordingTimer() {
    if (recordingIntervalRef.current) {
      clearInterval(recordingIntervalRef.current);
    }

    if (recordingTimeoutRef.current) {
      clearTimeout(recordingTimeoutRef.current);
    }

    recordingStartedAtRef.current = null;
    recordingIntervalRef.current = null;
    recordingTimeoutRef.current = null;
  }

  function stopStream() {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    mediaRecorderRef.current = null;
  }

  async function playSpeech(key: string, text: string) {
    const provider = speechProviderRef.current;

    if (speakingKey === key) {
      speechRequestIdRef.current += 1;
      provider.cancel();
      setSpeakingKey(null);
      return;
    }

    if (!provider.isSupported()) {
      setError("This browser does not support text-to-speech playback.");
      return;
    }

    const requestId = speechRequestIdRef.current + 1;
    speechRequestIdRef.current = requestId;
    setSpeakingKey(key);
    setError(null);

    try {
      await provider.speak({ text });
      if (speechRequestIdRef.current === requestId) {
        setSpeakingKey(null);
      }
    } catch (caughtError) {
      if (speechRequestIdRef.current !== requestId) {
        return;
      }

      setSpeakingKey(null);
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : "Speech playback failed.",
      );
    }
  }

  function clearCurrentReport() {
    setStepReports((previousReports) => {
      if (!previousReports[currentStepIndex]) {
        return previousReports;
      }

      const nextReports = [...previousReports];
      nextReports[currentStepIndex] = null;
      return nextReports;
    });
  }

  function resetPractice() {
    speechRequestIdRef.current += 1;
    speechProviderRef.current.cancel();
    setSpeakingKey(null);
    if (mediaRecorderRef.current?.state === "recording") {
      mediaRecorderRef.current.stop();
    }
    stopStream();
    clearRecording();
    clearCurrentReport();
    setError(null);
    setStatus("idle");
  }

  function discardPracticeState() {
    speechRequestIdRef.current += 1;
    speechProviderRef.current.cancel();
    setSpeakingKey(null);
    const recorder = mediaRecorderRef.current;

    if (recorder?.state === "recording") {
      recorder.onstop = null;
      recorder.stop();
    }

    clearRecordingTimer();
    stopStream();
    clearRecording();
    setError(null);
    setStatus("idle");
  }

  async function loadNewDay() {
    setIsLoadingChallenge(true);
    discardPracticeState();

    try {
      const response = await fetch("/api/challenges/day", {
        cache: "no-store",
      });
      const payload = await response.json();

      if (!response.ok) {
        throw new Error(payload?.error || "Could not load a daily challenge.");
      }

      setCurrentDay(payload as PublicDailyChallenge);
      setCurrentStepIndex(0);
      setStepReports([]);
      setDayEndReason(null);
    } catch (caughtError) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : "Could not load a daily challenge.",
      );
    } finally {
      setIsLoadingChallenge(false);
    }
  }

  async function submitRecording() {
    if (!audioBlob || status !== "recorded") {
      return;
    }

    const submitStartedAt = performance.now();
    const clientTimings: EvaluationTiming[] = [];

    setStatus("submitting");
    setError(null);
    clearCurrentReport();

    try {
      const submissionAudio = await measureClientAsync(
        clientTimings,
        "client:convertToWav",
        () => convertBlobToWav(audioBlob),
      );
      const filename = buildRecordingFilename(submissionAudio);
      const formData = new FormData();

      formData.append("audio", submissionAudio, filename);
      formData.append("challengeId", currentChallenge.id);
      formData.append("evaluationMode", evaluationMode);

      const response = await measureClientAsync(
        clientTimings,
        "client:networkAndServer",
        () =>
          fetch("/api/evaluate", {
            method: "POST",
            body: formData,
          }),
      );
      const payload = (await measureClientAsync(
        clientTimings,
        "client:readJson",
        () => response.json(),
      )) as EvaluationReport & { error?: string };

      recordClientTiming(clientTimings, "client:total", submitStartedAt);

      const debugTimings = {
        ...payload.debugTimings,
        client: clientTimings,
        audioBytes: {
          original: audioBlob.size,
          submitted: submissionAudio.size,
        },
      };
      logAudioAnalysisTimings(debugTimings);

      if (!response.ok) {
        throw new Error(payload?.error || "Could not evaluate this recording.");
      }

      setStepReports((previousReports) => {
        const nextReports = [...previousReports];
        nextReports[currentStepIndex] = {
          ...payload,
          debugTimings,
        };
        return nextReports;
      });
      setStatus("complete");
    } catch (caughtError) {
      recordClientTiming(
        clientTimings,
        "client:totalBeforeError",
        submitStartedAt,
      );
      logAudioAnalysisTimings({ client: clientTimings });
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : "Could not evaluate this recording.",
      );
      setStatus("recorded");
    }
  }

  function moveToNextChallenge() {
    if (!report) {
      return;
    }

    discardPracticeState();

    if (isLastChallenge) {
      setDayEndReason("completed");
      return;
    }

    setCurrentStepIndex((stepIndex) => stepIndex + 1);
  }

  const canSubmit = Boolean(audioBlob) && status === "recorded";
  const isBusy = status === "submitting";
  const controlsDisabled = isBusy || isLoadingChallenge;

  if (dayEndReason) {
    return (
      <DayCompleteView
        attemptedReports={attemptedReports}
        passingCount={passingCount}
        error={error}
        isLoadingChallenge={isLoadingChallenge}
        onGenerateDay={loadNewDay}
      />
    );
  }

  return (
    <div className="grid flex-1 content-center gap-8 py-10 lg:grid-cols-[1fr_0.9fr] lg:py-16">
      <section className="space-y-8">
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-3 text-sm font-medium text-[#756b5d]">
            <span>Challenge {currentStepIndex + 1} of {CHALLENGE_COUNT}</span>
            <span className="rounded-full border border-[#cfc5b6] bg-[#fbf8f1] px-3 py-1 text-xs capitalize text-[#4e473e]">
              {currentChallenge.difficulty}
            </span>
          </div>
          <p className="text-sm font-medium text-[#756b5d]">Translate aloud</p>
          <h2 className="max-w-2xl text-4xl font-semibold leading-tight sm:text-5xl">
            {currentChallenge.englishPrompt}
          </h2>
        </div>

        <div className="border-y border-[#ded7ca] py-5">
          <div className="flex flex-wrap items-center gap-2">
            <p className="mr-1 text-sm font-medium text-[#756b5d]">Subject</p>
            <span className="rounded-full border border-[#cfc5b6] bg-[#fbf8f1] px-3 py-1 text-xs capitalize text-[#4e473e]">
              {currentChallenge.category}
            </span>

          </div>
        </div>

        <ChallengeProgress
          currentStepIndex={currentStepIndex}
          reports={stepReports}
        />

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
                clearCurrentReport();
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
            disabled={controlsDisabled || status === "recording"}
            onClick={loadNewDay}
            type="button"
          >
            {isLoadingChallenge ? "Loading..." : "Generate new day"}
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

          {report && (
            <button
              className="h-12 rounded-md bg-[#2c2924] px-5 text-sm font-semibold text-white transition hover:bg-[#403a33] disabled:cursor-not-allowed disabled:bg-[#aaa197]"
              disabled={controlsDisabled}
              onClick={moveToNextChallenge}
              type="button"
            >
              {isLastChallenge ? "Finish day" : "Next challenge"}
            </button>
          )}

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

        {report && !scorePassed && (
          <p className="max-w-xl text-sm leading-6 text-[#9f4f3a]">
            This score will be included in your end-of-day results. Review the feedback, then continue when you are ready.
          </p>
        )}

        {status === "recording" && (
          <p className="text-sm font-medium text-[#9f4f3a]">
            Recording {formatRecordingTime(recordingElapsedSeconds)} /{" "}
            {formatRecordingTime(MAX_RECORDING_SECONDS)}
          </p>
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
          <EvaluationView
            onPlaySpeech={playSpeech}
            report={report}
            speakingKey={speakingKey}
          />
        ) : (
          <div className="space-y-5 text-[#5d554b]">
            <p className="text-sm font-medium uppercase tracking-[0.18em]">
              Feedback
            </p>
            <p className="text-lg leading-8">
              Complete beginner, intermediate, and advanced prompts in order. Your end-of-day results will show which scores met the {PASSING_SCORE} target.
            </p>
          </div>
        )}
      </aside>
    </div>
  );
}

function ChallengeProgress({
  currentStepIndex,
  reports,
}: {
  currentStepIndex: number;
  reports: (EvaluationReport | null)[];
}) {
  return (
    <div className="grid grid-cols-3 gap-2">
      {(["Beginner", "Intermediate", "Advanced"] as const).map(
        (label, index) => {
          const report = reports[index];
          const passed = Boolean(report && report.overallScore >= PASSING_SCORE);
          const isCurrent = index === currentStepIndex;

          return (
            <div
              className={`border p-3 ${
                isCurrent
                  ? "border-[#2c2924] bg-[#fbf8f1]"
                  : "border-[#ded7ca] bg-transparent"
              }`}
              key={label}
            >
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#756b5d]">
                {label}
              </p>
              <p className="mt-2 text-lg font-semibold text-[#1f1b16]">
                {report ? `${report.overallScore}/100` : isCurrent ? "Current" : "Up next"}
              </p>
              {report && (
                <p className="mt-1 text-xs font-medium text-[#756b5d]">
                  {passed ? "Passed" : "Needs work"}
                </p>
              )}
            </div>
          );
        },
      )}
    </div>
  );
}

function DayCompleteView({
  attemptedReports,
  passingCount,
  error,
  isLoadingChallenge,
  onGenerateDay,
}: {
  attemptedReports: EvaluationReport[];
  passingCount: number;
  error: string | null;
  isLoadingChallenge: boolean;
  onGenerateDay: () => void;
}) {
  const averageScore = attemptedReports.length
    ? Math.round(
        attemptedReports.reduce((total, report) => total + report.overallScore, 0) /
          attemptedReports.length,
      )
    : 0;

  return (
    <div className="grid flex-1 content-center gap-8 py-10 lg:grid-cols-[1fr_0.9fr] lg:py-16">
      <section className="space-y-7">
        <div className="space-y-4">
          <p className="text-sm font-medium uppercase tracking-[0.18em] text-[#756b5d]">
            Daily Challenge Complete
          </p>
          <h2 className="max-w-2xl text-4xl font-semibold leading-tight sm:text-5xl">
            You completed today's challenge.
          </h2>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="border border-[#ded7ca] bg-[#fbf8f1] p-5">
            <p className="text-sm text-[#756b5d]">Overall score</p>
            <p className="mt-2 text-3xl font-semibold">{averageScore}/100</p>
          </div>
          <div className="border border-[#ded7ca] bg-[#fbf8f1] p-5">
            <p className="text-sm text-[#756b5d]">Met target</p>
            <p className="mt-2 text-3xl font-semibold">
              {passingCount}/{CHALLENGE_COUNT}
            </p>
          </div>
        </div>

        <button
          className="h-12 w-fit rounded-md bg-[#2c2924] px-5 text-sm font-semibold text-white transition hover:bg-[#403a33] disabled:cursor-not-allowed disabled:bg-[#aaa197]"
          disabled={isLoadingChallenge}
          onClick={onGenerateDay}
          type="button"
        >
          {isLoadingChallenge ? "Loading..." : "Generate new day"}
        </button>

        {error && (
          <div className="max-w-xl border-l-4 border-[#9f4f3a] bg-[#fff9f4] px-4 py-3 text-sm text-[#663526]">
            {error}
          </div>
        )}
      </section>

      <aside className="border-t border-[#ded7ca] pt-6 lg:border-l lg:border-t-0 lg:pl-8 lg:pt-0">
        <div className="space-y-4">
          <p className="text-sm font-medium uppercase tracking-[0.18em] text-[#756b5d]">
            Scores
          </p>
          {attemptedReports.map((report, index) => (
            <div
              className="border border-[#ded7ca] bg-[#fbf8f1] p-4"
              key={`${report.transcript}-${index}`}
            >
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm font-semibold text-[#756b5d]">
                  Challenge {index + 1}
                </p>
                <p className="text-lg font-semibold text-[#1f1b16]">
                  {report.overallScore}/100
                </p>
              </div>
              <p className="mt-2 text-sm text-[#5d554b]">
                {report.overallScore >= PASSING_SCORE ? "Passed" : "Needs work"}
              </p>
            </div>
          ))}
        </div>
      </aside>
    </div>
  );
}

function formatRecordingTime(totalSeconds: number) {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;

  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

function measureClientAsync<T>(
  timings: EvaluationTiming[],
  label: string,
  task: () => Promise<T>,
): Promise<T> {
  const startedAt = performance.now();

  return task().finally(() => {
    recordClientTiming(timings, label, startedAt);
  });
}

function recordClientTiming(
  timings: EvaluationTiming[],
  label: string,
  startedAt: number,
) {
  timings.push({
    label,
    durationMs: Math.round((performance.now() - startedAt) * 10) / 10,
  });
}

function logAudioAnalysisTimings(
  debugTimings: EvaluationReport["debugTimings"],
) {
  if (!debugTimings) {
    return;
  }

  console.info("Audio analysis debug", debugTimings);
  console.table([
    ...(debugTimings.client ?? []),
    ...(debugTimings.server ?? []),
  ]);
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

    return new Blob([encodeWav(audioBuffer, MAX_RECORDING_SECONDS)], {
      type: "audio/wav",
    });
  } finally {
    await audioContext.close();
  }
}

function encodeWav(audioBuffer: AudioBuffer, maxDurationSeconds?: number) {
  const sourceSampleCount = maxDurationSeconds
    ? Math.min(
        audioBuffer.length,
        Math.floor(audioBuffer.sampleRate * maxDurationSeconds),
      )
    : audioBuffer.length;
  const monoSamples = mixAudioBufferToMono(audioBuffer, sourceSampleCount);
  const outputSamples =
    audioBuffer.sampleRate === CLIENT_WAV_SAMPLE_RATE
      ? monoSamples
      : resampleAudioSamples(
          monoSamples,
          audioBuffer.sampleRate,
          CLIENT_WAV_SAMPLE_RATE,
        );

  return encodePcm16MonoWav(outputSamples, CLIENT_WAV_SAMPLE_RATE);
}

function mixAudioBufferToMono(
  audioBuffer: AudioBuffer,
  sampleCount: number,
): Float32Array {
  const monoSamples = new Float32Array(sampleCount);

  for (let sampleIndex = 0; sampleIndex < sampleCount; sampleIndex += 1) {
    let total = 0;

    for (
      let channelIndex = 0;
      channelIndex < audioBuffer.numberOfChannels;
      channelIndex += 1
    ) {
      total += audioBuffer.getChannelData(channelIndex)[sampleIndex] ?? 0;
    }

    monoSamples[sampleIndex] = total / audioBuffer.numberOfChannels;
  }

  return monoSamples;
}

function resampleAudioSamples(
  samples: Float32Array,
  sourceSampleRate: number,
  targetSampleRate: number,
): Float32Array {
  const targetLength = Math.max(
    1,
    Math.round((samples.length * targetSampleRate) / sourceSampleRate),
  );
  const output = new Float32Array(targetLength);
  const ratio = sourceSampleRate / targetSampleRate;

  for (let index = 0; index < targetLength; index += 1) {
    const sourceIndex = index * ratio;
    const lowerIndex = Math.floor(sourceIndex);
    const upperIndex = Math.min(lowerIndex + 1, samples.length - 1);
    const weight = sourceIndex - lowerIndex;
    const lower = samples[lowerIndex] ?? 0;
    const upper = samples[upperIndex] ?? lower;

    output[index] = lower + (upper - lower) * weight;
  }

  return output;
}

function encodePcm16MonoWav(samples: Float32Array, sampleRate: number) {
  const channelCount = 1;
  const bytesPerSample = 2;
  const blockAlign = channelCount * bytesPerSample;
  const dataLength = samples.length * blockAlign;
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

  for (const sample of samples) {
    const clamped = Math.max(-1, Math.min(1, sample));
    const pcm = clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff;

    view.setInt16(offset, pcm, true);
    offset += bytesPerSample;
  }

  return buffer;
}

function SpeechPlayButton({
  isActive,
  label,
  onClick,
}: {
  isActive: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      aria-label={isActive ? "Stop playback" : label}
      className={`inline-flex h-7 shrink-0 items-center justify-center rounded-md border px-2 text-xs font-semibold transition ${
        isActive
          ? "border-[#9f4f3a] bg-[#9f4f3a] text-white"
          : "border-[#bfb4a4] bg-white text-[#2c2924] hover:bg-[#eee7dc]"
      }`}
      onClick={onClick}
      title={isActive ? "Stop playback" : label}
      type="button"
    >
      {isActive ? "Stop" : "Play"}
    </button>
  );
}
function EvaluationView({
  onPlaySpeech,
  report,
  speakingKey,
}: {
  onPlaySpeech: (key: string, text: string) => void;
  report: EvaluationReport;
  speakingKey: string | null;
}) {
  const scores = [
    ["Meaning", report.meaningScore],
    ["Grammar", report.grammarScore],
    ["Pronunciation", report.pronunciationScore],
  ].filter((score): score is [string, number] => typeof score[1] === "number");
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
          <dd className="mt-1 flex flex-wrap items-center gap-2 text-xl text-[#1f1b16]">
            <span>{report.exampleMandarinAnswer}</span>
            <SpeechPlayButton
              isActive={speakingKey === "report:example-answer"}
              label="Play example answer"
              onClick={() =>
                onPlaySpeech(
                  "report:example-answer",
                  report.exampleMandarinAnswer,
                )
              }
            />
          </dd>
          <dd className="mt-1 text-sm text-[#756b5d]">
            {report.exampleMandarinPinyin}
          </dd>
        </div>
      </dl>
      <section className="space-y-3">
        <h3 className="text-sm font-semibold uppercase tracking-[0.18em] text-[#756b5d]">
          Example breakdown
        </h3>
        <div className="space-y-2">
          {report.exampleBreakdown.map((part, index) => (
            <div
              className="border border-[#ded7ca] bg-[#fbf8f1] p-3"
              key={`${part.text}-${index}`}
            >
              <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                <p className="text-xl font-semibold text-[#1f1b16]">
                  {part.text}
                </p>
                {part.pinyin && (
                  <p className="text-sm text-[#756b5d]">{part.pinyin}</p>
                )}
              </div>
              <p className="mt-1 text-sm leading-6 text-[#1f1b16]">
                {part.definition}
              </p>
            </div>
          ))}
        </div>
      </section>

      {report.pronunciationProvider && (
        <section className="space-y-2 text-sm leading-7">
          <h3 className="font-semibold text-[#756b5d]">Pronunciation</h3>
          {report.pronunciationFeedback && (
            <p className="border-l-4 border-[#bfb4a4] bg-[#fbf8f1] px-4 py-3 text-sm leading-6 text-[#1f1b16]">
              {report.pronunciationFeedback}
            </p>
          )}
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
