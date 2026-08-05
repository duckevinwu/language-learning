import type {
  GrammarPatternTeachingItem,
  TeachingFeedback,
  TeachingItemStatus,
  VocabularyTeachingItem,
} from "./types";

const vocabularyStatuses = ["missing", "misused"];
const grammarStatuses = ["missing", "misused"];

const teachingStringArraySchema = {
  type: "array",
  minItems: 1,
  maxItems: 2,
  items: { type: "string" },
} as const;

export const teachingFeedbackSchema = {
  type: "object",
  additionalProperties: false,
  required: ["summary", "vocabulary", "grammarPatterns", "nextFocus"],
  properties: {
    summary: {
      type: "string",
      description: "One concise learner-facing takeaway. For optimal answers, say no vocabulary or grammar correction is needed."
    },
    vocabulary: {
      type: "array",
      maxItems: 1,
      items: {
        type: "object",
        additionalProperties: false,
        required: [
          "term",
          "meaning",
          "status",
          "learnerAttempt",
          "correction",
          "explanation",
          "examples",
        ],
        properties: {
          term: { type: "string" },
          meaning: { type: "string" },
          status: { type: "string", enum: vocabularyStatuses },
          learnerAttempt: {
            type: "string",
            description: "What the learner said for this item, or an empty string if absent.",
          },
          correction: {
            type: "string",
            description: "Correct Chinese phrase for the mistake.",
          },
          explanation: { type: "string" },
          examples: teachingStringArraySchema,
        },
      },
    },
    grammarPatterns: {
      type: "array",
      maxItems: 1,
      items: {
        type: "object",
        additionalProperties: false,
        required: [
          "pattern",
          "status",
          "learnerAttempt",
          "correction",
          "explanation",
          "examples",
        ],
        properties: {
          pattern: { type: "string" },
          status: { type: "string", enum: grammarStatuses },
          learnerAttempt: {
            type: "string",
            description: "Learner phrase showing this pattern, or an empty string if absent.",
          },
          correction: {
            type: "string",
            description: "Correct Chinese phrase for the mistake.",
          },
          explanation: { type: "string" },
          examples: teachingStringArraySchema,
        },
      },
    },
    nextFocus: {
      type: "string",
      description: "One concrete correction to practice next, or a short note that no correction is needed.",
    },
  },
} as const;

export function normalizeTeachingFeedback(value: unknown): TeachingFeedback | null {
  if (!isRecord(value)) {
    return null;
  }

  const summary = readRequiredString(value.summary);
  const nextFocus = readRequiredString(value.nextFocus);
  const vocabulary = readVocabularyItems(value.vocabulary);
  const grammarPatterns = readGrammarPatternItems(value.grammarPatterns);

  if (!summary || !nextFocus || !vocabulary || !grammarPatterns) {
    return null;
  }

  return {
    summary,
    vocabulary,
    grammarPatterns,
    nextFocus,
  };
}

function readVocabularyItems(value: unknown): VocabularyTeachingItem[] | null {
  if (!Array.isArray(value) || value.length > 1) {
    return null;
  }

  const items = value.map((item) => {
    if (!isRecord(item)) {
      return null;
    }

    const status = readStatus(item.status, vocabularyStatuses);
    const term = readRequiredString(item.term);
    const meaning = readRequiredString(item.meaning);
    const explanation = readRequiredString(item.explanation);
    const examples = readStringArray(item.examples, 1, 2);

    if (!status || !term || !meaning || !explanation || !examples) {
      return null;
    }

    return compactOptionalStrings({
      term,
      meaning,
      status,
      learnerAttempt: readOptionalString(item.learnerAttempt),
      correction: readOptionalString(item.correction),
      explanation,
      examples,
    });
  });

  if (items.some((item) => item === null)) {
    return null;
  }

  return items as VocabularyTeachingItem[];
}

function readGrammarPatternItems(
  value: unknown,
): GrammarPatternTeachingItem[] | null {
  if (!Array.isArray(value) || value.length > 1) {
    return null;
  }

  const items = value.map((item) => {
    if (!isRecord(item)) {
      return null;
    }

    const status = readStatus(item.status, grammarStatuses);
    const pattern = readRequiredString(item.pattern);
    const explanation = readRequiredString(item.explanation);
    const examples = readStringArray(item.examples, 1, 2);

    if (!status || !pattern || !explanation || !examples) {
      return null;
    }

    return compactOptionalStrings({
      pattern,
      status,
      learnerAttempt: readOptionalString(item.learnerAttempt),
      correction: readOptionalString(item.correction),
      explanation,
      examples,
    });
  });

  if (items.some((item) => item === null)) {
    return null;
  }

  return items as GrammarPatternTeachingItem[];
}

function compactOptionalStrings<T extends Record<string, unknown>>(item: T): T {
  return Object.fromEntries(
    Object.entries(item).filter(([, value]) => value !== undefined),
  ) as T;
}

function readRequiredString(value: unknown) {
  return typeof value === "string" && value.trim().length > 0
    ? value.trim()
    : null;
}

function readOptionalString(value: unknown) {
  if (typeof value !== "string") {
    return undefined;
  }

  const trimmed = value.trim();

  return trimmed.length > 0 ? trimmed : undefined;
}

function readStringArray(value: unknown, minItems: number, maxItems: number) {
  if (!Array.isArray(value) || value.length < minItems || value.length > maxItems) {
    return null;
  }

  const items = value.map(readRequiredString);

  if (items.some((item) => item === null)) {
    return null;
  }

  return items as string[];
}

function readStatus<T extends TeachingItemStatus>(
  value: unknown,
  allowed: readonly string[],
): T | null {
  return typeof value === "string" && allowed.includes(value)
    ? (value as T)
    : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
