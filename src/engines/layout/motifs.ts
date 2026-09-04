import type { PathCmd } from '../../types'
import type { DocBuilder } from './doc'
import type { MotifId } from './theme'

/**
 * Decorative theme motifs, drawn as vector paths so they stay crisp at any zoom
 * and add almost nothing to the PDF size. Each motif is authored inside a unit
 * box centred on the origin, then scaled and translated - so adding a new one
 * means drawing it once at size 1.
 */

type UnitPath = Array<[number, number]>

const STAR_POINTS = (points: number, inner: number): UnitPath => {
  const out: UnitPath = []
  for (let i = 0; i < points * 2; i++) {
    const r = i % 2 === 0 ? 0.5 : 0.5 * inner
    const a = (Math.PI / points) * i - Math.PI / 2
    out.push([Math.cos(a) * r, Math.sin(a) * r])
  }
  return out
}

function place(points: UnitPath, cx: number, cy: number, size: number): Array<[number, number]> {
  return points.map(([x, y]) => [cx + x * size, cy + y * size] as [number, number])
}

export function drawMotif(
  b: DocBuilder,
  motif: MotifId,
  cx: number,
  cy: number,
  size: number,
  color: string,
  opacity = 1,
): void {
  const o = { fill: color, opacity }

  switch (motif) {
    case 'star':
      b.polygon(place(STAR_POINTS(5, 0.42), cx, cy, size), o)
      break

    case 'sparkle': {
      // Four-point sparkle plus two small companions.
      b.polygon(place(STAR_POINTS(4, 0.28), cx, cy, size), o)
      b.polygon(place(STAR_POINTS(4, 0.28), cx + size * 0.45, cy - size * 0.35, size * 0.4), o)
      b.polygon(place(STAR_POINTS(4, 0.28), cx - size * 0.45, cy + size * 0.35, size * 0.32), o)
      break
    }

    case 'apple': {
      const r = size * 0.36
      b.circle(cx - r * 0.5, cy + size * 0.06, r, o)
      b.circle(cx + r * 0.5, cy + size * 0.06, r, o)
      b.circle(cx, cy + size * 0.2, r * 0.95, o)
      // Stalk and leaf.
      b.rect(cx - size * 0.03, cy - size * 0.42, size * 0.06, size * 0.24, o)
      b.polygon(
        [
          [cx + size * 0.03, cy - size * 0.34],
          [cx + size * 0.34, cy - size * 0.46],
          [cx + size * 0.16, cy - size * 0.22],
        ],
        o,
      )
      break
    }

    case 'compass': {
      b.circle(cx, cy, size * 0.5, { stroke: color, lineWidth: size * 0.07, opacity })
      b.polygon(
        [
          [cx, cy - size * 0.34],
          [cx + size * 0.13, cy],
          [cx, cy + size * 0.34],
          [cx - size * 0.13, cy],
        ],
        o,
      )
      break
    }

    case 'paw': {
      const pad = size * 0.17
      b.circle(cx, cy + size * 0.16, size * 0.26, o)
      b.circle(cx - size * 0.28, cy - size * 0.06, pad, o)
      b.circle(cx - size * 0.1, cy - size * 0.26, pad, o)
      b.circle(cx + size * 0.1, cy - size * 0.26, pad, o)
      b.circle(cx + size * 0.28, cy - size * 0.06, pad, o)
      break
    }

    case 'wave': {
      const w = size
      const h = size * 0.28
      const d: PathCmd[] = [
        { t: 'M', x: cx - w / 2, y: cy },
        { t: 'C', x1: cx - w / 4, y1: cy - h, x2: cx - w / 4, y2: cy + h, x: cx, y: cy },
        { t: 'C', x1: cx + w / 4, y1: cy - h, x2: cx + w / 4, y2: cy + h, x: cx + w / 2, y: cy },
      ]
      b.path(d, { stroke: color, lineWidth: size * 0.1, opacity })
      const d2 = d.map((c) =>
        c.t === 'M' ? { ...c, y: c.y + h * 1.3 }
          : c.t === 'C' ? { ...c, y1: c.y1 + h * 1.3, y2: c.y2 + h * 1.3, y: c.y + h * 1.3 }
            : c,
      ) as PathCmd[]
      b.path(d2, { stroke: color, lineWidth: size * 0.1, opacity: opacity * 0.6 })
      break
    }

    case 'crown': {
      b.polygon(
        place(
          [
            [-0.5, 0.28], [0.5, 0.28], [0.5, -0.18], [0.28, 0.02],
            [0.12, -0.3], [-0.12, -0.3], [-0.28, 0.02], [-0.5, -0.18],
          ],
          cx, cy, size,
        ),
        o,
      )
      break
    }

    case 'ball': {
      b.circle(cx, cy, size * 0.45, { stroke: color, lineWidth: size * 0.08, opacity })
      b.polygon(place(STAR_POINTS(5, 0.5), cx, cy, size * 0.42), { fill: color, opacity: opacity * 0.85 })
      break
    }

    case 'leaf': {
      const d: PathCmd[] = [
        { t: 'M', x: cx, y: cy - size * 0.45 },
        { t: 'C', x1: cx + size * 0.5, y1: cy - size * 0.2, x2: cx + size * 0.3, y2: cy + size * 0.35, x: cx, y: cy + size * 0.45 },
        { t: 'C', x1: cx - size * 0.3, y1: cy + size * 0.35, x2: cx - size * 0.5, y2: cy - size * 0.2, x: cx, y: cy - size * 0.45 },
        { t: 'Z' },
      ]
      b.path(d, o)
      break
    }

    case 'none':
    default:
      break
  }
}

/** Scatters small motifs along a horizontal strip - used on title bands. */
export function scatterMotifs(
  b: DocBuilder,
  motif: MotifId,
  x: number,
  y: number,
  width: number,
  count: number,
  size: number,
  color: string,
  opacity = 0.25,
): void {
  if (motif === 'none' || count <= 0) return
  for (let i = 0; i < count; i++) {
    const t = (i + 0.5) / count
    const wobble = ((i % 3) - 1) * size * 0.35
    drawMotif(b, motif, x + t * width, y + wobble, size * (i % 2 === 0 ? 1 : 0.75), color, opacity)
  }
}
