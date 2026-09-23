import { callOllama } from "@query-classifier/llm-client";
import type { StageContext } from "../context";
import { withSpan } from "../util/with-span";
import { formatFacts } from "../util/format-facts";
import { KIND_SCHEMA, KIND_SYSTEM_PROMPT } from "./kind-prompt";
import type { EntityName, Kind } from "../schema";

export async function decideKind(ctx: StageContext, entity: EntityName, query: string, temperature = 0.7): Promise<Kind> {
  return withSpan(ctx, "llm.decideKind", async ({ setAttribute }) => {
    const userMessage = `${formatFacts({ entity })}\n\nQuery: ${JSON.stringify(query)}\n\nDecide the kind.`;
    const messages = [
      { role: "system" as const, content: KIND_SYSTEM_PROMPT },
      { role: "user" as const, content: userMessage },
    ];
    setAttribute("temperature", temperature);
    setAttribute("messages", JSON.stringify(messages));
    const result = await callOllama<{ kind: Kind }>(messages, KIND_SCHEMA, temperature);
    setAttribute("result", JSON.stringify(result));
    return result.kind;
  });
}

export async function reviseKind(
  entity: EntityName,
  query: string,
  previousKind: Kind,
  issue: string,
  temperature = 0.3,
): Promise<Kind> {
  const userMessage = `${formatFacts({ entity })}\n\nQuery: ${JSON.stringify(query)}
Your previous answer: {"kind":"${previousKind}"}
A verifier found a problem: ${issue}
Re-examine the query and correct the kind if needed.`;
  const result = await callOllama<{ kind: Kind }>(
    [
      { role: "system", content: KIND_SYSTEM_PROMPT },
      { role: "user", content: userMessage },
    ],
    KIND_SCHEMA,
    temperature,
  );
  return result.kind;
}
