import "server-only";

import { pinyin } from "pinyin-pro";

const hanCharacterPattern = /[\u3400-\u9fff]/u;

export function romanizeMandarin(text: string): string {
  return pinyin(text, { toneType: "symbol" });
}

export function romanizeMandarinInContext(
  text: string,
  context: string,
  options: { occurrenceIndex?: number; hanStartIndex?: number } = {},
): string {
  const contextualPinyin = readContextualPinyin(text, context, options);

  return contextualPinyin || romanizeMandarin(text);
}

function readContextualPinyin(
  text: string,
  context: string,
  options: { occurrenceIndex?: number; hanStartIndex?: number },
) {
  const textCharacters = Array.from(text);
  const contextCharacters = Array.from(context);
  const contextPinyin = pinyin(context, {
    toneType: "symbol",
    type: "array",
  }) as string[];

  if (
    textCharacters.length === 0 ||
    contextCharacters.length === 0 ||
    contextCharacters.length !== contextPinyin.length
  ) {
    return undefined;
  }

  const matches = findContextMatches(textCharacters, contextCharacters);
  const match =
    matches.find((candidate) => candidate.hanStartIndex === options.hanStartIndex) ??
    matches[options.occurrenceIndex ?? 0];

  if (!match) {
    return undefined;
  }

  const syllables = contextCharacters
    .slice(match.startIndex, match.startIndex + textCharacters.length)
    .map((character, index) =>
      hanCharacterPattern.test(character)
        ? contextPinyin[match.startIndex + index]
        : undefined,
    )
    .filter((syllable): syllable is string => Boolean(syllable));

  return syllables.length > 0 ? syllables.join(" ") : undefined;
}

function findContextMatches(
  textCharacters: string[],
  contextCharacters: string[],
) {
  const matches: Array<{ startIndex: number; hanStartIndex: number }> = [];
  let hanStartIndex = 0;

  for (
    let startIndex = 0;
    startIndex <= contextCharacters.length - textCharacters.length;
    startIndex += 1
  ) {
    if (isCharacterMatch(contextCharacters, textCharacters, startIndex)) {
      matches.push({ startIndex, hanStartIndex });
    }

    if (hanCharacterPattern.test(contextCharacters[startIndex])) {
      hanStartIndex += 1;
    }
  }

  return matches;
}

function isCharacterMatch(
  contextCharacters: string[],
  textCharacters: string[],
  startIndex: number,
) {
  return textCharacters.every(
    (character, index) => contextCharacters[startIndex + index] === character,
  );
}