import { test, expect } from "bun:test";
import { tryDeterministicTerm } from "./deterministic-term";

test("extracts an email for email-shaped fields", () => {
  expect(tryDeterministicTerm("items owned by jane@acme.com", "email")).toBe("jane@acme.com");
});

test("extracts an ISO date for date fields", () => {
  expect(tryDeterministicTerm("items updated before 2026-01-01", "date")).toBe("2026-01-01");
});

test("extracts a number for count/id fields", () => {
  expect(tryDeterministicTerm("tracks in playlist 12345", "number")).toBe("12345");
});

test("returns null for free-text fields (falls through to the LLM)", () => {
  expect(tryDeterministicTerm("tracks starting with abc", "string")).toBeNull();
});

test("returns null when the field expects an email but none is present", () => {
  expect(tryDeterministicTerm("users with email ending in acme.com", "email")).toBeNull();
});
