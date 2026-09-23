import { readdir } from "node:fs/promises";
import type { BenchmarkReport } from "./types";

// Reports live one dated folder per run under benchmarks/reports/ (gitignored).
// Finds the most recent COMPLETE one
// (has a report.json) to diff against - skipping incomplete directories
// rather than assuming the lexicographically-latest one is done, since the
// current run's own directory already exists on disk (trace files get
// written before this is called) but has no report.json yet.
export async function findPreviousReport(reportsDir: string, excludeDir?: string): Promise<BenchmarkReport | null> {
  let entries: string[];
  try {
    entries = await readdir(reportsDir);
  } catch {
    return null;
  }
  const sorted = entries.filter((e) => e !== ".gitkeep" && e !== excludeDir).sort().reverse();

  for (const dir of sorted) {
    const file = Bun.file(`${reportsDir}/${dir}/report.json`);
    if (await file.exists()) {
      return (await file.json()) as BenchmarkReport;
    }
  }
  return null;
}
