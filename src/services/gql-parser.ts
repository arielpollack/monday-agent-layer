export function containsMutation(query: string): boolean {
  // Strip block strings, regular strings, and single-line comments
  const stripped = query.replace(/"""[\s\S]*?"""|"(?:[^"\\]|\\.)*"|#[^\n]*/g, "");
  return /\bmutation\b/.test(stripped);
}
