// The model consistently drops a leading symbol (e.g. "-admins" ->
// "admins") across every extraction technique tried this project.
// Reattaching it by checking the character before the term's position in
// the original query is a symbol-position check, not a wording pattern -
// safe regardless of language.
export function reattachLeadingSymbol(query: string, term: string): string {
  const idx = query.indexOf(term);
  if (idx > 0 && query[idx - 1] === "-") {
    return query[idx - 1] + term;
  }
  return term;
}
