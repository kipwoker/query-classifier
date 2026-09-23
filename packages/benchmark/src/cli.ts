import { DOMAINS, DEFAULT_DOMAIN, type DomainName } from "@query-classifier/domain";
import { runBenchmark } from "./run";
import { renderReport } from "./render-report";
import { findPreviousReport } from "./find-previous-report";
import type { BenchmarkCase } from "./types";

const DOMAINS_DIR = new URL("../../../domains/", import.meta.url);
const TEMPLATE_PATH = new URL("../../../benchmarks/report-template/report.template.md", import.meta.url);
const REPORTS_DIR = new URL("../../../benchmarks/reports", import.meta.url).pathname.replace(/\/$/, "");

async function main() {
  const domainArg = process.argv[2] ?? DEFAULT_DOMAIN;
  if (!(domainArg in DOMAINS)) {
    throw new Error(`unknown domain "${domainArg}" - configured domains: ${Object.keys(DOMAINS).join(", ")}`);
  }
  const domain = domainArg as DomainName;

  const examplesPath = new URL(`${domain}.examples.json`, DOMAINS_DIR);
  const rawExamples = (await Bun.file(examplesPath).json()) as { query: string; schema: BenchmarkCase["expected"]; fieldIsDontCare?: boolean }[];
  const cases: BenchmarkCase[] = rawExamples.map((e) => ({ query: e.query, expected: e.schema, fieldIsDontCare: e.fieldIsDontCare }));
  const template = await Bun.file(TEMPLATE_PATH).text();

  const runId = new Date().toISOString().replace(/[:.]/g, "-");
  const runDir = `${REPORTS_DIR}/${runId}`;
  const tracesDir = `${runDir}/traces`;

  console.log(`Running benchmark against domain "${domain}": ${cases.length} cases...`);
  const report = await runBenchmark(cases, tracesDir, domain);

  const previous = await findPreviousReport(REPORTS_DIR, runId);
  const markdown = renderReport(template, report, previous);

  await Bun.write(`${runDir}/report.md`, markdown);
  await Bun.write(`${runDir}/report.json`, JSON.stringify(report, null, 2));

  console.log(`\n${report.passedCases}/${report.totalCases} passed (${(report.accuracy * 100).toFixed(0)}%)`);
  console.log(`Report written to ${runDir}/report.md`);

  if (report.accuracy < 1) {
    process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
