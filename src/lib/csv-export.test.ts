// landr-xnpc — tests for the shared CSV writer + download trigger.

import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  buildCsv,
  csvEscape,
  downloadCsv,
  downloadCsvString,
  rowsToCsv,
  todayStampUtc,
  type CsvColumn,
} from './csv-export'

afterEach(() => {
  vi.restoreAllMocks()
})

describe('csvEscape', () => {
  it('returns plain strings unchanged', () => {
    expect(csvEscape('hello')).toBe('hello')
    expect(csvEscape(42)).toBe('42')
    expect(csvEscape(true)).toBe('true')
  })

  it('wraps fields containing commas', () => {
    expect(csvEscape('a,b')).toBe('"a,b"')
  })

  it('doubles embedded quotes and wraps', () => {
    expect(csvEscape('she said "hi"')).toBe('"she said ""hi"""')
  })

  it('wraps fields containing newlines (LF and CRLF)', () => {
    expect(csvEscape('line1\nline2')).toBe('"line1\nline2"')
    expect(csvEscape('line1\r\nline2')).toBe('"line1\r\nline2"')
  })

  it('wraps fields containing a bare carriage return', () => {
    expect(csvEscape('line1\rline2')).toBe('"line1\rline2"')
  })

  it('returns empty for null / undefined / empty string', () => {
    expect(csvEscape(null)).toBe('')
    expect(csvEscape(undefined)).toBe('')
    expect(csvEscape('')).toBe('')
  })

  it('does not wrap a string that only contains a single quote character', () => {
    // Apostrophe is fine — RFC 4180 only forces quoting for " , CR LF.
    expect(csvEscape("O'Hara")).toBe("O'Hara")
  })
})

describe('rowsToCsv', () => {
  it('joins headers and rows with CRLF and escapes properly', () => {
    const csv = rowsToCsv(
      ['Name', 'Note'],
      [
        ['Alice', 'plain'],
        ['Bob, Jr.', 'has "quote"'],
      ],
    )
    expect(csv).toBe(
      'Name,Note\r\nAlice,plain\r\n"Bob, Jr.","has ""quote"""\r\n',
    )
  })

  it('emits header-only output when given zero rows', () => {
    const csv = rowsToCsv(['A', 'B'], [])
    expect(csv).toBe('A,B\r\n')
  })

  it('preserves the column count when fields are empty', () => {
    const csv = rowsToCsv(['A', 'B', 'C'], [['x', '', 'z']])
    expect(csv).toBe('A,B,C\r\nx,,z\r\n')
  })
})

describe('buildCsv', () => {
  type Row = { id: string; name: string | null; total: number }

  const columns: CsvColumn<Row>[] = [
    { header: 'ID', value: (r) => r.id },
    { header: 'Name', value: (r) => r.name ?? '' },
    { header: 'Total', value: (r) => r.total.toFixed(2) },
  ]

  it('extracts values via column accessors and writes a header + rows', () => {
    const csv = buildCsv(
      [
        { id: 'a', name: 'Alice', total: 12 },
        { id: 'b', name: 'Bob, Jr.', total: 7.5 },
      ],
      columns,
    )
    expect(csv).toBe(
      'ID,Name,Total\r\na,Alice,12.00\r\nb,"Bob, Jr.",7.50\r\n',
    )
  })

  it('handles null accessor results as empty fields', () => {
    const csv = buildCsv(
      [{ id: 'a', name: null, total: 0 }],
      columns,
    )
    expect(csv).toBe('ID,Name,Total\r\na,,0.00\r\n')
  })

  it('quotes embedded newlines from accessor output', () => {
    const csv = buildCsv(
      [{ id: 'a', name: 'line1\nline2', total: 1 }],
      columns,
    )
    expect(csv).toBe('ID,Name,Total\r\na,"line1\nline2",1.00\r\n')
  })
})

describe('downloadCsvString', () => {
  it('creates a blob URL, clicks an anchor with the given filename, and cleans up', () => {
    const created = vi.fn().mockReturnValue('blob:test')
    const revoked = vi.fn()
    vi.stubGlobal('URL', {
      createObjectURL: created,
      revokeObjectURL: revoked,
    } as unknown as typeof URL)

    const clickSpy = vi
      .spyOn(HTMLAnchorElement.prototype, 'click')
      .mockImplementation(() => {})

    const url = downloadCsvString('test.csv', 'a,b\r\n1,2\r\n')
    expect(url).toBe('blob:test')
    expect(created).toHaveBeenCalledTimes(1)

    // The anchor should have been created, used, then removed from the DOM.
    expect(clickSpy).toHaveBeenCalledTimes(1)
    expect(document.querySelector('a[download="test.csv"]')).toBeNull()
  })

  it('prefixes the blob payload with a UTF-8 BOM for Excel compatibility', () => {
    const blobs: BlobPart[][] = []
    const fakeBlob = function (parts: BlobPart[]) {
      blobs.push(parts)
      return { type: 'text/csv' } as unknown as Blob
    } as unknown as typeof Blob
    vi.stubGlobal('Blob', fakeBlob)
    vi.stubGlobal('URL', {
      createObjectURL: () => 'blob:bom',
      revokeObjectURL: () => {},
    } as unknown as typeof URL)
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(
      () => {},
    )

    downloadCsvString('test.csv', 'x,y\r\n')
    expect(blobs).toHaveLength(1)
    // First chunk is the BOM, second is the actual CSV string.
    expect(blobs[0][0]).toBe('﻿')
    expect(blobs[0][1]).toBe('x,y\r\n')
  })
})

describe('downloadCsv', () => {
  it('builds the CSV from columns and triggers a download', () => {
    const blobs: BlobPart[][] = []
    vi.stubGlobal(
      'Blob',
      function (parts: BlobPart[]) {
        blobs.push(parts)
        return { type: 'text/csv' } as unknown as Blob
      } as unknown as typeof Blob,
    )
    vi.stubGlobal('URL', {
      createObjectURL: () => 'blob:dl',
      revokeObjectURL: () => {},
    } as unknown as typeof URL)
    const clickSpy = vi
      .spyOn(HTMLAnchorElement.prototype, 'click')
      .mockImplementation(() => {})

    type R = { name: string }
    const rows: R[] = [{ name: 'Alice' }, { name: 'Bob, Jr.' }]
    const columns: CsvColumn<R>[] = [
      { header: 'Name', value: (r) => r.name },
    ]
    const url = downloadCsv('out.csv', rows, columns)

    expect(url).toBe('blob:dl')
    expect(clickSpy).toHaveBeenCalledTimes(1)
    // CSV payload arrives as the second blob part (the first is the BOM).
    expect(blobs[0][1]).toBe('Name\r\nAlice\r\n"Bob, Jr."\r\n')
  })
})

describe('todayStampUtc', () => {
  it('formats a known UTC instant as YYYY-MM-DD', () => {
    const d = new Date(Date.UTC(2026, 4, 21, 23, 59, 59)) // 2026-05-21 in UTC
    expect(todayStampUtc(d)).toBe('2026-05-21')
  })

  it('zero-pads single-digit months and days', () => {
    const d = new Date(Date.UTC(2026, 0, 3, 12, 0, 0)) // 2026-01-03
    expect(todayStampUtc(d)).toBe('2026-01-03')
  })

  it('falls back to the current time when no argument given', () => {
    const out = todayStampUtc()
    expect(out).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })
})
