import type { SpeechAudioInput, SpeechAudioProvider } from "./types";

const DEFAULT_LANGUAGE = "zh-CN";
const DEFAULT_RATE = 0.82;
const DEFAULT_PITCH = 1;
const VOICE_LOAD_TIMEOUT_MS = 600;

type SpeechWindow = Window &
  typeof globalThis & {
    speechSynthesis?: SpeechSynthesis;
  };

export class BrowserSpeechSynthesisProvider implements SpeechAudioProvider {
  readonly id = "browser-speech-synthesis";

  private activePlayback?: {
    resolve: () => void;
    requestId: number;
    utterance: SpeechSynthesisUtterance;
  };

  private requestId = 0;

  isSupported() {
    return (
      typeof window !== "undefined" &&
      "speechSynthesis" in window &&
      "SpeechSynthesisUtterance" in window
    );
  }

  async speak(input: SpeechAudioInput) {
    if (!this.isSupported()) {
      throw new Error("This browser does not support text-to-speech playback.");
    }

    const speechWindow = window as SpeechWindow;
    const synthesis = speechWindow.speechSynthesis;

    if (!synthesis) {
      throw new Error("This browser does not support text-to-speech playback.");
    }

    this.cancel();
    const requestId = this.requestId + 1;
    this.requestId = requestId;

    const language = input.language ?? DEFAULT_LANGUAGE;
    const utterance = new SpeechSynthesisUtterance(input.text);

    utterance.lang = language;
    utterance.rate = input.rate ?? DEFAULT_RATE;
    utterance.pitch = input.pitch ?? DEFAULT_PITCH;
    utterance.voice = await selectVoice(synthesis, language);

    if (this.requestId !== requestId) {
      return;
    }

    await new Promise<void>((resolve, reject) => {
      const clearPlayback = () => {
        if (this.activePlayback?.requestId === requestId) {
          this.activePlayback = undefined;
        }
      };

      this.activePlayback = {
        requestId,
        resolve: () => {
          clearPlayback();
          resolve();
        },
        utterance,
      };

      utterance.onend = () => {
        clearPlayback();
        resolve();
      };
      utterance.onerror = () => {
        clearPlayback();
        reject(new Error("Speech playback failed."));
      };

      synthesis.speak(utterance);
    });
  }

  cancel() {
    this.requestId += 1;
    const activePlayback = this.activePlayback;
    this.activePlayback = undefined;
    activePlayback?.resolve();

    if (this.isSupported()) {
      window.speechSynthesis.cancel();
    }
  }
}

async function selectVoice(
  synthesis: SpeechSynthesis,
  language: string,
): Promise<SpeechSynthesisVoice | null> {
  const voices = await loadVoices(synthesis);
  const languagePrefix = language.split("-")[0];

  return (
    voices.find((voice) => voice.lang === language) ??
    voices.find((voice) => voice.lang.startsWith(`${languagePrefix}-`)) ??
    null
  );
}

async function loadVoices(
  synthesis: SpeechSynthesis,
): Promise<SpeechSynthesisVoice[]> {
  const voices = synthesis.getVoices();

  if (voices.length > 0) {
    return voices;
  }

  return new Promise((resolve) => {
    const timeoutId = window.setTimeout(() => {
      synthesis.onvoiceschanged = null;
      resolve(synthesis.getVoices());
    }, VOICE_LOAD_TIMEOUT_MS);

    synthesis.onvoiceschanged = () => {
      window.clearTimeout(timeoutId);
      synthesis.onvoiceschanged = null;
      resolve(synthesis.getVoices());
    };
  });
}