import type { LayaChoiceAnswer, LayaNoulAnswer, LayaState } from "./types";

// Mutable, not a frozen module-level const - the API's settings panel
// changes this at runtime (apps/api/src/settings.ts), so every call site
// reads the current value through getLayaUrl() rather than closing over a
// value captured once at module load.
let layaUrl = process.env.LAYA_URL ?? "http://localhost:8000";

export function setLayaUrl(url: string): void {
  layaUrl = url;
}

export function getLayaUrl(): string {
  return layaUrl;
}

async function predict(state: LayaState, questions: Record<string, unknown>) {
  // laya's own laya-serve (laya/serve.py, run via docker/serve.Dockerfile in
  // ../laya) exposes this at /v1/systemone - a custom wrapper service this
  // project used earlier exposed the same call at /predict instead. Body/
  // response shape is unchanged either way: both just call
  // Router.predict(state, questions) and return its system_one payload.
  const res = await fetch(`${layaUrl}/v1/systemone`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ state, questions }),
  });
  if (!res.ok) {
    throw new Error(`laya request failed: ${res.status} ${await res.text()}`);
  }
  return res.json() as Promise<{ answers: Record<string, unknown> }>;
}

export async function layaChoice(
  state: LayaState,
  instructions: string,
  criteria: Record<string, string>,
): Promise<LayaChoiceAnswer> {
  const body = await predict(state, {
    answer: { type: "choice", instructions, criteria },
  });
  return body.answers.answer as LayaChoiceAnswer;
}

export async function layaNoul(state: LayaState, instructions: string): Promise<number> {
  const body = await predict(state, {
    answer: { type: "noul", instructions },
  });
  return (body.answers.answer as LayaNoulAnswer).noul;
}

export type { LayaChoiceAnswer, LayaNoulAnswer, LayaState } from "./types";
