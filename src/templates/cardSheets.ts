/**
 * Card-sheet templates.
 *
 * Every deck-based game (quiz, flash, memory, challenge, board question cards)
 * has to answer the same question: how many cards fit on a sheet, and which
 * arrangement suits this content? Rather than each generator inventing its own
 * numbers, they pick a named template from this catalogue.
 *
 * `chooseCardSheet` does the picking: it estimates how much text a card must
 * carry, then selects the densest template whose card is still comfortably
 * larger than that content. Cards that are too small to read and sheets that
 * waste half a page are both layout bugs, and this is where they are avoided.
 */

export interface CardSheetTemplate {
  id: string
  label: string
  cols: number
  rows: number
  /** Gutter between cards, in mm. */
  gap: number
  /** Roughly how many characters a card of this size holds legibly. */
  textCapacity: number
}

export const CARD_SHEETS: CardSheetTemplate[] = [
  { id: 'jumbo-1x2', label: 'Jumbo (2 per sheet)', cols: 1, rows: 2, gap: 4, textCapacity: 900 },
  { id: 'large-2x2', label: 'Large (4 per sheet)', cols: 2, rows: 2, gap: 4, textCapacity: 460 },
  { id: 'standard-2x3', label: 'Standard (6 per sheet)', cols: 2, rows: 3, gap: 3, textCapacity: 300 },
  { id: 'tall-2x4', label: 'Tall (8 per sheet)', cols: 2, rows: 4, gap: 3, textCapacity: 200 },
  { id: 'compact-3x4', label: 'Compact (12 per sheet)', cols: 3, rows: 4, gap: 2.5, textCapacity: 130 },
  { id: 'dense-3x5', label: 'Dense (15 per sheet)', cols: 3, rows: 5, gap: 2.5, textCapacity: 95 },
  { id: 'tile-4x5', label: 'Tiles (20 per sheet)', cols: 4, rows: 5, gap: 2.5, textCapacity: 60 },
  { id: 'tile-5x6', label: 'Small tiles (30 per sheet)', cols: 5, rows: 6, gap: 2, textCapacity: 34 },
]

export interface CardSheetQuery {
  /** Longest amount of text any single card must carry, in characters. */
  contentLength: number
  /** Never go denser than this many cards per sheet. */
  maxPerSheet?: number
  /** Never go sparser than this many cards per sheet. */
  minPerSheet?: number
  /** Restrict to these template ids. */
  allow?: string[]
}

/**
 * Picks the densest template that still gives the content room to breathe.
 * Falls back to the sparsest allowed template when nothing fits, because an
 * over-large card is merely wasteful while an over-small one is unusable.
 */
export function chooseCardSheet(query: CardSheetQuery): CardSheetTemplate {
  const candidates = CARD_SHEETS.filter((t) => {
    const perSheet = t.cols * t.rows
    if (query.allow && !query.allow.includes(t.id)) return false
    if (query.maxPerSheet && perSheet > query.maxPerSheet) return false
    if (query.minPerSheet && perSheet < query.minPerSheet) return false
    return true
  })

  if (candidates.length === 0) return CARD_SHEETS[2]

  const fitting = candidates
    .filter((t) => t.textCapacity >= query.contentLength)
    .sort((a, b) => b.cols * b.rows - a.cols * a.rows)

  if (fitting.length > 0) return fitting[0]

  // Nothing fits: take the roomiest option available.
  return candidates.slice().sort((a, b) => b.textCapacity - a.textCapacity)[0]
}

