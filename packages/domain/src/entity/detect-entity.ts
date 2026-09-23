import { layaChoice } from "@query-classifier/laya-client";
import type { StageContext } from "../context";
import { withSpan } from "../util/with-span";
import type { EntityName } from "../schema";
import type { EntityDetection } from "./entity-result";

// Winning technique, found by testing: framing entity classification
// against the growing SQL string ("SELECT * FROM ") instead of the bare
// query scored 19/19 isolated (vs. the flat/bare-query version's known
// hard case disambiguating two lexically-similar entities).
//
// Adding the "none" out-of-scope sentinel back onto that reintroduces a
// separate quirk laya has ("Find deactivated users" drops from 0.82 "user"
// to 0.58 "none" the moment "none" is offered, even with SQL framing) - so
// the two-tier reject-floor/forced-reask fallback from the original
// (pre-SQL-framing) domain gate is still needed on top of the SQL framing.
const REJECT_CONFIDENCE_FLOOR = Number(process.env.DOMAIN_REJECT_FLOOR ?? 0.7);
const ACCEPT_CONFIDENCE_FLOOR = Number(process.env.DOMAIN_ACCEPT_FLOOR ?? 0.3);

const NONE = "none";

async function askEntity(ctx: StageContext, name: string, query: string, criteria: Record<string, string>) {
  return withSpan(ctx, name, async ({ setAttribute }) => {
    const sql = "SELECT * FROM ";
    const instructions = "Given the SQL built so far for this query, which entity does the FROM clause name, if any?";
    setAttribute("query", query);
    setAttribute("sql", sql);
    setAttribute("instructions", instructions);
    setAttribute("criteria", JSON.stringify(criteria));
    const answer = await layaChoice({ query, sql }, instructions, criteria);
    setAttribute("result", JSON.stringify(answer));
    return answer;
  });
}

export async function detectEntity(ctx: StageContext, query: string): Promise<EntityDetection> {
  return withSpan(ctx, "entity.detect", async ({ setAttribute, ctx: childCtx }) => {
    setAttribute("query", query);
    const { entityDescriptions, outOfScopeDescription } = childCtx.domain;

    const withNone = await askEntity(childCtx, "laya.choice.withNone", query, {
      ...entityDescriptions,
      [NONE]: outOfScopeDescription,
    });

    if (withNone.choice !== NONE) {
      setAttribute("entity", withNone.choice);
      setAttribute("confidence", withNone.confidence);
      return { inScope: true, entity: withNone.choice as EntityName, confidence: withNone.confidence };
    }

    if (withNone.confidence >= REJECT_CONFIDENCE_FLOOR) {
      setAttribute("outOfScopeReason", "irrelevant");
      setAttribute("confidence", withNone.confidence);
      return { inScope: false, reason: "irrelevant", confidence: withNone.confidence };
    }

    const forced = await askEntity(childCtx, "laya.choice.forced", query, entityDescriptions);
    if (forced.confidence >= ACCEPT_CONFIDENCE_FLOOR) {
      setAttribute("entity", forced.choice);
      setAttribute("confidence", forced.confidence);
      setAttribute("forcedReask", true);
      return { inScope: true, entity: forced.choice as EntityName, confidence: forced.confidence };
    }

    setAttribute("outOfScopeReason", "unclear");
    setAttribute("confidence", forced.confidence);
    return { inScope: false, reason: "unclear", confidence: forced.confidence };
  });
}
