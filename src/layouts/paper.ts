import type { GameCategory, Orientation, PageSizeId } from '../types'
import { PAGE_DIMENSIONS } from '../types'

/**
 * Paper presets.
 *
 * Margins are not one-size-fits-all. A worksheet wants generous margins so the
 * printer's unprintable edge never clips a question; a board game wants the
 * opposite, because every millimetre of margin is a millimetre off the board.
 * Centralising that here keeps the trade-off in one reviewable place instead of
 * scattered magic numbers across eighteen generators.
 *
 * The floor is 8 mm: below that, common inkjets and laser printers start
 * clipping, and a sheet that clips is worse than one that is slightly smaller.
 */

export interface Margins {
  top: number
  right: number
  bottom: number
  left: number
}

/** Smallest margin any consumer printer reliably reproduces. */
export const SAFE_MARGIN_MM = 8

const CATEGORY_MARGIN: Record<GameCategory, number> = {
  math: 12,
  literacy: 12,
  puzzle: 12,
  cards: 11, // cards are cut out, so the sheet edge matters less
  board: 10, // give the board as much of the page as is safe
  trivia: 12,
}

export function marginsFor(category: GameCategory): Margins {
  const m = Math.max(SAFE_MARGIN_MM, CATEGORY_MARGIN[category] ?? 12)
  // A slightly deeper bottom margin leaves room for the footer rule.
  return { top: m, right: m, bottom: m + 2, left: m }
}

export interface PaperPreset {
  id: PageSizeId
  label: string
  width: number
  height: number
}

export const PAPER_PRESETS: PaperPreset[] = (
  Object.entries(PAGE_DIMENSIONS) as Array<[PageSizeId, (typeof PAGE_DIMENSIONS)[PageSizeId]]>
).map(([id, dims]) => ({ id, label: dims.label, width: dims.width, height: dims.height }))

/** Page box in mm for a size + orientation pair. */
export function pageBox(pageSize: PageSizeId, orientation: Orientation): { width: number; height: number } {
  const base = PAGE_DIMENSIONS[pageSize]
  return orientation === 'portrait'
    ? { width: base.width, height: base.height }
    : { width: base.height, height: base.width }
}

/** Printable area once the margins are taken off. */
export function contentBox(
  pageSize: PageSizeId,
  orientation: Orientation,
  margins: Margins,
): { width: number; height: number } {
  const { width, height } = pageBox(pageSize, orientation)
  return {
    width: width - margins.left - margins.right,
    height: height - margins.top - margins.bottom,
  }
}
