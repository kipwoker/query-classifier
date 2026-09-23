import { classify, type DomainName } from "@query-classifier/domain";
import { gradeCase } from "./grade";
import type { BenchmarkCase, BenchmarkReport, CaseResult, FieldGrade } from "./types";

export async function runBenchmark(cases: BenchmarkCase[], tracesDir: string, domain: DomainName): Promise<BenchmarkReport> {
  const results: CaseResult[] = [];
  const start = performance.now();

  for (const testCase of cases) {
    const caseStart = performance.now();
    const outcome = await classify(testCase.query, domain);
    const durationMs = performance.now() - caseStart;
    await outcome.trace.writeToDisk(tracesDir);
    results.push(gradeCase(testCase, outcome, durationMs));
  }

  const totalDurationMs = performance.now() - start;
  const passedCases = results.filter((r) => r.pass).length;

  const fieldNames: FieldGrade["field"][] = ["entity", "kind", "filterField", "terms", "limit", "conditionCount"];
  const perFieldAccuracy = Object.fromEntries(
    fieldNames.map((field) => {
      const relevant = results.flatMap((r) => r.grades.filter((g) => g.field === field));
      const passed = relevant.filter((g) => g.pass).length;
      return [field, relevant.length ? passed / relevant.length : 1];
    }),
  ) as Record<FieldGrade["field"], number>;

  return {
    timestamp: new Date().toISOString(),
    totalCases: cases.length,
    passedCases,
    accuracy: passedCases / cases.length,
    perFieldAccuracy,
    totalDurationMs,
    cases: results,
  };
}
