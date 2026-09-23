import { callOllama } from "@query-classifier/llm-client";

const QUESTION_SCHEMA = {
  type: "object" as const,
  properties: { question: { type: "string" } },
  required: ["question"],
};

// Plain-English phrasing per kind, so the model has concrete material to
// work with instead of having to invent a translation of abstract labels
// like "substring"/"prefix" itself - that caused off-target questions on
// the first attempt.
const KIND_PHRASE: Record<string, string> = {
  eq: "match exactly, and only exactly",
  prefix: "appear only at the very beginning",
  suffix: "appear only at the very end",
  substring: "appear anywhere at all",
  gt: "be strictly greater than that number/date",
  lt: "be strictly less than that number/date",
  self: "be the caller's own item",
};

function topCandidates(probabilities: Record<string, number>, n = 2) {
  return Object.entries(probabilities)
    .sort((a, b) => b[1] - a[1])
    .slice(0, n)
    .map(([key]) => ({ key, phrase: KIND_PHRASE[key] ?? key }));
}

// Instead of surfacing raw labels ("prefix vs substring") to the user, hand
// the ambiguity + the original query to the small model and ask it to
// phrase ONE natural question a human would actually ask back - generation,
// not classification, exactly the kind of narrow task reserved for the LLM.
//
// NOTE: this function works (generates usable questions). What does NOT
// work yet is deciding WHEN to call it - no confidence threshold tested so
// far separates real ambiguity from correct-but-low-confidence answers.
// Callers must gate this behind their own (currently unvalidated) trigger;
// it is not wired into the default pipeline.
export async function buildClarification(
  query: string,
  decisionLabel: string,
  probabilities: Record<string, number>,
): Promise<string> {
  const candidates = topCandidates(probabilities);
  const optionsText = candidates.map((c) => `- should ${c.phrase}`).join("\n");

  const systemPrompt = `A system needs to decide "${decisionLabel}" for the user's search request below, but is torn between two interpretations:
${optionsText}

Ask the user ONE short question that presents both interpretations and lets them pick, using the specific word or value from their own request. Do not use the words "prefix", "suffix", "substring", "eq", or mention confidence/scores.

Example: request="items that start with Main" torn between "appear only at the very beginning" and "appear anywhere at all" -> question="Should 'Main' appear only at the start of the name, or anywhere in it?"`;

  const result = await callOllama<{ question: string }>(
    [
      { role: "system", content: systemPrompt },
      { role: "user", content: query },
    ],
    QUESTION_SCHEMA,
    0.3,
  );
  return result.question;
}
