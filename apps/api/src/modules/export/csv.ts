/** Escapes a single CSV field per RFC 4180: wrap in quotes if it
 * contains a comma, quote, or newline, doubling any internal quotes. */
function escapeCsvField(value: string): string {
  if (/[",\n\r]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

export function toCsv(
  headers: string[],
  rows: Array<Array<string | number | boolean | null>>,
): string {
  const lines = [headers.map(escapeCsvField).join(",")];
  for (const row of rows) {
    lines.push(row.map((cell) => escapeCsvField(cell === null ? "" : String(cell))).join(","));
  }
  // CRLF line endings — the RFC 4180 standard most spreadsheet software
  // (including the clinician's, whatever it is) expects for CSV.
  return lines.join("\r\n") + "\r\n";
}
