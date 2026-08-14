import {
  jsonWithCors,
  preflightResponse,
  rejectDisallowedOrigin,
} from "@/lib/api/cors";
import { getRandomChallenge, toPublicChallenge } from "@/lib/challenge";

export async function GET(request: Request) {
  const forbidden = rejectDisallowedOrigin(request);

  if (forbidden) {
    return forbidden;
  }

  return jsonWithCors(request, toPublicChallenge(getRandomChallenge()), {
    headers: {
      "Cache-Control": "no-store",
    },
  });
}

export async function OPTIONS(request: Request) {
  return preflightResponse(request, ["GET", "OPTIONS"]);
}
