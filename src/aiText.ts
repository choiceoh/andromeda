// Build the text projection a pane pushes to the AI panel: a counted header plus
// one line per row. Centralized so every list pane presents to Deneb in the same
// shape (and the shape can change in one place). See useRegisterPane.
export function serializeList<T>(label: string, rows: T[], line: (row: T) => string, unit = "건"): string {
  if (rows.length === 0) return "";
  return `[${label} ${rows.length}${unit}]\n` + rows.map(line).join("\n");
}
