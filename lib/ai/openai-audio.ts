import "server-only";

import { AIProviderError } from "./errors";
import { clampScore, getOpenAIClient, toProviderError } from "./openai";
import type {
  AudioCorrectnessEvaluation,
  AudioEvaluationInput,
  AudioMandarinEvaluator,
  Challenge,
} from "./types";

const GPT_AUDIO_EVALUATION_MODEL = "gpt-audio-1.5";

export class OpenAIGptAudioMandarinEvaluator implements AudioMandarinEvaluator {
  async evaluate(
    input: AudioEvaluationInput,
  ): Promise<AudioCorrectnessEvaluation> {
    if (input.audio.size === 0 || input.audio.data.byteLength === 0) {
      throw new AIProviderError("The uploaded audio file is empty.", 400);
    }

    try {
      const client = getOpenAIClient();
      const audioBase64 = Buffer.from(input.audio.data).toString("base64");
      const response = await client.chat.completions.create({
        model: GPT_AUDIO_EVALUATION_MODEL,
        messages: [
          {
            role: "system",
            content:
              "You are a strict but helpful Mandarin speaking coach. Listen to the learner's audio directly and grade what was actually said, not what the learner may have intended. Do not infer, complete, or correct the learner's answer from the English prompt, target concepts, or example answer. Evaluate pronunciation and tones as a separate task; intelligible speech can still need tone correction, but minor or uncertain accent-level issues should not force feedback. Call the provided tool with JSON arguments only.",
          },
          {
            role: "user",
            content: [
              {
                type: "text",
                text: buildAudioEvaluationPrompt(input.challenge),
              },
              {
                type: "input_audio",
                input_audio: {
                  data: audioBase64,
                  format: "wav",
                },
              },
            ],
          },
        ],
        tool_choice: {
          type: "function",
          function: { name: "submit_mandarin_audio_evaluation" },
        },
        tools: [mandarinAudioEvaluationTool],
        temperature: 0,
        max_completion_tokens: 900,
      });

      const toolCall = response.choices[0]?.message.tool_calls?.find(
        (call) =>
          call.type === "function" &&
          "function" in call &&
          call.function.name === "submit_mandarin_audio_evaluation",
      );

      if (!toolCall || !("function" in toolCall)) {
        throw new AIProviderError(
          "The audio evaluator did not return structured feedback. Try again.",
          502,
        );
      }

      return parseAudioEvaluationReport(toolCall.function.arguments);
    } catch (error) {
      if (error instanceof AIProviderError) {
        throw error;
      }

      throw toProviderError(error, "evaluation");
    }
  }
}

const mandarinAudioEvaluationTool = {
  type: "function",
  function: {
    name: "submit_mandarin_audio_evaluation",
    description:
      "Submit a Mandarin speaking-practice evaluation based on the learner audio.",
    parameters: {
      type: "object",
      additionalProperties: false,
      required: [
        "transcript",
        "isCorrect",
        "overallScore",
        "meaningScore",
        "grammarScore",
        "naturalnessScore",
        "pronunciationScore",
        "toneScore",
        "pronunciationNeedsWork",
        "feedback",
        "pronunciationFeedback",
      ],
      properties: {
        transcript: {
          type: "string",
          description:
            "What the learner actually said, transcribed literally in Chinese characters. Do not repair an incorrect answer into the expected answer.",
        },
        isCorrect: { type: "boolean" },
        overallScore: { type: "integer", minimum: 0, maximum: 100 },
        meaningScore: {
          type: "integer",
          minimum: 0,
          maximum: 100,
          description:
            "How completely the spoken answer expresses the English prompt meaning. Isolated matching words or characters must not receive a high score.",
        },
        grammarScore: { type: "integer", minimum: 0, maximum: 100 },
        naturalnessScore: { type: "integer", minimum: 0, maximum: 100 },
        pronunciationScore: {
          type: "integer",
          minimum: 0,
          maximum: 100,
          description:
            "Use the full 0-100 range for pronunciation clarity. 85+ means genuinely strong pronunciation, not merely understandable speech.",
        },
        toneScore: {
          type: "integer",
          minimum: 0,
          maximum: 100,
          description:
            "Use the full 0-100 range for Mandarin tone accuracy. 85+ means tones are genuinely strong, not merely intelligible.",
        },
        pronunciationNeedsWork: {
          type: "boolean",
          description:
            "True only when there is a clear, material initial, final, rhythm, or tone issue that a learner should fix next. False for minor, uncertain, or accent-level variation.",
        },
        feedback: {
          type: "string",
          description:
            "Concise coaching on meaning, grammar, vocabulary, or phrasing. If the answer is mostly wrong, state the missing core meaning and give a corrected Mandarin answer.",
        },
        pronunciationFeedback: {
          type: "string",
          description:
            "Always return a string. When pronunciationNeedsWork is true, name one high-impact word or syllable, target pinyin with tone numbers, and the observed issue. Return an empty string when pronunciationNeedsWork is false.",
        },
      },
    },
  },
} as const;

function buildAudioEvaluationPrompt(challenge: Challenge) {
  return JSON.stringify(
    {
      task: "Evaluate a completed Mandarin spoken-answer recording.",
      englishPrompt: challenge.englishPrompt,
      exampleMandarinAnswer: challenge.exampleMandarinAnswer,
      targetConcepts: challenge.targetConcepts,
      gradingRules: [
        "Listen to the audio directly; do not assume the learner said the example answer or any ideal answer.",
        "First transcribe the learner literally, then evaluate that transcript against the English prompt. Never use the exampleMandarinAnswer or targetConcepts to fill in words, modifiers, or meaning that are missing from the audio.",
        "Transcribe literally. Do not silently repair, normalize, complete, or reinterpret a broken utterance into a good Mandarin sentence.",
        "Grade only the actual spoken content in transcript. A few correct characters, words, or target concepts are not enough for a high score if the full prompt meaning is missing.",
        "If they mostly did not speak Mandarin, transcribe what you can and score correctness very low.",
        "The exampleMandarinAnswer is only one correct example, not the only valid answer.",
        "Award full meaning marks only if the spoken answer expresses all essential parts of the English prompt, even when wording differs from the example.",
        "Before scoring, identify the English prompt's essential meaning slots: who/subject, action or state, object/complement, direction, location, time/aspect, negation, question intent, quantity, and any modifier or politeness requirement that changes the requested meaning.",
        "Compare the transcript slot by slot with the English prompt. Equivalent Mandarin wording is fine, but each required slot must be present in what the learner actually said.",
        "A fluent or grammatical Mandarin sentence can still be incorrect if it is more generic than the prompt, omits a required modifier/detail, changes the requested action/state, or answers only part of the prompt.",
        "meaningScore must be low when any essential meaning slot is missing, weaker, more generic, or wrong. Do not give credit for matching vocabulary that does not form the requested meaning.",
        "If the answer contains only isolated correct words or characters but does not form a coherent answer to the prompt, set isCorrect false, meaningScore 0-35, and overallScore 0-45.",
        "If the answer is a coherent Mandarin sentence but answers a different prompt or changes the core meaning, set isCorrect false, meaningScore 0-50, and overallScore 0-60.",
        "If the answer captures the broad topic but omits one required slot such as direction, negation, time, place, quantity, object, question intent, or a meaning-changing modifier, set isCorrect false, meaningScore 40-70, and overallScore 45-75 depending on severity.",
        "If the answer gets the core meaning but has notable grammar or word-choice errors, set meaningScore 60-85 and overallScore according to severity.",
        "Only use overallScore above 80 when the answer is both semantically correct and mostly grammatical. Pronunciation alone cannot make a wrong answer correct.",
        "Score 0-100 integers for all score fields.",
        "meaningScore measures whether the learner expressed the target meaning.",
        "grammarScore measures Mandarin grammar and word order.",
        "naturalnessScore measures whether the wording sounds natural to a Mandarin speaker.",
        "pronunciationScore measures pronunciation clarity, initials, finals, rhythm, and intelligibility. Use the full scale; 85+ means genuinely strong pronunciation, not merely understandable speech. Scores in the 80s may still be acceptable without feedback when issues are minor or uncertain.",
        "toneScore measures Mandarin tone accuracy and tone flow. Use the full scale; 85+ means genuinely strong tone production, not merely intelligible speech. Scores in the 80s may still be acceptable without feedback when tone issues are minor or uncertain.",
        "Pronunciation/tone score calibration: 95-100 = accurate and natural; 85-94 = strong with only minor accent or uncertainty; 70-84 = understandable but with at least one noticeable tone/pronunciation issue; 50-69 = repeated or meaning-risking pronunciation/tone problems; below 50 = hard to understand or many wrong tones.",
        "If any syllable has a clear wrong tone category, cap toneScore at 79. If multiple syllables have clear wrong tone categories, cap toneScore at 69. If tones are mostly flat or missing, cap toneScore at 74.",
        "If an initial/final/rhythm issue makes a syllable sound like a different Mandarin syllable, cap pronunciationScore at 79. If this happens repeatedly, cap pronunciationScore at 69.",
        "overallScore should reflect practical correctness of the spoken answer. It must be no more than 10 points above meaningScore unless meaningScore is at least 85.",
        "Set isCorrect true only when the answer would be accepted as correct in a speaking practice exercise.",
        "feedback is learner-facing coaching on correctness or phrasing. Keep it to 2-4 concise English sentences. Include Chinese characters only for corrected or example phrases; do not include pinyin.",
        "Audit the transcript for tones, initials, finals, and rhythm; do this even when the answer meaning is correct and easy to understand.",
        "Set pronunciationNeedsWork true only for a clear, material issue: a wrong tone category, missing/flattened tone contour, unclear initial/final, or rhythm issue that could mislead a listener or is worth fixing next.",
        "Set pronunciationNeedsWork false for slight accent, recording uncertainty, one-off variation, or issues too minor to be the learner\'s next focus. In that case, return an empty pronunciationFeedback string.",
        "If toneScore or pronunciationScore is below 80, pronunciationNeedsWork must be true. If both are 80 or higher, give pronunciationFeedback only when there is one clear high-impact correction.",
        "When pronunciationNeedsWork is true, pronunciationFeedback must be actionable and specific. Use 1-2 concise English sentences and mention only the single highest-impact correction.",
        "Pronunciation feedback must include the exact Chinese word/phrase or syllable to fix, target pinyin with tone numbers, and what likely went wrong in the audio.",
        "Prefer this shape: For \u5728\u54ea\u513f (zai4 nar3), keep \u5728 as a sharp falling 4th tone and let \u54ea\u513f dip then rise for 3rd tone.",
        "Do not include a drill or practice routine in pronunciationFeedback.",
        "Do not write vague advice like work on the tones, sound more natural, pronunciation is understandable, or practice more unless you also name the exact target pinyin/tone and observed issue.",
      ],
    },
    null,
    2,
  );
}

function parseAudioEvaluationReport(
  outputText: string,
): AudioCorrectnessEvaluation {
  let parsed: unknown;

  try {
    parsed = JSON.parse(outputText);
  } catch {
    throw new AIProviderError(
      "The audio evaluator returned invalid feedback. Try again.",
      502,
    );
  }

  if (!isAudioCorrectnessEvaluation(parsed)) {
    throw new AIProviderError(
      "The audio evaluator returned incomplete feedback. Try again.",
      502,
    );
  }

  const pronunciationNeedsWork = parsed.pronunciationNeedsWork;
  const pronunciationFeedback = parsed.pronunciationFeedback?.trim();
  const meaningScore = clampScore(parsed.meaningScore);
  const overallScore = clampOverallScore(
    parsed.overallScore,
    meaningScore,
    parsed.isCorrect,
  );

  if (
    pronunciationNeedsWork &&
    !isSpecificPronunciationFeedback(pronunciationFeedback)
  ) {
    throw new AIProviderError(
      "The audio evaluator returned vague pronunciation feedback. Try again.",
      502,
    );
  }

  return {
    transcript: parsed.transcript.trim(),
    isCorrect: parsed.isCorrect,
    overallScore,
    meaningScore,
    grammarScore: clampScore(parsed.grammarScore),
    naturalnessScore: clampScore(parsed.naturalnessScore),
    pronunciationScore: clampScore(parsed.pronunciationScore),
    toneScore: clampScore(parsed.toneScore),
    pronunciationNeedsWork,
    feedback: parsed.feedback.trim(),
    ...(pronunciationFeedback ? { pronunciationFeedback } : {}),
    pronunciationProvider: GPT_AUDIO_EVALUATION_MODEL,
  };
}

function clampOverallScore(
  overallScore: number,
  meaningScore: number,
  isCorrect: boolean,
) {
  const score = clampScore(overallScore);

  if (!isCorrect) {
    return Math.min(score, 60);
  }

  if (meaningScore < 85) {
    return Math.min(score, meaningScore + 10);
  }

  return score;
}

function isSpecificPronunciationFeedback(feedback: string | undefined) {
  if (!feedback) {
    return false;
  }

  const hasChinese = /\p{Script=Han}/u.test(feedback);
  const hasToneNumber = /\b[a-z\u00fc\u00dcv:]+[1-5]\b/i.test(feedback);

  return hasChinese && hasToneNumber;
}

function isAudioCorrectnessEvaluation(
  value: unknown,
): value is AudioCorrectnessEvaluation {
  if (!value || typeof value !== "object") {
    return false;
  }

  const report = value as Record<string, unknown>;
  const textFields = ["transcript", "feedback"];
  const scoreFields = [
    "overallScore",
    "meaningScore",
    "grammarScore",
    "naturalnessScore",
    "pronunciationScore",
    "toneScore",
  ];

  return (
    typeof report.isCorrect === "boolean" &&
    typeof report.pronunciationNeedsWork === "boolean" &&
    (report.pronunciationFeedback === undefined ||
      typeof report.pronunciationFeedback === "string") &&
    textFields.every((field) => typeof report[field] === "string") &&
    scoreFields.every((field) => Number.isFinite(report[field]))
  );
}
