export type SpeechAudioInput = {
  text: string;
  language?: string;
  rate?: number;
  pitch?: number;
};


export interface SpeechAudioProvider {
  readonly id: string;
  isSupported(): boolean;
  speak(input: SpeechAudioInput): Promise<void>;
  cancel(): void;
}
