import { test, expect } from "bun:test";
import { extractLimitSync } from "./extract-limit";

test.each([
  ["get the top 5 items last modified", 5],
  ["show the first 3 tracks", 3],
  ["the newest 10 tracks", 10],
  ["show all tracks", null],
  ["find bob@work.io", null],
])("extractLimitSync(%p) -> %p", (query, expected) => {
  expect(extractLimitSync(query)).toBe(expected);
});
