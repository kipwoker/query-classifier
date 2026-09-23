import { NUMERIC_TYPES, type FilterCondition } from "./schema";

// Single source of truth for turning one condition into a SQL fragment -
// used both to frame the "does the WHERE clause continue?" question asked
// of laya (pipeline.ts) and for display.
export function renderConditionSql({ field, kind, terms, type }: FilterCondition): string {
  if (kind === "all") return "1=1";
  if (kind === "mine") return `${field} = CURRENT_USER`;
  const value = terms[0] ?? "";
  const numeric = NUMERIC_TYPES.has(type);
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
