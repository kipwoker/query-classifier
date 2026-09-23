import type { ClassifyOutcome } from "@query-classifier/domain";
import type { BenchmarkCase, CaseResult, FieldGrade } from "./types";

function arraysEqual(a: string[], b: string[]): boolean {
  return a.length === b.length && a.every((v, i) => v === b[i]);
}

// Grading is per-field, not just "did the whole thing match" - this is
// what lets the report call out exactly which stage regressed, instead of
// one opaque pass/fail count.
export function gradeCase(testCase: BenchmarkCase, outcome: ClassifyOutcome, durationMs: number): CaseResult {
  const { result } = outcome;

  if (!("entity" in result)) {
    // Out-of-scope result for a query we expected to classify - always a fail.
    return {
      query: testCase.query,
      pass: false,
      grades: [{ field: "entity", expected: testCase.expected.entity, actual: `out-of-scope:${result.reason}`, pass: false }],
      actual: result,
      durationMs,
      traceId: outcome.trace.traceId,
      noFilterFieldCompounding: false,
    };
  }

  // Every current fixture expects exactly one condition - graded field-by-
  // field on filters[0] for a precise per-stage breakdown, plus a
  // conditionCount check so an unexpected extra/missing condition (the new
  // multi-condition chain in pipeline.ts) still fails loudly instead of
  // silently comparing against a condition that isn't there.
  const expectedFirst = testCase.expected.filters[0]!;
  const actualFirst = result.filters[0];

  const grades: FieldGrade[] = [
    { field: "entity", expected: testCase.expected.entity, actual: result.entity, pass: result.entity === testCase.expected.entity },
    { field: "kind", expected: expectedFirst.kind, actual: actualFirst?.kind, pass: actualFirst?.kind === expectedFirst.kind },
    {
      field: "filterField",
      expected: expectedFirst.field,
      actual: actualFirst?.field,
      pass: testCase.fieldIsDontCare || actualFirst?.field === expectedFirst.field,
    },
    {
      field: "terms",
      expected: expectedFirst.terms,
      actual: actualFirst?.terms ?? [],
      pass: arraysEqual(actualFirst?.terms ?? [], expectedFirst.terms),
    },
    {
      field: "conditionCount",
      expected: testCase.expected.filters.length,
      actual: result.filters.length,
      pass: result.filters.length === testCase.expected.filters.length,
    },
    {
      field: "limit",
      expected: testCase.expected.pagination.limit,
      actual: result.pagination.limit,
      pass: result.pagination.limit === testCase.expected.pagination.limit,
    },
  ];

  const pass = grades.every((g) => g.pass);

  // Known compounding pattern: field was wrong AND kind ended up "all"
  // when it shouldn't have - the signature of isNoFilter inheriting
  // selectField's mistake.
  const fieldGrade = grades.find((g) => g.field === "filterField");
  const kindGrade = grades.find((g) => g.field === "kind");
  const noFilterFieldCompounding =
    !pass && !fieldGrade?.pass && actualFirst?.kind === "all" && expectedFirst.kind !== "all" && !!kindGrade;

  return { query: testCase.query, pass, grades, actual: result, durationMs, traceId: outcome.trace.traceId, noFilterFieldCompounding };
}
