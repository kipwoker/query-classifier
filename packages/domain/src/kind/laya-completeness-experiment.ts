// Isolated experiment, NOT wired into pipeline.ts. Plays with wording for
// the "is the filter complete" question (decide-continuation-laya.ts's
// isFilterComplete) against a fixed ladder of SQL-so-far snapshots, to see
// whether the score tracks the actual query content or just SQL length.
// Edit STATE_KEY / MESSAGE / SQL_STEPS / instructions / criteria below and
// rerun - nothing here is wired into the real pipeline.
//
// Run with: bun run packages/domain/src/kind/laya-completeness-experiment.ts
const LAYA_URL = process.env.LAYA_URL ?? "http://localhost:8000";

async function predict(state: Record<string, unknown>, questions: Record<string, unknown>) {
  const res = await fetch(`${LAYA_URL}/predict`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ state, questions }),
  });
  if (!res.ok) {
    throw new Error(`laya request failed: ${res.status} ${await res.text()}`);
  }
  return res.json() as Promise<{ answers: { answer: { choice: string; probabilities: Record<string, number>; confidence: number } } }>;
}

// ---- Edit below to try different phrasings ----

// The key laya's `state` uses for the user's raw text. Try "query",
// "message", "userRequest", etc.
const STATE_KEY = "message";

const MESSAGE = "Show playlists with more than 500 and less than 1000 tracks";

// Progressive SQL-so-far snapshots, from nothing to the correct complete
// range - shows whether the score tracks content or just length.
const SQL_STEPS = [
  "SELECT * FROM playlists WHERE ",
  "SELECT * FROM playlists WHERE tracks_count ",
  "SELECT * FROM playlists WHERE tracks_count > ",
  "SELECT * FROM playlists WHERE tracks_count > 500 ",
  "SELECT * FROM playlists WHERE tracks_count > 500 AND tracks_count < 1000 ",
];

const instructions = `Given the \`sql\` WHERE clause built so far, does it fully cover everything mentioned in the \`${STATE_KEY}\`?`;

const criteria = {
  complete: `the \`sql\` WHERE clause covers everything mentioned in the \`${STATE_KEY}\` - nothing more needs to be added`,
  incomplete: `the \`${STATE_KEY}\` mentions something this \`sql\` WHERE clause does not cover yet - another condition is needed`,
};

// ---- Run ----

console.log(`state key: "${STATE_KEY}"`);
console.log(`instructions: ${instructions}`);
console.log(`criteria: ${JSON.stringify(criteria, null, 2)}`);
console.log();

for (const sql of SQL_STEPS) {
  const state = { [STATE_KEY]: MESSAGE, sql };
  const body = await predict(state, { answer: { type: "choice", instructions, criteria } });
  const { choice, probabilities, confidence } = body.answers.answer;
  console.log(`${JSON.stringify(sql).padEnd(65)} -> ${choice.padEnd(10)} ${JSON.stringify(probabilities)}  (confidence ${confidence.toFixed(4)})`);
}
