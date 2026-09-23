import { test, expect, mock } from "bun:test";
import { Trace } from "@query-classifier/telemetry";
import { DOMAINS } from "../schema";

function mockLaya(responses: Array<{ choice: string; confidence: number; probabilities?: Record<string, number> }>) {
  let call = 0;
  mock.module("@query-classifier/laya-client", () => ({
    layaChoice: mock(async () => {
      const r = responses[call] ?? responses[responses.length - 1]!;
      call += 1;
      return { probabilities: {}, ...r };
    }),
    layaNoul: mock(async () => 0),
  }));
}

test("returns the entity when laya confidently picks a real entity", async () => {
  mockLaya([{ choice: "product", confidence: 0.9 }]);
  const { detectEntity } = await import("./detect-entity");

  const ctx = { trace: new Trace(), domain: DOMAINS.shop };
  const result = await detectEntity(ctx, "Find products under $50");

  expect(result.inScope).toBe(true);
  if (result.inScope) {
    expect(result.entity).toBe("product");
    expect(result.confidence).toBe(0.9);
  }
});

test("rejects as irrelevant when 'none' wins with high confidence", async () => {
  mockLaya([{ choice: "none", confidence: 0.85 }]);
  const { detectEntity } = await import("./detect-entity");

  const ctx = { trace: new Trace(), domain: DOMAINS.shop };
  const result = await detectEntity(ctx, "how much milk do I need for pancakes?");

  expect(result.inScope).toBe(false);
  if (!result.inScope) expect(result.reason).toBe("irrelevant");
});

test("falls back to a forced re-ask when 'none' wins with low confidence, and accepts a confident forced pick", async () => {
  mockLaya([
    { choice: "none", confidence: 0.35 }, // first call, with "none" offered
    { choice: "customer", confidence: 0.55 }, // second call, forced among real entities
  ]);
  const { detectEntity } = await import("./detect-entity");

  const ctx = { trace: new Trace(), domain: DOMAINS.shop };
  const result = await detectEntity(ctx, "Find customer named Alice Smith");

  expect(result.inScope).toBe(true);
  if (result.inScope) expect(result.entity).toBe("customer");
});

test("rejects as unclear when both the 'none' pick and the forced re-ask are low confidence", async () => {
  mockLaya([
    { choice: "none", confidence: 0.2 },
    { choice: "order", confidence: 0.05 },
  ]);
  const { detectEntity } = await import("./detect-entity");

  const ctx = { trace: new Trace(), domain: DOMAINS.shop };
  const result = await detectEntity(ctx, "tell me a joke");

  expect(result.inScope).toBe(false);
  if (!result.inScope) expect(result.reason).toBe("unclear");
});
