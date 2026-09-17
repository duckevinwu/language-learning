import {
  jsonWithCors,
  preflightResponse,
  rejectDisallowedOrigin,
} from "@/lib/api/cors";
import { getRandomDailyChallenge } from "@/lib/challenge";
import { isLanguageCode } from "@/lib/language";

export async function GET(request: Request) {
  const forbidden = rejectDisallowedOrigin(request);

  if (forbidden) {
    return forbidden;
  }

  const requestedLanguage = new URL(request.url).searchParams.get("language");

  if (requestedLanguage !== null && !isLanguageCode(requestedLanguage)) {
    return jsonWithCors(request, { error: "Unsupported language." }, { status: 400 });
  }

  const language = requestedLanguage ?? "zh";

  return jsonWithCors(request, getRandomDailyChallenge(language), {
    headers: {
      "Cache-Control": "no-store",
    },
  });
}

export async function OPTIONS(request: Request) {
  return preflightResponse(request, ["GET", "OPTIONS"]);
}
