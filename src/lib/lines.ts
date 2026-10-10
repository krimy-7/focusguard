// Preview mirror of the server goal splitter (spec §3.3). No runtime imports.

export const MAX_LINES = 20;
export const MAX_TITLE = 200;

/** Split on newlines (\r\n, \r, \n), trim, drop empties — exactly what POST /goals {lines} creates. */
export function splitLines(text: string): string[] {
  return text
    .split(/\r\n|\r|\n/)
    .map((l) => l.trim())
    .filter(Boolean);
}

/** Why these lines can't be sent, or null. Blocks before POST instead of relying on server truncation. */
export function linesError(lines: string[]): string | null {
  if (lines.length > MAX_LINES) return `That's ${lines.length} goals. Add up to ${MAX_LINES} at a time.`;
  const long = lines.findIndex((l) => l.length > MAX_TITLE);
  if (long >= 0) return `Goal ${long + 1} is over ${MAX_TITLE} characters. Try a shorter title.`;
  return null;
}
