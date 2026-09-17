import fs from "node:fs/promises";
import path from "node:path";
import OpenAI from "openai";

const repoRoot = process.cwd();
const challengeSourcePath = path.join(repoRoot, "lib", "challenge.ts");
const outputPath = path.join(repoRoot, "data", "example-breakdowns.json");
const model = process.env.EXAMPLE_BREAKDOWN_MODEL ?? "gpt-5.6-luna";

if (!process.env.OPENAI_API_KEY) {
  throw new Error("OPENAI_API_KEY is required to generate example breakdowns.");
}

const challengeSource = await fs.readFile(challengeSourcePath, "utf8");
const challenges = readChallengeSeeds(challengeSource);
const existing = await readExistingBreakdowns(outputPath);
const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

for (const challenge of challenges) {
  if (existing[challenge.id]?.length) {
    continue;
  }

  existing[challenge.id] = await generateBreakdown(client, challenge);
  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.writeFile(outputPath, `${JSON.stringify(existing, null, 2)}\n`);
  console.log(`Generated ${challenge.id}`);
}

console.log(`Wrote ${Object.keys(existing).length} breakdowns to ${outputPath}`);

function readChallengeSeeds(source) {
  const matches = source.matchAll(
    /\["([^"]+)",\s*"([^"]+)",\s*"([^"]+)",\s*"([^"]+)"(?:,\s*"([^"]+)")?\]/g,
  );

  return [...matches].map((match) => ({
    id: match[1],
    englishPrompt: match[2],
    exampleAnswer: match[3],
  }));
}

async function readExistingBreakdowns(filePath) {
  try {
    return JSON.parse(await fs.readFile(filePath, "utf8"));
  } catch (error) {
    if (error.code === "ENOENT") {
      return {};
    }

    throw error;
  }
}

async function generateBreakdown(client, challenge) {
  const response = await client.responses.create({
    model,
    input: JSON.stringify(
      {
        task: "Break down a target-language example sentence for a beginner learner.",
        englishPrompt: challenge.englishPrompt,
        exampleAnswer: challenge.exampleAnswer,
        language: challenge.id.slice(0, 2),
        rules: [
          "Split exampleAnswer into 2-8 contiguous beginner-useful chunks.",
          "Each item must copy its text exactly from exampleAnswer.",
          "Each definition should be a concise English gloss for that chunk.",
          "Do not include a reading unless the target language uses one and it is certain.",
        ],
      },
      null,
      2,
    ),
    instructions:
      "Split the target-language example answer into learner-useful chunks. Return JSON only.",
    text: {
      format: {
        type: "json_schema",
        name: "language_example_breakdown",
        strict: true,
        schema: {
          type: "object",
          additionalProperties: false,
          required: ["exampleBreakdown"],
          properties: {
            exampleBreakdown: {
              type: "array",
              minItems: 1,
              maxItems: 8,
              items: {
                type: "object",
                additionalProperties: false,
                required: ["text", "definition"],
                properties: {
                  text: { type: "string" },
                  definition: { type: "string" },
                },
              },
            },
          },
        },
      },
    },
  });

  const parsed = JSON.parse(response.output_text);
  return parsed.exampleBreakdown;
}
