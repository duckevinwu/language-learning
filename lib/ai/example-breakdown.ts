import type { ExampleSentencePart } from "./types";

export const exampleBreakdownSchema = {
  type: "array",
  minItems: 1,
  maxItems: 8,
  items: {
    type: "object",
    additionalProperties: false,
    required: ["text", "definition"],
    properties: {
      text: {
        type: "string",
        description:
          "A contiguous Mandarin word or phrase copied exactly from exampleMandarinAnswer.",
      },
      definition: {
        type: "string",
        description:
          "A concise English gloss for this part of the example sentence.",
      },
    },
  },
} as const;

export function normalizeExampleBreakdown(
  value: unknown,
): ExampleSentencePart[] | null {
  if (!Array.isArray(value) || value.length < 1 || value.length > 8) {
    return null;
  }

  const parts = value.map((part) => {
    if (!isRecord(part)) {
      return null;
    }

    const text = readRequiredString(part.text);
    const definition = readRequiredString(part.definition);

    if (!text || !definition) {
      return null;
    }

    return { text, definition };
  });

  if (parts.some((part) => part === null)) {
    return null;
  }

  return parts as ExampleSentencePart[];
}

function readRequiredString(value: unknown) {
  return typeof value === "string" && value.trim().length > 0
    ? value.trim()
    : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}