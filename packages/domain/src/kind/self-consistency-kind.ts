import type { StageContext } from "../context";
import { withSpan } from "../util/with-span";
import { majorityVote } from "../util/majority-vote";
import { decideKind } from "./decide-kind";
import type { EntityName, Kind } from "../schema";

const SAMPLE_COUNT = Number(process.env.SAMPLE_COUNT ?? 3);

export interface KindVote {
  kind: Kind;
  agreement: number;
}

// Self-consistency beat single-shot greedy decoding 18/19 vs 17/19 in
// isolated testing - a modest but real win, kept despite the 3x latency
// cost. It also beat every laya framing tried for this decision (63%
// flat, 86% scoped by field type) - this is the one stage where the text
// LLM stays the winner.
export async function decideKindWithConsensus(ctx: StageContext, entity: EntityName, query: string): Promise<KindVote> {
  return withSpan(ctx, "kind.decide", async ({ setAttribute, ctx: childCtx }) => {
    const samples = await Promise.all(Array.from({ length: SAMPLE_COUNT }, () => decideKind(childCtx, entity, query)));
    const vote = majorityVote(samples);
    setAttribute("samples", JSON.stringify(samples));
    setAttribute("kind", vote.value);
    setAttribute("agreement", vote.agreement);
    return { kind: vote.value, agreement: vote.agreement };
  });
}
