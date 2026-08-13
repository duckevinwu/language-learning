import "server-only";

import generatedBreakdowns from "@/data/example-breakdowns.json";
import { normalizeExampleBreakdown } from "./example-breakdown";
import type { ExampleSentencePart } from "./types";

const breakdownsByChallengeId = generatedBreakdowns as Record<string, unknown>;

export function getStaticExampleBreakdown(
  challengeId: string,
): ExampleSentencePart[] | null {
  return normalizeExampleBreakdown(breakdownsByChallengeId[challengeId]);
}
