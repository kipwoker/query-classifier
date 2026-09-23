import { callOllama } from "@query-classifier/llm-client";
import type { StageContext } from "../context";
import { withSpan } from "../util/with-span";
import type { EntityName, Kind } from "../schema";

const OPERATOR_TO_KIND: Record<string, Kind> = { "=": "eq", ">": "gt", "<": "lt" };

const VALUE_SHAPE: Record<"number" | "date", RegExp> = {
  number: /^\d+(?:\.\d+)?$/,
  date: /^\d{4}-\d{2}-\d{2}$/,
};

const CONDITIONS_SCHEMA = {
  type: "object" as const,
  properties: {
    conditions: {
      type: "array",
      items: {
        type: "object",
        properties: {
          operator: { type: "string", enum: ["=", ">", "<"] },
          value: { type: "string" },
        },
        required: ["operator", "value"],
      },
    },
  },
  required: ["conditions"],
};

// Laya can't do this: telling "one value mentioned" apart from "two values
// mentioned for the same field" (a range) needs enumerating/counting
// values across the query, which a single non-autoregressive forward pass
// has no mechanism for (see decide-continuation-laya.ts's doc comment for
// the full list of laya framings tried and rejected - every one failed on
// this exact sub-problem). A generative model can just emit a list, one
// token at a time - actually performing the count instead of guessing at it.
export async function extractFieldConditions(
  ctx: StageContext,
  entity: EntityName,
  field: string,
  fieldType: "number" | "date",
  query: string,
): Promise<{ kind: Kind; value: string }[]> {
  return withSpan(ctx, "llm.extractFieldConditions", async ({ setAttribute }) => {
    const system = `The user's request below is a search for "${entity}" records. It has already been determined that this search is filtered on the "${field}" field. Extract every condition on "${field}" as a list of {operator, value} pairs, using literal SQL comparison operators (=, >, <). If the request gives both a lower and upper bound, output two entries. Only include conditions on "${field}" - ignore any other numbers in the request that belong to a different field.`;
    const messages = [
      { role: "system" as const, content: system },
      { role: "user" as const, content: query },
    ];
    setAttribute("messages", JSON.stringify(messages));
    const result = await callOllama<{ conditions: { operator: string; value: string }[] }>(messages, CONDITIONS_SCHEMA, 0);
    setAttribute("result", JSON.stringify(result));

    const shape = VALUE_SHAPE[fieldType];
    const valid = result.conditions.filter((c) => c.operator in OPERATOR_TO_KIND && shape.test(c.value));
    if (valid.length !== result.conditions.length) {
      // At least one entry wasn't a clean literal - the model's response
      // is not trustworthy as a whole (see the doc comment above), not
      // just that one entry.
      setAttribute("rejected", true);
      return [];
    }
    return valid.map((c) => ({ kind: OPERATOR_TO_KIND[c.operator]!, value: c.value }));
  });
}
