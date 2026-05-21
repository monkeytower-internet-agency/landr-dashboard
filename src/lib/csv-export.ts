// CSV export — landr-xnpc.
//
// Generic, dependency-free CSV writer + browser download trigger used by
// the Bookings / Contacts / Approvals / Reporting list pages.
//
// Why we roll our own:
//   - No new dependency. Papa Parse pulls in ~45 kB of stream parsing we
//     don't need; the export side fits in a few RFC 4180 lines.
//   - Single source of truth. `src/lib/reporting.ts` re-exports the same
//     primitives so the reporting Excel-style export stays in lock-step
//     with the per-page buttons.
//
// API:
//   csvEscape(value)                  → RFC 4180-quoted field
//   rowsToCsv(headers, rows)          → string with CRLF line endings
//   buildCsv(rows, columns)           → typed convenience over rowsToCsv
//   downloadCsv(filename, rows, cols) → triggers a browser download
//
// CSV grammar (RFC 4180 + Excel-compat):
//   - CRLF line endings (Excel-friendly; LF-only also opens fine).
//   - Fields containing "," `"` `\n` `\r` are wrapped in double-quotes.
//   - Embedded `"` is doubled.
//   - Trailing CRLF after the last record (POSIX-friendly).

export type CsvColumn<T> = {
  /** Column header text. */
  header: string
  /** Pure accessor — must return a value safe to stringify. */
  value: (row: T) => unknown
}

/**
 * Escape a single CSV field per RFC 4180:
 *   - if it contains `,` `"` `\n` or `\r`, wrap in double-quotes
 *   - any embedded `"` is doubled
 *   - null / undefined / '' → empty field
 */
export function csvEscape(value: unknown): string {
  if (value === null || value === undefined) return ''
  const s = typeof value === 'string' ? value : String(value)
  if (s === '') return ''
  if (/[",\r\n]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`
  }
  return s
}

/**
 * Low-level builder — joins headers + already-extracted rows into a CSV
 * string with CRLF line endings and a trailing newline.
 */
export function rowsToCsv(
  headers: readonly string[],
  rows: readonly (readonly unknown[])[],
): string {
  const lines: string[] = []
  lines.push(headers.map(csvEscape).join(','))
  for (const row of rows) {
    lines.push(row.map(csvEscape).join(','))
  }
  return `${lines.join('\r\n')}\r\n`
}

/**
 * Typed builder — extracts column values via accessors, then delegates to
 * `rowsToCsv`. Use this from page-level export handlers so the column
 * definition stays close to the data it describes.
 */
export function buildCsv<T>(
  rows: readonly T[],
  columns: readonly CsvColumn<T>[],
): string {
  const headers = columns.map((c) => c.header)
  const data = rows.map((row) => columns.map((c) => c.value(row)))
  return rowsToCsv(headers, data)
}

/**
 * Build a CSV from `rows` + `columns` and trigger a browser download
 * named `filename`. Returns the object URL so tests can assert against
 * it (also lets callers `URL.revokeObjectURL` early if they prefer).
 *
 * The Blob is prefixed with a UTF-8 BOM so Excel on Windows correctly
 * detects encoding for non-ASCII names (Á, ñ, ö, …).
 */
export function downloadCsv<T>(
  filename: string,
  rows: readonly T[],
  columns: readonly CsvColumn<T>[],
): string {
  const csv = buildCsv(rows, columns)
  return downloadCsvString(filename, csv)
}

/**
 * Lower-level escape hatch — accepts an already-built CSV string and
 * triggers the download. Used by `lib/reporting.ts` which assembles
 * its CSV via `buildBookingsCsv` rather than the generic column API.
 */
export function downloadCsvString(filename: string, csv: string): string {
  const blob = new Blob(['﻿', csv], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.style.display = 'none'
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  // Give the click handler a tick before revoking, so the browser has a
  // chance to start the download. Most browsers also tolerate immediate
  // revoke, but the timeout is the documented-safe pattern.
  setTimeout(() => URL.revokeObjectURL(url), 0)
  return url
}

/**
 * Build a `YYYY-MM-DD` stamp in UTC. Used as the default suffix in
 * filename helpers so two operators in different timezones produce the
 * same filename for the same export.
 */
export function todayStampUtc(now: Date = new Date()): string {
  const y = now.getUTCFullYear()
  const m = String(now.getUTCMonth() + 1).padStart(2, '0')
  const d = String(now.getUTCDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}
