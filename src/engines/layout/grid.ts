import type { FontFamily } from '../../types'
import { baselineFromMiddle } from '../../utils/text'
import type { DocBuilder } from './doc'

/**
 * Grid drawing shared by word search, crossword, sudoku, bingo, coordinate
 * grids and the maze. One implementation means every grid on every sheet has
 * matching line weights, cell padding and optical centring.
 */

export interface CellStyle {
  fill?: string
  /** Text drawn centred in the cell. */
  text?: string
  textSize?: number
  textColor?: string
  textWeight?: 'normal' | 'bold'
  textFont?: FontFamily
  /** Small superscript-style number in the top-left (crossword clue numbers). */
  corner?: string
  cornerSize?: number
  cornerColor?: string
  /** Skips the cell border entirely - used for crossword blanks. */
  noBorder?: boolean
  /** Extra ring drawn inside the cell, for highlighting answers. */
  ring?: string
}

export interface GridOptions {
  x: number
  y: number
  cols: number
  rows: number
  cell: number
  stroke?: string
  lineWidth?: number
  /** Heavier border drawn around the whole grid. */
  outerLineWidth?: number
  /** Heavier separators every N cells - sudoku boxes. */
  blockEvery?: { col?: number; row?: number; lineWidth?: number }
  /** Per-cell styling. Return undefined for a plain cell. */
  style?: (row: number, col: number) => CellStyle | undefined
  /** Column headers drawn above the grid (bingo B-I-N-G-O). */
  colHeaders?: string[]
  colHeaderHeight?: number
  colHeaderStyle?: { fill?: string; color?: string; size?: number; font?: FontFamily }
  /** Row/column index labels outside the grid (coordinate grids). */
  rowLabels?: string[]
  colLabels?: string[]
  labelSize?: number
  labelColor?: string
}

export interface GridBounds {
  x: number
  y: number
  width: number
  height: number
  /** Top of the playable cells, below any column header band. */
  cellsY: number
}

/** Largest cell size that fits `cols` x `rows` into the available box. */
export function fitCellSize(
  cols: number,
  rows: number,
  maxWidth: number,
  maxHeight: number,
  maxCell = 14,
  minCell = 3.5,
): number {
  const byWidth = maxWidth / cols
  const byHeight = maxHeight / rows
  return Math.max(minCell, Math.min(maxCell, byWidth, byHeight))
}

export function drawGrid(b: DocBuilder, opts: GridOptions): GridBounds {
  const {
    x, y, cols, rows, cell,
    stroke = '#334155',
    lineWidth = 0.25,
    outerLineWidth = 0.7,
  } = opts

  const headerH = opts.colHeaders ? (opts.colHeaderHeight ?? cell * 0.8) : 0
  const cellsY = y + headerH
  const width = cols * cell
  const height = rows * cell

  // Column header band (e.g. B I N G O).
  if (opts.colHeaders) {
    const hs = opts.colHeaderStyle ?? {}
    b.rect(x, y, width, headerH, { fill: hs.fill ?? '#e2e8f0' })
    opts.colHeaders.forEach((label, c) => {
      b.text(x + c * cell + cell / 2, y + headerH / 2, label, {
        size: hs.size ?? headerH * 1.6,
        weight: 'bold',
        align: 'center',
        font: hs.font ?? 'sans',
        color: hs.color ?? '#0f172a',
        baseline: 'middle',
      })
    })
    b.rect(x, y, width, headerH, { stroke, lineWidth: outerLineWidth })
  }

  // Cell fills and contents first, so borders always sit on top.
  if (opts.style) {
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const s = opts.style(r, c)
        if (!s) continue
        const cx = x + c * cell
        const cy = cellsY + r * cell
        if (s.fill) b.rect(cx, cy, cell, cell, { fill: s.fill })
        if (s.ring) {
          b.circle(cx + cell / 2, cy + cell / 2, cell * 0.44, {
            stroke: s.ring,
            lineWidth: 0.5,
          })
        }
        if (s.corner) {
          b.text(cx + cell * 0.11, cy + cell * 0.1, s.corner, {
            size: s.cornerSize ?? Math.max(3.6, cell * 0.75),
            font: 'sans',
            color: s.cornerColor ?? '#475569',
            baseline: 'top',
          })
        }
        if (s.text) {
          const size = s.textSize ?? cell * 1.9
          b.text(cx + cell / 2, cellsY + r * cell + cell / 2, s.text, {
            size,
            align: 'center',
            weight: s.textWeight ?? 'normal',
            font: s.textFont ?? 'sans',
            color: s.textColor ?? '#0f172a',
            baseline: 'middle',
            maxWidth: cell * 0.92,
          })
        }
      }
    }
  }

  // Interior grid lines. Cells flagged `noBorder` punch holes in the ruling,
  // which is how crossword blanks read as solid blocks rather than empty boxes.
  const isDrawn = (r: number, c: number): boolean => {
    if (r < 0 || c < 0 || r >= rows || c >= cols) return false
    return !opts.style?.(r, c)?.noBorder
  }

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (!isDrawn(r, c)) continue
      const cx = x + c * cell
      const cy = cellsY + r * cell
      b.rect(cx, cy, cell, cell, { stroke, lineWidth })
    }
  }

  // Heavier block separators (sudoku).
  if (opts.blockEvery) {
    const blw = opts.blockEvery.lineWidth ?? outerLineWidth
    if (opts.blockEvery.col) {
      for (let c = opts.blockEvery.col; c < cols; c += opts.blockEvery.col) {
        b.line(x + c * cell, cellsY, x + c * cell, cellsY + height, { stroke, lineWidth: blw })
      }
    }
    if (opts.blockEvery.row) {
      for (let r = opts.blockEvery.row; r < rows; r += opts.blockEvery.row) {
        b.line(x, cellsY + r * cell, x + width, cellsY + r * cell, { stroke, lineWidth: blw })
      }
    }
  }

  // Outer frame. A zero width suppresses it entirely, which is what a sparse
  // criss-cross crossword wants - a box drawn around floating words looks wrong.
  if (outerLineWidth > 0) {
    b.rect(x, cellsY, width, height, { stroke, lineWidth: outerLineWidth })
  }

  // Outside labels.
  const labelSize = opts.labelSize ?? Math.max(4.5, cell * 1.1)
  const labelColor = opts.labelColor ?? '#64748b'
  if (opts.colLabels) {
    opts.colLabels.forEach((label, c) => {
      b.text(x + c * cell + cell / 2, cellsY + height + 1.4, label, {
        size: labelSize, align: 'center', color: labelColor, baseline: 'top',
      })
    })
  }
  if (opts.rowLabels) {
    opts.rowLabels.forEach((label, r) => {
      b.text(x - 1.4, baselineFromMiddle(cellsY + r * cell + cell / 2, labelSize), label, {
        size: labelSize, align: 'right', color: labelColor,
      })
    })
  }

  return { x, y, width, height: height + headerH, cellsY }
}

/** Simple bordered table used for call sheets and score tracks. */
export function drawTable(
  b: DocBuilder,
  opts: {
    x: number
    y: number
    width: number
    rowHeight: number
    columns: Array<{ label: string; width: number; align?: 'left' | 'center' | 'right' }>
    rows: string[][]
    headerFill?: string
    headerColor?: string
    stripeFill?: string
    stroke?: string
    size?: number
    font?: FontFamily
  },
): number {
  const { x, y, rowHeight, columns, rows } = opts
  const stroke = opts.stroke ?? '#94a3b8'
  const size = opts.size ?? 8.2
  const totalW = columns.reduce((a, c) => a + c.width, 0)

  b.rect(x, y, totalW, rowHeight, { fill: opts.headerFill ?? '#e2e8f0' })
  let cx = x
  columns.forEach((col) => {
    const align = col.align ?? 'left'
    const tx = align === 'center' ? cx + col.width / 2 : align === 'right' ? cx + col.width - 2 : cx + 2
    b.text(tx, y + rowHeight / 2, col.label, {
      size,
      weight: 'bold',
      align,
      font: opts.font,
      color: opts.headerColor ?? '#0f172a',
      baseline: 'middle',
      maxWidth: col.width - 3,
    })
    cx += col.width
  })

  rows.forEach((row, ri) => {
    const ry = y + rowHeight * (ri + 1)
    if (opts.stripeFill && ri % 2 === 1) {
      b.rect(x, ry, totalW, rowHeight, { fill: opts.stripeFill })
    }
    let colX = x
    columns.forEach((col, ci) => {
      const align = col.align ?? 'left'
      const tx = align === 'center' ? colX + col.width / 2 : align === 'right' ? colX + col.width - 2 : colX + 2
      b.text(tx, ry + rowHeight / 2, row[ci] ?? '', {
        size,
        align,
        font: opts.font,
        baseline: 'middle',
        maxWidth: col.width - 3,
      })
      colX += col.width
    })
  })

  // Ruling drawn last so it sits above the stripes.
  const height = rowHeight * (rows.length + 1)
  for (let i = 0; i <= rows.length + 1; i++) {
    b.line(x, y + i * rowHeight, x + totalW, y + i * rowHeight, { stroke, lineWidth: 0.25 })
  }
  let lx = x
  for (let i = 0; i <= columns.length; i++) {
    b.line(lx, y, lx, y + height, { stroke, lineWidth: 0.25 })
    lx += columns[i]?.width ?? 0
  }
  b.rect(x, y, totalW, height, { stroke, lineWidth: 0.5 })

  return y + height
}
