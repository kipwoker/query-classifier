import { test, expect } from "bun:test";
import { reattachLeadingSymbol } from "./reattach-leading-symbol";

test("reattaches a leading hyphen dropped by extraction", () => {
  expect(reattachLeadingSymbol("List playlists ending with -metal", "metal")).toBe("-admins");
});

test("leaves a term with no preceding symbol unchanged", () => {
  expect(reattachLeadingSymbol("Get tracks containing road", "road")).toBe("road");
});

test("leaves a term not found in the query unchanged", () => {
  expect(reattachLeadingSymbol("some query", "unrelated")).toBe("unrelated");
});
