import "server-only";

import { pinyin } from "pinyin-pro";

export function romanizeMandarin(text: string): string {
  return pinyin(text, { toneType: "symbol" });
}

const hanTextPattern = /\p{Script=Han}+/gu;

export function segmentMandarinWithPinyin(text: string) {
  const segments: Array<
    | { type: "text"; text: string }
    | { type: "mandarin"; text: string; pinyin: string }
  > = [];
  let cursor = 0;

  for (const match of text.matchAll(hanTextPattern)) {
    const phrase = match[0];
    const phraseStart = match.index ?? 0;

    if (phraseStart > cursor) {
      segments.push({ type: "text", text: text.slice(cursor, phraseStart) });
    }

    segments.push({
      type: "mandarin",
      text: phrase,
      pinyin: romanizeMandarin(phrase),
    });

    cursor = phraseStart + phrase.length;
  }

  if (cursor < text.length) {
    segments.push({ type: "text", text: text.slice(cursor) });
  }

  return segments;
}
