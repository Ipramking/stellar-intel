import { NextRequest, NextResponse } from 'next/server'
import { buildScorecards } from '@/lib/reputation/aggregate'
import type { OutcomeRow } from '@/lib/reputation/aggregate'

// ─── In-memory store (seed / replace with DB in a later iteration) ────────────

/**
 * Production implementations should replace this with a real data-store query.
 * For v1 the store is an in-memory array that can be seeded in tests / demos.
 */
const outcomeStore: OutcomeRow[] = []

/** Exposed for testing and seeding only — not part of the public API surface. */
export function _seedOutcomeStore(rows: OutcomeRow[]): void {
  outcomeStore.length = 0
  outcomeStore.push(...rows)
}

// ─── GET /api/reputation/[anchor] ────────────────────────────────────────────

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ anchor: string }> },
): Promise<NextResponse> {
  const { anchor } = await params

  if (!anchor || typeof anchor !== 'string') {
    return NextResponse.json({ error: 'anchor param is required' }, { status: 400 })
  }

  const anchorRows = outcomeStore.filter((r) => r.anchorId === anchor)
  const scorecards = buildScorecards(anchorRows)

  return NextResponse.json({
    anchorId: anchor,
    scorecards,
  })
}
