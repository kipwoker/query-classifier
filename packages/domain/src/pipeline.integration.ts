// Integration test - hits the REAL laya and ollama services. Not run by
// default (`bun test` only picks up *.test.ts) - this is opt-in only.
// Run explicitly with `bun run test:integration`.
import { test, expect } from "bun:test";
import { classify } from "./pipeline";

test("classifies a real query end-to-end against live services", async () => {
  const { result } = await classify("Find products under $50", "shop");
  expect(result).toEqual({
    entity: "product",
    filters: [{ field: "price", kind: "lt", terms: ["50"], type: "number" }],
    combinators: [],
    pagination: { limit: 10 },
  });
});

test("rejects an out-of-scope query end-to-end", async () => {
  const { result } = await classify("how much milk do I need for pancakes?", "shop");
  expect("inScope" in result && result.inScope === false).toBe(true);
});
