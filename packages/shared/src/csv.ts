/** Quote cells and neutralize spreadsheet formulas from untrusted page text. */
export function serializeCsv(rows: string[][]): string {
  const cell = (value: string) => `"${(/^\s*[=+@-]/u.test(value) ? "'" + value : value).replaceAll('"', '""')}"`
  return rows.map(row => row.map(cell).join(";")).join("\r\n")
}
