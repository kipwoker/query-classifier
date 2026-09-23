import { test, expect, mock } from "bun:test";
import { Trace } from "@query-classifier/telemetry";
import { DOMAINS } from "../schema";

test("returns the chosen field and its schema type", async () => {
  mock.module("@query-classifier/laya-client", () => ({
    layaChoice: mock(async () => ({ choice: "price", confidence: 0.83, probabilities: {} })),
    layaNoul: mock(async () => 0),
  }));
  const { selectField } = await import("./select-field");

  const ctx = { trace: new Trace(), domain: DOMAINS.shop };
  const result = await selectField(ctx, "product", "Find products under $50");

  expect(result.field).toBe("price");
  expect(result.type).toBe("number");
  expect(result.confidence).toBe(0.83);
});

test("throws if laya returns a field not in the entity's schema", async () => {
  mock.module("@query-classifier/laya-client", () => ({
    layaChoice: mock(async () => ({ choice: "notARealField", confidence: 0.5, probabilities: {} })),
    layaNoul: mock(async () => 0),
  }));
  const { selectField } = await import("./select-field");

  const ctx = { trace: new Trace(), domain: DOMAINS.shop };
  await expect(selectField(ctx, "product", "some query")).rejects.toThrow();
});
