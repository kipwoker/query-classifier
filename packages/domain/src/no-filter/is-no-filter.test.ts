import { test, expect, mock } from "bun:test";
import { Trace } from "@query-classifier/telemetry";
import { DOMAINS } from "../schema";

function mockLayaNoul(scores: number[]) {
  let call = 0;
  mock.module("@query-classifier/laya-client", () => ({
    layaChoice: mock(async () => ({ choice: "", confidence: 0, probabilities: {} })),
    layaNoul: mock(async () => {
      const score = scores[call] ?? scores[scores.length - 1]!;
      call += 1;
      return score;
    }),
  }));
}

test("reports no-filter when the 'unspecified' statement scores higher", async () => {
  mockLayaNoul([0.7, 0.2]); // unspecified, then specific
  const { isNoFilter } = await import("./is-no-filter");

  const ctx = { trace: new Trace(), domain: DOMAINS.shop };
  const result = await isNoFilter(ctx, "product", "name", "Show me all products");

  expect(result).toBe(true);
});

test("reports a real filter when the 'specific value' statement scores higher", async () => {
  mockLayaNoul([0.2, 0.8]); // unspecified, then specific
  const { isNoFilter } = await import("./is-no-filter");

  const ctx = { trace: new Trace(), domain: DOMAINS.shop };
  const result = await isNoFilter(ctx, "product", "price", "Find products under $50");

  expect(result).toBe(false);
});
