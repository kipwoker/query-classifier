import { test, expect } from "bun:test";
import { majorityVote } from "./majority-vote";

test("picks the most common value and reports agreement", () => {
  const result = majorityVote(["eq", "eq", "substring"]);
  expect(result.value).toBe("eq");
  expect(result.agreement).toBeCloseTo(2 / 3);
});

test("handles unanimous agreement", () => {
  const result = majorityVote(["all", "all", "all"]);
  expect(result.value).toBe("all");
  expect(result.agreement).toBe(1);
});

test("throws on empty input", () => {
  expect(() => majorityVote([])).toThrow();
});
