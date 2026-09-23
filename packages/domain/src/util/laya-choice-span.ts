import { layaChoice } from "@query-classifier/laya-client";
import type { StageContext } from "../context";
import { withSpan } from "./with-span";

// Wraps a single laya `choice` call in its own span, logging the exact
// request/response - shared by every stage that asks laya a SQL-so-far-
// framed question (field selection, kind decision, condition continuation).
export async function layaChoiceSpan(
  ctx: StageContext,
  query: string,
  sql: string,
  instructions: string,
  criteria: Record<string, string>,
) {
  return withSpan(ctx, "laya.choice", async ({ setAttribute }) => {
    setAttribute("query", query);
    setAttribute("sql", sql);
    setAttribute("instructions", instructions);
    setAttribute("criteria", JSON.stringify(criteria));
    const result = await layaChoice({ query, sql }, instructions, criteria);
    setAttribute("result", JSON.stringify(result));
    return result;
  });
}
