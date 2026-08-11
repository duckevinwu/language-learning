import { getRandomDailyChallenge } from "@/lib/challenge";

export async function GET() {
  return Response.json(getRandomDailyChallenge(), {
    headers: {
      "Cache-Control": "no-store",
    },
  });
}