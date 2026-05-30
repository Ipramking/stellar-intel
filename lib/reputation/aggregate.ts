// ─── Domain types ─────────────────────────────────────────────────────────────

/**
 * A single outcome row written to the reputation log after a transaction
 * completes. All PII has already been stripped (see redact.ts).
 */
export interface OutcomeRow {
  intentHash: string
  anchorId: string
  /** Whether the transaction reached the "completed" state. */
  filled: boolean
  /** Settlement time in milliseconds (null when not yet settled). */
  settleMs: number | null
  /** Slippage as a decimal fraction, e.g. 0.02 = 2 % (null when unavailable). */
  slippage: number | null
  /** Unix timestamp (ms) when the row was recorded. */
  recordedAt: number
}

/** Rolling window in days — 7, 30, or 90. */
export type Window = 7 | 30 | 90

// ─── Scorecard ────────────────────────────────────────────────────────────────

export interface Percentiles {
  p50: number
  p95: number
}

/**
 * The computed scorecard for one rolling window.
 * When there are fewer than MIN_SAMPLES rows the state is "insufficient_data".
 */
export type Scorecard =
  | {
      state: 'ok'
      window: Window
      sampleSize: number
      fillRate: number
      settleMs: Percentiles
      slippage: Percentiles
    }
  | {
      state: 'insufficient_data'
      window: Window
      sampleSize: number
    }

// ─── Constants ────────────────────────────────────────────────────────────────

/** Minimum rows required to compute a scorecard. */
export const MIN_SAMPLES = 1

const MS_PER_DAY = 86_400_000

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Returns the p-th percentile (0–100) of a sorted numeric array.
 * Uses linear interpolation (same as NumPy's default).
 */
export function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0
  if (sorted.length === 1) return sorted[0] ?? 0
  const idx = (p / 100) * (sorted.length - 1)
  const lo = Math.floor(idx)
  const hi = Math.ceil(idx)
  const loVal = sorted[lo] ?? 0
  const hiVal = sorted[hi] ?? 0
  return loVal + (hiVal - loVal) * (idx - lo)
}

// ─── Core aggregate function ──────────────────────────────────────────────────

/**
 * Computes a scorecard for a single rolling window from a flat array of rows.
 * Rows are filtered to those recorded within `windowDays` days of `nowMs`.
 */
export function aggregate(
  rows: OutcomeRow[],
  windowDays: Window,
  nowMs: number = Date.now(),
): Scorecard {
  const cutoff = nowMs - windowDays * MS_PER_DAY
  const windowRows = rows.filter((r) => r.recordedAt >= cutoff)

  if (windowRows.length < MIN_SAMPLES) {
    return { state: 'insufficient_data', window: windowDays, sampleSize: windowRows.length }
  }

  const fillRate = windowRows.filter((r) => r.filled).length / windowRows.length

  const settleSorted = windowRows
    .map((r) => r.settleMs)
    .filter((v): v is number => v !== null)
    .sort((a, b) => a - b)

  const slippageSorted = windowRows
    .map((r) => r.slippage)
    .filter((v): v is number => v !== null)
    .sort((a, b) => a - b)

  const settleMs: Percentiles =
    settleSorted.length > 0
      ? { p50: percentile(settleSorted, 50), p95: percentile(settleSorted, 95) }
      : { p50: 0, p95: 0 }

  const slippage: Percentiles =
    slippageSorted.length > 0
      ? { p50: percentile(slippageSorted, 50), p95: percentile(slippageSorted, 95) }
      : { p50: 0, p95: 0 }

  return {
    state: 'ok',
    window: windowDays,
    sampleSize: windowRows.length,
    fillRate,
    settleMs,
    slippage,
  }
}

/**
 * Computes 7, 30, and 90-day scorecards for an anchor's outcome rows.
 */
export function buildScorecards(
  rows: OutcomeRow[],
  nowMs: number = Date.now(),
): Record<Window, Scorecard> {
  return {
    7: aggregate(rows, 7, nowMs),
    30: aggregate(rows, 30, nowMs),
    90: aggregate(rows, 90, nowMs),
  }
}
