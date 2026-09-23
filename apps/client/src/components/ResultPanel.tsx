import type { ClassifyResult, FilterCondition, OutOfScopeResult } from "../types";

function conditionToSql({ field, kind, terms, type }: FilterCondition): string {
  if (kind === "mine") return `${field} = CURRENT_USER`;
  const value = terms[0] ?? "";
  const numeric = type === "number";
  switch (kind) {
    case "prefix":
      return `${field} LIKE '${value}%'`;
    case "suffix":
      return `${field} LIKE '%${value}'`;
    case "substring":
      return `${field} LIKE '%${value}%'`;
    case "gt":
      return `${field} > ${value}`;
    case "lt":
      return `${field} < ${value}`;
    case "ne":
      return numeric ? `${field} != ${value}` : `${field} != '${value}'`;
    default:
      return numeric ? `${field} = ${value}` : `${field} = '${value}'`;
  }
}

// No brackets/grouping - a flat chain, each filter joined to the next by
// combinators[i] (see packages/domain/src/pipeline.ts).
function toSql(result: ClassifyResult): string {
  const { entity, filters, combinators, pagination } = result;
  let sql = `SELECT * FROM ${entity}`;
  const isNoFilter = filters.length === 1 && filters[0]!.kind === "all";
  if (!isNoFilter) {
    const clause = filters.map((f, i) => (i === 0 ? conditionToSql(f) : `${combinators[i - 1]!.toUpperCase()} ${conditionToSql(f)}`)).join(" ");
    sql += ` WHERE ${clause}`;
  }
  sql += ` LIMIT ${pagination.limit}`;
  return sql;
}

export function ResultPanel({ result }: { result: ClassifyResult | OutOfScopeResult }) {
  if ("inScope" in result && result.inScope === false) {
    return (
      <div>
        <p>
          <strong>Out of scope</strong> ({result.reason})
        </p>
        <p>{result.message}</p>
      </div>
    );
  }
  const classified = result as ClassifyResult;
  return (
    <div>
      <p>
        <strong>SQL:</strong> <code>{toSql(classified)}</code>
      </p>
      <pre>{JSON.stringify(classified, null, 2)}</pre>
    </div>
  );
}
