import type { StageContext } from "../context";
import { withSpan } from "../util/with-span";
import { layaChoiceSpan } from "../util/laya-choice-span";
import { tryDeterministicTerms } from "./deterministic-term";
import { narrateValue } from "./narrate-value";
import { reattachLeadingSymbol } from "./reattach-leading-symbol";
import { COMPARISON_OPERATOR } from "../kind/decide-kind-laya";
import type { EntityName, FieldType, Kind } from "../schema";

// Boolean-flag fields have no literal value in the text to extract ("Find
// deactivated users" doesn't contain the word "true") - fixed convention,
// true for any boolean field in any domain, not just "deactivated", so
// this is keyed by type rather than a per-domain field-name set.
export async function resolveValue(
  ctx: StageContext,
  entity: EntityName,
  field: string,
  fieldType: FieldType,
  kind: Kind,
  query: string,
  sqlPrefix: string,
  excludeValues: ReadonlySet<string> = new Set(),
): Promise<string[]> {
  return withSpan(ctx, "value.resolve", async ({ setAttribute, ctx: childCtx }) => {
    if (fieldType === "boolean") {
      setAttribute("source", "boolean-flag");
      return ["true"];
    }

    const candidates = tryDeterministicTerms(query, fieldType);
    if (candidates.length > 0) {
      // A range repeats the same field with two different literal values
      // ("more than 500 and less than 1000") - excludeValues holds
      // whatever an earlier condition on this same field already used, so
      // this doesn't just re-grab the first occurrence again.
      const remaining = candidates.filter((c) => !excludeValues.has(c));
      // If every candidate is already used, there's nothing left to
      // disambiguate with - fall back to the first rather than fail.
      const pool = remaining.length > 0 ? remaining : candidates;

      if (pool.length === 1) {
        setAttribute("source", "regex");
        setAttribute("value", pool[0]!);
        return [pool[0]!];
      }

      // More than one real candidate remains (e.g. both range bounds are
      // still in play) - score which one actually continues THIS specific
      // comparison instead of guessing positionally.
      const operator = COMPARISON_OPERATOR[kind] ?? "=";
      const sql = `${sqlPrefix}${field} ${operator} `;
      const criteria: Record<string, string> = {};
      for (const candidate of pool) criteria[candidate] = `the value ${candidate}`;
      const instructions = "Given the SQL built so far for this query, which value continues this comparison?";
      const answer = await layaChoiceSpan(childCtx, query, sql, instructions, criteria);
      setAttribute("source", "regex-scored");
      setAttribute("value", answer.choice);
      return [answer.choice];
    }

    // Free text (name-type fields) is the one piece laya's `choice`
    // couldn't do reliably in any framing tested (0/13 and 0/7 span-
    // selection attempts across two prior framings) - a single narrow LLM
    // call covers just this gap.
    const value = await narrateValue(childCtx, entity, field, kind, query);
    setAttribute("source", "llm");
    if (!value) {
      setAttribute("value", "");
      return [];
    }
    const reattached = reattachLeadingSymbol(query, value);
    setAttribute("value", reattached);
    return [reattached];
  });
}
