import type { StageContext } from "../context";
import { withSpan } from "../util/with-span";

const LIMIT_RE = /\b(?:top|first|newest)\s+(\d+)\b/i;

export function extractLimitSync(query: string): number | null {
  const match = query.match(LIMIT_RE);
  return match?.[1] ? Number(match[1]) : null;
}

export async function extractLimit(ctx: StageContext, query: string): Promise<number | null> {
  return withSpan(ctx, "limit.extract", async ({ setAttribute }) => {
    const limit = extractLimitSync(query);
    setAttribute("limit", limit ?? "null");
    return limit;
  });
}
