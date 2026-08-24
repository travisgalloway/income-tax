/** Small, pure helpers shared by any chart that reads a subset of a full row
 *  array by year. No dependency on either dataset's shape beyond `{ y: number }`. */

/** The first and last year at which `rows[i][key]` is non-null.
 *
 *  Throws rather than falling back to `[0, 1]`: a series with no observation at
 *  all is a bug in the caller (wrong key, or a dataset that regressed to
 *  all-null), and charting a silent placeholder range would draw an empty
 *  series as if it were real. */
export function seriesSpan<T extends { y: number }>(rows: T[], key: keyof T): [number, number] {
  const years = rows.filter((r) => r[key] != null).map((r) => r.y)
  if (!years.length) {
    throw new Error(`seriesSpan: no non-null observation for key ${String(key)}`)
  }
  return [Math.min(...years), Math.max(...years)]
}

/** Rows whose year falls within `[lo, hi]`, inclusive. */
export function clampToRange<T extends { y: number }>(rows: T[], range: [number, number]): T[] {
  const [lo, hi] = range
  return rows.filter((r) => r.y >= lo && r.y <= hi)
}
