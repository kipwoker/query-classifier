import { layaNoul } from "@query-classifier/laya-client";
import type { StageContext } from "../context";
import { withSpan } from "../util/with-span";
import type { EntityName } from "../schema";

// Winning framing, found by testing: two competing CONTENT statements ("X
// is unspecified" vs "X is a specific value"), not a self-referential
// meta-question ("does this have a filter?" scored 42%) or an
// entropy/gap heuristic (no separation found). Scored 89% isolated (17/19).
//
// KNOWN RISK, not yet resolved: this stage's accuracy is bounded by the
// preceding field-selection stage's accuracy. If selectField picks the
// wrong field, this gate can "correctly" (from its own narrow view) call
// that wrong field unspecified - a silently-wrong `all` instead of a
// visible field error. The benchmark harness (phase 5) should surface this
// correlation explicitly, not let it blend into the aggregate score.
export async function isNoFilter(ctx: StageContext, entity: EntityName, field: string, query: string): Promise<boolean> {
  return withSpan(ctx, "noFilter.check", async ({ setAttribute, ctx: childCtx }) => {
    const askNoul = (name: string, instructions: string) =>
      withSpan(childCtx, name, async ({ setAttribute: setCallAttribute }) => {
        setCallAttribute("query", query);
        setCallAttribute("instructions", instructions);
        const noul = await layaNoul({ query }, instructions);
        setCallAttribute("result", JSON.stringify({ noul }));
        return noul;
      });

    const unspecified = await askNoul(
      "laya.noul.unspecified",
      `Does this statement match the query: '${entity}s where ${field} is unspecified - no particular value is being searched for'?`,
    );
    const specific = await askNoul(
      "laya.noul.specific",
      `Does this statement match the query: '${entity}s where ${field} is a specific value the user provided'?`,
    );
    const result = unspecified > specific;
    setAttribute("field", field);
    setAttribute("unspecifiedScore", unspecified);
    setAttribute("specificScore", specific);
    setAttribute("noFilter", result);
    return result;
  });
}
