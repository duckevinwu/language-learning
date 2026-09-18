import fs from "node:fs/promises";
import path from "node:path";

const baseUrl = (process.env.SMOKE_BASE_URL ?? "http://localhost:3000").replace(
  /\/$/,
  "",
);
const origin = process.env.SMOKE_ORIGIN;
const cases = [
  ["zh", "beginner-002-introduce-name", "SMOKE_ZH_AUDIO"],
  ["es", "es-beginner-002-name", "SMOKE_ES_AUDIO"],
  ["ja", "ja-beginner-002-name", "SMOKE_JA_AUDIO"],
];

await run();

async function run() {
  for (const [language, challengeId, audioVariable] of cases) {
    const audioPath = process.env[audioVariable];

    if (!audioPath) {
      throw new Error(`${audioVariable} must point to a spoken WAV fixture.`);
    }

    const response = await postEvaluation(challengeId, audioPath, "standard");
    const report = await readJson(response);

    assert(response.ok, `${language} returned HTTP ${response.status}`);
    assert(report.language === language, `${language} returned the wrong language`);
    assert(typeof report.transcript === "string" && report.transcript, `${language} returned no transcript`);
    assert(typeof report.meaningScore === "number", `${language} returned no meaning score`);
    assert(typeof report.grammarScore === "number", `${language} returned no grammar score`);
    assert(typeof report.pronunciationScore === "number", `${language} returned no pronunciation score`);
    assert(Array.isArray(report.exampleBreakdown) && report.exampleBreakdown.length > 0, `${language} returned no example breakdown`);

    console.log(`${language}: standard evaluation passed`);
  }

  const invalidMode = await postEvaluation(
    "es-beginner-002-name",
    null,
    "unsupported",
  );
  assert((await readJson(invalidMode)).error, "invalid mode returned no error");
  assert(invalidMode.status === 400, `invalid mode returned HTTP ${invalidMode.status}`);

  const emptyAudio = await postEvaluation(
    "es-beginner-002-name",
    null,
    "standard",
  );
  assert((await readJson(emptyAudio)).error, "empty audio returned no error");
  assert(emptyAudio.status === 400, `empty audio returned HTTP ${emptyAudio.status}`);

  if (origin) {
    const allowed = await fetch(
      `${baseUrl}/api/challenges/day?language=es`,
      { headers: { Origin: origin } },
    );
    assert(allowed.status === 200, `allowed origin returned HTTP ${allowed.status}`);
    assert(
      allowed.headers.get("access-control-allow-origin") === origin,
      "allowed origin did not receive Access-Control-Allow-Origin",
    );

    const disallowed = await fetch(
      `${baseUrl}/api/challenges/day?language=es`,
      { headers: { Origin: `${origin}-not-allowed` } },
    );
    assert(disallowed.status === 403, `disallowed origin returned HTTP ${disallowed.status}`);
  }
}

async function postEvaluation(challengeId, audioPath, evaluationMode) {
  const formData = new FormData();
  formData.append("challengeId", challengeId);
  formData.append("evaluationMode", evaluationMode);

  if (audioPath) {
    const audio = await fs.readFile(audioPath);
    formData.append(
      "audio",
      new Blob([audio], { type: "audio/wav" }),
      path.basename(audioPath),
    );
  } else {
    formData.append("audio", new Blob([], { type: "audio/wav" }), "empty.wav");
  }

  const headers = origin ? { Origin: origin } : undefined;

  return fetch(`${baseUrl}/api/evaluate`, {
    method: "POST",
    headers,
    body: formData,
  });
}

async function readJson(response) {
  const body = await response.json();

  if (!body || typeof body !== "object") {
    throw new Error(`Expected JSON response, received HTTP ${response.status}`);
  }

  return body;
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}
