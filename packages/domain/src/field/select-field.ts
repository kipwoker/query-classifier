import { layaChoice } from "@query-classifier/laya-client";
import type { StageContext } from "../context";
import { withSpan } from "../util/with-span";
import type { EntityName, FieldType } from "../schema";

export interface FieldSelection {
  field: string;
  type: FieldType;
  confidence: number;
}

// Field choices are scoped to just this entity's own schema - a handful of
// options instead of a flat enum across all entities. This is THE finding
// of the whole project: 89% isolated accuracy here vs. 53% for the flat
// cross-entity version tested earlier. Whether there's a filter AT ALL is
// handled separately (no-filter module) -
// folding a "no filter" sentinel into this same choice was tried and made
// field accuracy worse (it absorbed real fields incorrectly).
export async function selectField(
  ctx: StageContext,
  entity: EntityName,
  query: string,
  excludeFields: ReadonlySet<string> = new Set(),
  sqlPrefix: string = `SELECT * FROM ${entity} WHERE `,
): Promise<FieldSelection> {
  return withSpan(ctx, "field.select", async ({ setAttribute, ctx: childCtx }) => {
    const fields = childCtx.domain.schema[entity]!;
    const criteria: Record<string, string> = {};
    for (const [name, def] of Object.entries(fields)) {
      // Already used by an earlier condition in this query (pipeline.ts's
      // multi-condition loop) - field is now always the literal criterion
      // name, no output-field collapsing to account for.
      if (excludeFields.has(name)) continue;
      criteria[name] = def.description;
    }

    // laya's `choice` needs a real choice - a single-option criteria set
    // 500s (confirmed live: excluding one field from a 2-field entity
    // leaves exactly one candidate for a later condition in
    // pipeline.ts's multi-condition loop). Not a guess when there's only
    // one field left anyway.
    const remaining = Object.entries(criteria);
    if (remaining.length === 1) {
      const [field] = remaining[0]!;
      const fieldDef = fields[field]!;
      setAttribute("entity", entity);
      setAttribute("field", field);
      setAttribute("confidence", 1);
      setAttribute("source", "only-remaining-field");
      return { field, type: fieldDef.type, confidence: 1 };
    }

    const instructions = "Given the SQL built so far for this query, which field is this query filtering or asking about?";
    const answer = await withSpan(childCtx, "laya.choice", async ({ setAttribute: setCallAttribute }) => {
      setCallAttribute("query", query);
      setCallAttribute("sql", sqlPrefix);
      setCallAttribute("instructions", instructions);
      setCallAttribute("criteria", JSON.stringify(criteria));
      const result = await layaChoice({ query, sql: sqlPrefix }, instructions, criteria);
      setCallAttribute("result", JSON.stringify(result));
      return result;
    });

    const fieldDef = fields[answer.choice];
    if (!fieldDef) {
      throw new Error(`laya chose an unknown field "${answer.choice}" for entity "${entity}"`);
    }

    setAttribute("entity", entity);
    setAttribute("field", answer.choice);
    setAttribute("confidence", answer.confidence);

    return { field: answer.choice, type: fieldDef.type, confidence: answer.confidence };
  });
}
