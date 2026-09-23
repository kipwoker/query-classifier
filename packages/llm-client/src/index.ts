// Mutable, not a frozen module-level const - the API's settings panel
// changes these at runtime (apps/api/src/settings.ts), so every call site
// must read the current value through the getters below rather than
// closing over a value captured once at module load.
let ollamaUrl = process.env.OLLAMA_URL ?? "http://localhost:11434";
// Deliberately the weak/fast model by default - see packages/domain for
// why (self-consistency + laya verification cover for its mistakes
// instead of reaching for a bigger model). NOT the -mlx build: it ignores
// JSON-schema enum constraints.
let ollamaModel = process.env.OLLAMA_MODEL ?? "qwen3.5:0.8b";

export function setOllamaUrl(url: string): void {
  ollamaUrl = url;
}

export function setOllamaModel(model: string): void {
  ollamaModel = model;
}

export function getOllamaConfig(): { url: string; model: string } {
  return { url: ollamaUrl, model: ollamaModel };
}

export interface ChatMessage {
  role: "system" | "user";
  content: string;
}

export interface JsonSchema {
  type: "object";
  properties: Record<string, unknown>;
  required: string[];
}

export async function callOllama<T>(
  messages: ChatMessage[],
  schema: JsonSchema,
  temperature: number,
): Promise<T> {
  const res = await fetch(`${ollamaUrl}/api/chat`, {
    method: "POST",
    body: JSON.stringify({
      model: ollamaModel,
      stream: false,
      think: false,
      format: schema,
      options: { temperature },
      messages,
    }),
  });
  if (!res.ok) {
    throw new Error(`ollama request failed: ${res.status} ${await res.text()}`);
  }
  const body = (await res.json()) as { message: { content: string } };
  return JSON.parse(body.message.content) as T;
}
