import "server-only";

import { AIProviderError } from "./errors";
import type { AudioInput } from "./types";

type DecodedWav = {
  channelCount: number;
  sampleRate: number;
  samples: Float32Array[];
};

const TARGET_SAMPLE_RATE = 16000;

export function convertWavToAzurePcm16Mono(input: AudioInput): AudioInput {
  const decoded = decodePcmWav(input.data);
  const monoSamples = mixToMono(decoded.samples);
  const resampledSamples =
    decoded.sampleRate === TARGET_SAMPLE_RATE
      ? monoSamples
      : resampleLinear(monoSamples, decoded.sampleRate, TARGET_SAMPLE_RATE);
  const wavData = encodePcm16Wav(resampledSamples, TARGET_SAMPLE_RATE, 1);

  return {
    data: wavData,
    mimeType: "audio/wav",
    filename: "azure-pronunciation.wav",
    size: wavData.byteLength,
  };
}

function decodePcmWav(data: ArrayBuffer): DecodedWav {
  const view = new DataView(data);

  if (readAscii(view, 0, 4) !== "RIFF" || readAscii(view, 8, 4) !== "WAVE") {
    throw new AIProviderError(
      "Standard evaluation requires a WAV recording.",
      400,
    );
  }

  let offset = 12;
  let audioFormat: number | null = null;
  let channelCount: number | null = null;
  let sampleRate: number | null = null;
  let bitsPerSample: number | null = null;
  let dataOffset: number | null = null;
  let dataLength: number | null = null;

  while (offset + 8 <= view.byteLength) {
    const chunkId = readAscii(view, offset, 4);
    const chunkSize = view.getUint32(offset + 4, true);
    const chunkDataOffset = offset + 8;

    if (chunkDataOffset + chunkSize > view.byteLength) {
      break;
    }

    if (chunkId === "fmt ") {
      audioFormat = view.getUint16(chunkDataOffset, true);
      channelCount = view.getUint16(chunkDataOffset + 2, true);
      sampleRate = view.getUint32(chunkDataOffset + 4, true);
      bitsPerSample = view.getUint16(chunkDataOffset + 14, true);
    } else if (chunkId === "data") {
      dataOffset = chunkDataOffset;
      dataLength = chunkSize;
    }

    offset = chunkDataOffset + chunkSize + (chunkSize % 2);
  }

  if (
    !audioFormat ||
    !channelCount ||
    !sampleRate ||
    !bitsPerSample ||
    dataOffset === null ||
    dataLength === null
  ) {
    throw new AIProviderError("The uploaded WAV file is incomplete.", 400);
  }

  const isPcm16 = audioFormat === 1 && bitsPerSample === 16;
  const isFloat32 = audioFormat === 3 && bitsPerSample === 32;

  if (!isPcm16 && !isFloat32) {
    throw new AIProviderError(
      "Standard evaluation requires 16-bit PCM or 32-bit float WAV audio.",
      400,
    );
  }

  const bytesPerSample = bitsPerSample / 8;
  const frameCount = Math.floor(dataLength / (bytesPerSample * channelCount));
  const samples = Array.from(
    { length: channelCount },
    () => new Float32Array(frameCount),
  );

  for (let frameIndex = 0; frameIndex < frameCount; frameIndex += 1) {
    for (let channelIndex = 0; channelIndex < channelCount; channelIndex += 1) {
      const sampleOffset =
        dataOffset +
        (frameIndex * channelCount + channelIndex) * bytesPerSample;
      samples[channelIndex][frameIndex] = isPcm16
        ? view.getInt16(sampleOffset, true) / 0x8000
        : view.getFloat32(sampleOffset, true);
    }
  }

  return { channelCount, sampleRate, samples };
}

function mixToMono(samples: Float32Array[]) {
  if (samples.length === 1) {
    return samples[0];
  }

  const frameCount = samples[0].length;
  const mono = new Float32Array(frameCount);

  for (let frameIndex = 0; frameIndex < frameCount; frameIndex += 1) {
    let sum = 0;

    for (const channel of samples) {
      sum += channel[frameIndex] ?? 0;
    }

    mono[frameIndex] = sum / samples.length;
  }

  return mono;
}

function resampleLinear(
  samples: Float32Array,
  sourceSampleRate: number,
  targetSampleRate: number,
) {
  if (sourceSampleRate <= 0 || targetSampleRate <= 0) {
    throw new AIProviderError(
      "The uploaded WAV file has an invalid sample rate.",
      400,
    );
  }

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

function encodePcm16Wav(
  samples: Float32Array,
  sampleRate: number,
  channelCount: number,
) {
  const bytesPerSample = 2;
  const blockAlign = channelCount * bytesPerSample;
  const dataLength = samples.length * bytesPerSample;
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

function readAscii(view: DataView, offset: number, length: number) {
  let value = "";

  for (let index = 0; index < length; index += 1) {
    value += String.fromCharCode(view.getUint8(offset + index));
  }

  return value;
}
