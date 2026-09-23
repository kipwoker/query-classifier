import { callOllama } from "@query-classifier/llm-client";
import type { StageContext } from "../context";
import { withSpan } from "../util/with-span";
import type { EntityName, Kind } from "../schema";

const VALUE_SCHEMA = {
  type: "object" as const,
  properties: { value: { type: ["string", "null"] } },
  required: ["value"],
};

// What to call the value for each kind, in a sentence a human would say.
const KIND_NOUN: Partial<Record<Kind, string>> = {
  eq: "the exact value",
  prefix: "the prefix",
  suffix: "the suffix",
  substring: "the substring",
  gt: "the threshold value - the query wants results greater than this",
  lt: "the threshold value - the query wants results less than this",
};

// All the context that was already derived (entity, field, kind) gets
// narrated as one plain sentence before asking the single remaining
// question, rather than handing the model bare kind=X field=Y tokens.
// Scored 6/6 on cases with a real value in isolation - fixed a case
// the terser framing got wrong. One residual quirk: when there's genuinely
// no value (a no-filter query slipping through), narrating "filtered by X"
// primes the model to invent something rather than say null - this is why
// the no-filter check runs BEFORE this, not as a fallback after it.
function buildPrompt(entity: EntityName, field: string, kind: Kind | undefined): string {
  const noun = (kind && KIND_NOUN[kind]) ?? "the value";
  // kind is undefined when the caller needs the literal text before kind
  // itself is decided (see kind/decide-kind-laya.ts's LIKE-placement
  // stage) - drop the comparison clause entirely rather than narrate a
  // kind that isn't known yet.
  const comparisonClause = kind ? ` using a "${kind}" comparison` : "";
  return `The user's request below is a search for "${entity}" records. It has already been determined that this search is filtered by the "${field}" field${comparisonClause}. Your only job is to find ${noun} in the user's request, copied verbatim as a plain value - never output SQL syntax, a query, or anything besides the bare value itself. If there is truly no such value in the request, the value is null - do not invent one.`;
}

export async function narrateValue(
  ctx: StageContext,
  entity: EntityName,
  field: string,
  kind: Kind | undefined,
  query: string,
): Promise<string | null> {
  return withSpan(ctx, "llm.narrateValue", async ({ setAttribute }) => {
    const messages = [
      { role: "system" as const, content: buildPrompt(entity, field, kind) },
      { role: "user" as const, content: query },
    ];
    setAttribute("messages", JSON.stringify(messages));
    const result = await callOllama<{ value: string | null }>(messages, VALUE_SCHEMA, 0);
    setAttribute("result", JSON.stringify(result));
    return result.value === "null" ? null : result.value;
  });
}
