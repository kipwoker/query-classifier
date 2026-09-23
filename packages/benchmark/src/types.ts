import type { ClassifyResult } from "@query-classifier/domain";

export interface BenchmarkCase {
  query: string;
  expected: ClassifyResult;
  /** When true, a field mismatch doesn't fail the case (kind=all queries where field is moot). */
  fieldIsDontCare?: boolean;
}

export interface FieldGrade {
  field: "entity" | "kind" | "filterField" | "terms" | "limit" | "conditionCount";
  expected: unknown;
  actual: unknown;
  pass: boolean;
}

export interface CaseResult {
  query: string;
  pass: boolean;
  grades: FieldGrade[];
  actual: ClassifyResult | { inScope: false; reason: string };
  durationMs: number;
  traceId: string;
  /** True if this case's only failure was isNoFilter inheriting a wrong field-selection - see PROGRESS.md's known compounding pattern. */
  noFilterFieldCompounding: boolean;
}

export interface BenchmarkReport {
  timestamp: string;
  totalCases: number;
  passedCases: number;
  accuracy: number;
  perFieldAccuracy: Record<FieldGrade["field"], number>;
  totalDurationMs: number;
  cases: CaseResult[];
}
