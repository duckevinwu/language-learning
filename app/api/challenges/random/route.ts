import { getRandomChallenge, toPublicChallenge } from "@/lib/challenge";

export async function GET() {
  return Response.json(toPublicChallenge(getRandomChallenge()), {
    headers: {
      "Cache-Control": "no-store",
    },
  });
}
