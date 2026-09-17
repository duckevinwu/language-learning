import { PracticeRecorder } from "./practice-recorder";
import { getRandomDailyChallenge } from "@/lib/challenge";
import { parseLanguageCode } from "@/lib/language";

export const dynamic = "force-dynamic";

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ language?: string | string[] }>;
}) {
  const params = await searchParams;
  const language = parseLanguageCode(
    Array.isArray(params.language) ? params.language[0] : params.language,
  );
  const dailyChallenge = getRandomDailyChallenge(language);

  return (
    <main className="min-h-screen bg-[#f8f5ef] text-[#1f1b16]">
      <div className="mx-auto flex min-h-screen w-full max-w-4xl flex-col px-6 py-8 sm:px-10 lg:px-12">
        <header className="flex items-center justify-between border-b border-[#ded7ca] pb-5">
          <div>
            <p className="text-xs font-medium uppercase tracking-[0.18em] text-[#756b5d]">
              Speaking Practice
            </p>
            <h1 className="mt-2 text-2xl font-semibold sm:text-3xl">
              Daily Challenge
            </h1>
          </div>
          <div className="hidden rounded-full border border-[#cfc5b6] px-3 py-1 text-sm text-[#5d554b] sm:block">
            3 levels
          </div>
        </header>

        <PracticeRecorder dailyChallenge={dailyChallenge} />
      </div>
    </main>
  );
}
