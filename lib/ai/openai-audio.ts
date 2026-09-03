import "server-only";

import { AIProviderError } from "./errors";
import { clampScore, getOpenAIClient, toProviderError } from "./openai";
import type {
  AudioCorrectnessEvaluation,
  AudioEvaluationInput,
  AudioMandarinEvaluator,
  Challenge,
} from "./types";

type ParsedAudioCorrectnessEvaluation = AudioCorrectnessEvaluation & {
  naturalnessScore: number;
  englishWordCount: number;
};

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
              "You are a strict but helpful Mandarin speaking coach for a beginner learner. Listen to the learner's audio directly and first transcribe exactly what was actually said, including beginner mistakes, broken Mandarin, missing words, wrong words, wrong grammar, and semantically incorrect answers. Do not infer, complete, predict, normalize, or correct the learner's answer from the English prompt or example answer. Accurate transcription of mistakes is required because those mistakes are what the app teaches from. Evaluate pronunciation and tones as a separate task; intelligible speech can still need tone correction, but minor or uncertain accent-level issues should not force feedback. Call the provided tool with JSON arguments only.",
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
        "englishWordCount",
        "grammarScore",
        "naturalnessScore",
        "pronunciationScore",
        "toneScore",
        "pronunciationNeedsWork",
        "pronunciationFeedback",
      ],
      properties: {
        transcript: {
          type: "string",
          description:
            "What the beginner learner actually said, transcribed literally in the language and script they used. Use Chinese characters only for Mandarin words actually spoken as Mandarin; preserve English, pinyin, mixed speech, mistakes, omissions, broken word order, and semantically wrong answers. Do not repair an incorrect answer into the expected answer.",
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
        englishWordCount: {
          type: "integer",
          minimum: 0,
          description:
            "Number of English words actually spoken. Do not count pinyin that represents Mandarin speech.",
        },
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
      gradingRules: [
        "The speaker is a beginner. Beginner mistakes are expected and must be preserved in transcript because they are the evidence used for learning.",
        "Listen to the audio directly; do not assume the learner said the example answer or any ideal answer.",
        "First transcribe the learner literally, then evaluate that transcript against the English prompt. Never use the exampleMandarinAnswer to fill in words, modifiers, or meaning that are missing from the audio.",
        "Transcribe exactly what the learner says in the language and script they used, even if it is grammatically wrong, semantically wrong, incomplete, unnatural, mixed Mandarin/English, pinyin, or not a good answer to the prompt.",
        "Use Chinese characters only for Mandarin words actually spoken as Mandarin. Do not translate English into Mandarin, and do not convert pinyin into Chinese characters unless the spoken word is clearly Mandarin speech rather than a spelling/reading attempt.",
        "Do not silently repair, normalize, complete, predict, or reinterpret a broken utterance into a good Mandarin sentence.",
        "A bad transcript that preserves the learner's mistake is more useful than a polished transcript that hides the mistake.",
        "Grade only the actual spoken content in transcript. A few correct characters or words are not enough for a high score if the full prompt meaning is missing.",
        "This is a Mandarin speaking exercise, not a translation exercise. Never award meaning credit for English merely because it translates the prompt: an entirely English answer must have isCorrect false and meaningScore 0. Count every English word in englishWordCount; do not count pinyin that represents Mandarin speech. For a mixed Mandarin/English answer, reduce meaningScore by at least 15 points per English word. English words cannot receive meaning credit, and two English words cap meaningScore at 70.",
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
        "If the answer gets the core meaning but has notable grammar or word-choice errors, keep meaningScore based on meaning alone; lower meaningScore only when an error changes or obscures what was expressed. Set overallScore according to severity.",
        "Only use overallScore above 80 when the answer is both semantically correct and mostly grammatical. Pronunciation alone cannot make a wrong answer correct.",
        "Score 0-100 integers for all score fields.",
        "Score meaningScore, grammarScore, and naturalnessScore independently. Do not let one score mechanically determine, cap, or pull down another.",
        "meaningScore measures only whether the learner expressed the target meaning. Missing, changed, or incorrect prompt details belong to meaningScore, not grammarScore, when the remaining sentence is grammatical Mandarin.",
        "grammarScore measures only the grammatical form of the literal transcript: Mandarin word order, sentence structure, required function words and particles, classifier use, aspect/tense markers where the utterance requires them, negation/question placement, and whether the result is syntactically interpretable.",
        "For grammarScore, ignore whether the answer matches the English prompt. A fluent, grammatical Mandarin sentence that answers the wrong question can score 90-100 for grammar while receiving a low meaningScore.",
        "Do not penalize grammarScore for vocabulary choice, idiomatic preference, brevity, or omitted prompt details unless they make the actual Mandarin construction ungrammatical or impossible to interpret. Do not penalize pronunciation, tones, recording quality, or punctuation.",
        "Use this grammarScore calibration: 95-100 = fully well-formed Mandarin with no meaningful grammar error; 85-94 = one minor grammar/word-order/particle issue but clearly well-formed; 70-84 = one noticeable or a few minor grammar errors, yet the sentence structure remains clear; 50-69 = repeated or significant grammar errors that make the sentence awkward or partly unclear; 25-49 = broken word order or missing core grammar that makes much of the utterance hard to parse; 0-24 = isolated words, mostly non-Mandarin, or no interpretable Mandarin sentence structure.",
        "When choosing a grammarScore, first classify the transcript into one calibration band, then select a score within that band. Do not use an extreme low score for a single minor error.",
        "naturalnessScore measures only how idiomatic and native-like the wording sounds. Do not lower grammarScore merely because a grammatical sentence is less idiomatic; record that distinction in naturalnessScore.",
        "pronunciationScore measures pronunciation clarity, initials, finals, rhythm, and intelligibility. Use the full scale; 85+ means genuinely strong pronunciation, not merely understandable speech. Scores in the 80s may still be acceptable without feedback when issues are minor or uncertain.",
        "toneScore measures Mandarin tone accuracy and tone flow. Use the full scale; 85+ means genuinely strong tone production, not merely intelligible speech. Scores in the 80s may still be acceptable without feedback when tone issues are minor or uncertain.",
        "Pronunciation/tone score calibration: 95-100 = accurate and natural; 85-94 = strong with only minor accent or uncertainty; 70-84 = understandable but with at least one noticeable tone/pronunciation issue; 50-69 = repeated or meaning-risking pronunciation/tone problems; below 50 = hard to understand or many wrong tones.",
        "If any syllable has a clear wrong tone category, cap toneScore at 79. If multiple syllables have clear wrong tone categories, cap toneScore at 69. If tones are mostly flat or missing, cap toneScore at 74.",
        "If an initial/final/rhythm issue makes a syllable sound like a different Mandarin syllable, cap pronunciationScore at 79. If this happens repeatedly, cap pronunciationScore at 69.",
        "overallScore should reflect practical correctness of the spoken answer. It must be no more than 10 points above meaningScore unless meaningScore is at least 85.",
        "Set isCorrect true only when the answer would be accepted as correct in a speaking practice exercise.",
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


  const transcript = parsed.transcript.trim();
  const isMandarinResponse = /\p{Script=Han}/u.test(transcript);
  const pronunciationNeedsWork = parsed.pronunciationNeedsWork;
  const pronunciationFeedback = parsed.pronunciationFeedback?.trim();
  const meaningScore = isMandarinResponse
    ? applyEnglishWordPenalty(parsed.meaningScore, parsed.englishWordCount)
    : 0;
  const overallScore = clampOverallScore(
    parsed.overallScore,
    meaningScore,
    isMandarinResponse && parsed.isCorrect,
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
    transcript,
    isCorrect:
      isMandarinResponse && parsed.isCorrect && parsed.englishWordCount === 0,
    overallScore,
    meaningScore,
    grammarScore: clampScore(parsed.grammarScore),
    naturalnessScore: clampScore(parsed.naturalnessScore),
    pronunciationScore: clampScore(parsed.pronunciationScore),
    toneScore: clampScore(parsed.toneScore),
    pronunciationNeedsWork,
    ...(pronunciationFeedback ? { pronunciationFeedback } : {}),
    pronunciationProvider: GPT_AUDIO_EVALUATION_MODEL,
  };
}

function applyEnglishWordPenalty(score: number, englishWordCount: number) {
  const maximumScore = Math.max(
    0,
    100 - Math.max(0, Math.floor(englishWordCount)) * 15,
  );

  return Math.min(clampScore(score), maximumScore);
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
): value is ParsedAudioCorrectnessEvaluation {
  if (!value || typeof value !== "object") {
    return false;
  }

  const report = value as Record<string, unknown>;
  const scoreFields = [
    "overallScore",
    "meaningScore",
    "englishWordCount",
    "grammarScore",
    "naturalnessScore",
    "pronunciationScore",
    "toneScore",
  ];

  return (
    typeof report.isCorrect === "boolean" &&
    typeof report.transcript === "string" &&
    typeof report.pronunciationNeedsWork === "boolean" &&
    (report.pronunciationFeedback === undefined ||
      typeof report.pronunciationFeedback === "string") &&
    scoreFields.every((field) => Number.isFinite(report[field]))
  );
}
