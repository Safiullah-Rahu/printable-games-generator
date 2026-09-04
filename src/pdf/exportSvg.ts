import type { PathCmd, PrintDoc, PrintElement, PrintPage } from '../types'
import { CSS_FONT, measureText, pt2mm } from '../utils/text'
import { escapeXml } from '../utils/text'

/**
 * PrintDoc -> standalone SVG string.
 *
 * The same geometry as the React preview and the PDF exporter, serialised
 * without a DOM. It powers the visual regression checks (a page can be
 * rasterised and eyeballed in CI or by a headless browser) and gives anyone
 * embedding this engine a third output format for free.
 */

function attrs(pairs: Array<[string, string | number | undefined]>): string {
  return pairs
    .filter(([, v]) => v !== undefined && v !== null && v !== '')
    .map(([k, v]) => `${k}="${typeof v === 'number' ? round(v) : escapeXml(String(v))}"`)
    .join(' ')
}

/** Trims float noise so the output diffs cleanly between runs. */
function round(v: number): string {
  return String(Math.round(v * 1000) / 1000)
}

function pathToD(cmds: PathCmd[]): string {
  return cmds
    .map((c) => {
      if (c.t === 'M') return `M ${round(c.x)} ${round(c.y)}`
      if (c.t === 'L') return `L ${round(c.x)} ${round(c.y)}`
      if (c.t === 'C') {
        return `C ${round(c.x1)} ${round(c.y1)} ${round(c.x2)} ${round(c.y2)} ${round(c.x)} ${round(c.y)}`
      }
      return 'Z'
    })
    .join(' ')
}

function elementToSvg(el: PrintElement): string {
  switch (el.kind) {
    case 'rect':
      return `<rect ${attrs([
        ['x', el.x], ['y', el.y], ['width', Math.max(0, el.w)], ['height', Math.max(0, el.h)],
        ['rx', el.radius], ['ry', el.radius],
        ['fill', el.fill ?? 'none'], ['stroke', el.stroke], ['stroke-width', el.lineWidth],
        ['stroke-dasharray', el.dash?.join(' ')], ['opacity', el.opacity],
      ])}/>`

    case 'line':
      return `<line ${attrs([
        ['x1', el.x1], ['y1', el.y1], ['x2', el.x2], ['y2', el.y2],
        ['stroke', el.stroke ?? '#000'], ['stroke-width', el.lineWidth ?? 0.3],
        ['stroke-dasharray', el.dash?.join(' ')], ['stroke-linecap', el.cap], ['opacity', el.opacity],
      ])}/>`

    case 'circle':
      return `<circle ${attrs([
        ['cx', el.cx], ['cy', el.cy], ['r', Math.max(0, el.r)],
        ['fill', el.fill ?? 'none'], ['stroke', el.stroke], ['stroke-width', el.lineWidth],
        ['stroke-dasharray', el.dash?.join(' ')], ['opacity', el.opacity],
      ])}/>`

    case 'polygon': {
      const points = el.points.map(([x, y]) => `${round(x)},${round(y)}`).join(' ')
      const tag = el.closed === false ? 'polyline' : 'polygon'
      return `<${tag} ${attrs([
        ['points', points], ['fill', el.fill ?? 'none'], ['stroke', el.stroke],
        ['stroke-width', el.lineWidth], ['stroke-linejoin', 'round'], ['opacity', el.opacity],
      ])}/>`
    }

    case 'path':
      return `<path ${attrs([
        ['d', pathToD(el.d)], ['fill', el.fill ?? 'none'], ['stroke', el.stroke],
        ['stroke-width', el.lineWidth], ['stroke-dasharray', el.dash?.join(' ')],
        ['stroke-linejoin', 'round'], ['stroke-linecap', 'round'], ['opacity', el.opacity],
      ])}/>`

    case 'text': {
      const anchor = el.align === 'center' ? 'middle' : el.align === 'right' ? 'end' : 'start'
      const width = el.exactWidth
        ? measureText(el.text, el.size, el.font ?? 'sans', el.weight ?? 'normal', el.style ?? 'normal', el.charSpace ?? 0)
        : undefined
      return `<text ${attrs([
        ['x', el.x], ['y', el.y],
        ['fill', el.color ?? '#111827'],
        ['font-family', CSS_FONT[el.font ?? 'sans']],
        ['font-size', pt2mm(el.size)],
        ['font-weight', el.weight === 'bold' ? 700 : undefined],
        ['font-style', el.style === 'italic' ? 'italic' : undefined],
        ['text-anchor', anchor],
        ['letter-spacing', el.charSpace],
        ['textLength', width && width > 0 ? round(width) : undefined],
        ['lengthAdjust', width ? 'spacingAndGlyphs' : undefined],
        ['opacity', el.opacity],
        // jsPDF rotates counter-clockwise; SVG's positive rotation is clockwise.
        ['transform', el.rotate ? `rotate(${-el.rotate} ${round(el.x)} ${round(el.y)})` : undefined],
        ['xml:space', 'preserve'],
      ])}>${escapeXml(el.text)}</text>`
    }

    default:
      return ''
  }
}

export function pageToSvg(page: PrintPage, width: number, height: number): string {
  const body = page.elements.map(elementToSvg).join('\n  ')
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${round(width)}mm" height="${round(height)}mm" viewBox="0 0 ${round(width)} ${round(height)}">`,
    `  <rect x="0" y="0" width="${round(width)}" height="${round(height)}" fill="#ffffff"/>`,
    `  ${body}`,
    '</svg>',
  ].join('\n')
}

export function docToSvgPages(doc: PrintDoc): string[] {
  return doc.pages.map((page) => pageToSvg(page, doc.width, doc.height))
}
