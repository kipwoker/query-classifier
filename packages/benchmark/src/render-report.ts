import type { BenchmarkReport, CaseResult } from "./types";

function pct(n: number): string {
  return (n * 100).toFixed(0);
}

function diffSummary(current: BenchmarkReport, previous: BenchmarkReport | null): string {
  if (!previous) return "no previous report to compare against";
  const delta = current.passedCases - previous.passedCases;
  if (delta === 0) return `unchanged (${current.passedCases}/${current.totalCases})`;
  const sign = delta > 0 ? "+" : "";
  return `${sign}${delta} cases (${previous.passedCases}/${previous.totalCases} -> ${current.passedCases}/${current.totalCases})`;
}

function perFieldTable(report: BenchmarkReport): string {
  return Object.entries(report.perFieldAccuracy)
    .map(([field, accuracy]) => `| ${field} | ${pct(accuracy)}% |`)
    .join("\n");
}

function caseRow(c: CaseResult): string {
  const byField = new Map(c.grades.map((g) => [g.field, g]));
  const cell = (field: string) => {
    const g = byField.get(field as CaseResult["grades"][number]["field"]);
    if (!g) return "-";
    return g.pass ? String(g.actual) : `**${String(g.actual)}** (exp ${String(g.expected)})`;
  };
  return `| ${c.query} | ${c.pass ? "OK" : "FAIL"} | ${cell("entity")} | ${cell("kind")} | ${cell("filterField")} | ${cell("terms")} | ${cell("conditionCount")} | ${cell("limit")} | ${c.durationMs.toFixed(0)}ms | ${c.traceId} |`;
}

function compoundingNotes(report: BenchmarkReport): string {
  const compounding = report.cases.filter((c) => c.noFilterFieldCompounding);
  if (compounding.length === 0) return "None this run.";
  return compounding.map((c) => `- "${c.query}" - field selection was wrong, and the no-filter gate inherited that mistake (produced kind=all instead of surfacing the field error).`).join("\n");
}

export function renderReport(template: string, report: BenchmarkReport, previous: BenchmarkReport | null): string {
  return template
    .replaceAll("{{timestamp}}", report.timestamp)
    .replaceAll("{{passedCases}}", String(report.passedCases))
    .replaceAll("{{totalCases}}", String(report.totalCases))
    .replaceAll("{{accuracyPct}}", pct(report.accuracy))
    .replaceAll("{{totalDurationMs}}", report.totalDurationMs.toFixed(0))
    .replaceAll("{{avgDurationMs}}", (report.totalDurationMs / report.totalCases).toFixed(0))
    .replaceAll("{{previousTimestamp}}", previous?.timestamp ?? "none")
    .replaceAll("{{diffSummary}}", diffSummary(report, previous))
    .replaceAll("{{perFieldTable}}", perFieldTable(report))
    .replaceAll("{{casesTable}}", report.cases.map(caseRow).join("\n"))
    .replaceAll("{{compoundingNotes}}", compoundingNotes(report));
}
