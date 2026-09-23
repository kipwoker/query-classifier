import type { StageContext } from "../context";
import { withSpan } from "../util/with-span";
import { layaChoiceSpan } from "../util/laya-choice-span";
import type { Combinator } from "../schema";

export interface ContinuationDecision {
  action: Combinator | "end";
}

// Known broken (docs/laya-guidelines.md rule 1): this is a self-referential
// meta-question, the one shape laya is consistently bad at regardless of
// wording. Its score climbs almost monotonically with SQL length, nearly
// independent of whether the query is actually covered - confirmed with a
// bare field name (no operator, no value) scoring "complete" at 0.85.
//
// Several laya-only replacements were tried and rejected against the full
// benchmark (an upfront clause count, a field-grounded "does X need more"
// question, a 3-way lower/upper/both choice, a merged next-field-or-done
// choice) - every one failed on the same sub-problem: telling "one value
// mentioned" apart from "two values mentioned for the same field" needs a
// counting/enumeration judgment a single forward pass can't do.
//
// That sub-problem (the same-field range case) is now solved a different
// way: kind/extract-field-conditions.ts asks the local generative LLM
// (ollama) for every condition on a field in one shot, as soon as the
// field is selected - a generative model can actually enumerate values
// instead of guessing at a count. So this function's only remaining job
// is the other sub-problem it was never good or bad at specifically:
// whether the request mentions a genuinely different field afterward.
// Kept as-is for that (still imperfect, still worth revisiting).
async function isFilterComplete(ctx: StageContext, sqlSoFar: string, query: string): Promise<boolean> {
  return withSpan(ctx, "kind.decideContinuation.complete", async ({ setAttribute, ctx: childCtx }) => {
    const sql = `${sqlSoFar} `;
    const instructions =
      "Given the SQL built so far for the query, does this WHERE clause fully cover query, or more conditions should be added?";
    const criteria = {
      complete: "the WHERE clause fully covers the query request",
      incomplete: "the query has more conditions to cover by the WHERE clause",
    };
    const answer = await layaChoiceSpan(childCtx, query, sql, instructions, criteria);
    const complete = answer.choice === "complete";
    setAttribute("complete", complete);
    setAttribute("confidence", answer.confidence);
    return complete;
  });
}

// Does the next condition need to ALSO match, or would matching EITHER be
// enough?
async function chooseCombinator(ctx: StageContext, sqlSoFar: string, query: string): Promise<Combinator> {
  return withSpan(ctx, "kind.decideContinuation.combinator", async ({ setAttribute, ctx: childCtx }) => {
    const sql = `${sqlSoFar} `;
    const instructions = "Given the SQL built so far for this query, does the next condition need to ALSO match, or would matching EITHER be enough?";
    const criteria = {
      AND: "there is another condition that must ALSO match at the same time",
      OR: "there is another condition where matching EITHER one is enough",
    };
    const answer = await layaChoiceSpan(childCtx, query, sql, instructions, criteria);
    setAttribute("combinator", answer.choice);
    setAttribute("confidence", answer.confidence);
    return answer.choice === "AND" ? "and" : "or";
  });
}

export async function decideContinuation(ctx: StageContext, sqlSoFar: string, query: string): Promise<ContinuationDecision> {
  return withSpan(ctx, "kind.decideContinuation", async ({ setAttribute, ctx: childCtx }) => {
    const complete = await isFilterComplete(childCtx, sqlSoFar, query);
    setAttribute("complete", complete);
    if (complete) {
      return { action: "end" };
    }

    const combinator = await chooseCombinator(childCtx, sqlSoFar, query);
    setAttribute("combinator", combinator);
    return { action: combinator };
  });
}
