import type { FieldType } from "../schema";

// Regex here is limited to symbols/digits (@, -, dots, numerals), never
// words - so it works the same regardless of the query's language. Emails,
// numeric ids/counts, and ISO dates all have a fixed, unambiguous shape;
// names and free text don't, so those still go through the LLM.
//
// Keyed by FieldType, not by field name - a value's literal shape is a
// property of its type (any email field looks like an email, in any
// domain), not something specific to "artist_email" vs "email". This is
// the domain-agnostic half of what used to be three field-name sets
// (EMAIL_FIELDS/DATE_FIELDS/NUMBER_FIELDS) - moving domain config out
// (see schema.generated.ts) made that redundant: the type is already on
// every field definition, so there was never a need for a second,
// field-name-keyed lookup duplicating it.
const VALUE_SHAPE: Partial<Record<FieldType, RegExp>> = {
  email: /[\w.+-]+@[\w-]+\.[\w.-]+/,
  date: /\b\d{4}-\d{2}-\d{2}\b/,
  number: /\b\d+(?:\.\d+)?\b/,
};

function allMatches(query: string, re: RegExp): string[] {
  return query.match(new RegExp(re.source, "g")) ?? [];
}

// Every occurrence, not just the first - a range ("more than 500 and less
// than 1000") has two numbers for the same field, and resolve-value.ts
// needs all of them to tell the second condition apart from the first
// instead of re-extracting the same one.
export function tryDeterministicTerms(query: string, fieldType: FieldType): string[] {
  const re = VALUE_SHAPE[fieldType];
  return re ? allMatches(query, re) : [];
}

export function tryDeterministicTerm(query: string, fieldType: FieldType): string | null {
  return tryDeterministicTerms(query, fieldType)[0] ?? null;
}
