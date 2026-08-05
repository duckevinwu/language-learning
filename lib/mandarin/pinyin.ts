import "server-only";

import { pinyin } from "pinyin-pro";

export function romanizeMandarin(text: string): string {
  return pinyin(text, { toneType: "symbol" });
}
