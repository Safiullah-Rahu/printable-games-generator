import { memo, useMemo } from 'react'
import { createPortal } from 'react-dom'
import type { PathCmd, PrintDoc, PrintElement, PrintPage } from '../types'
import { CSS_FONT, measureText, pt2mm } from '../utils/text'

/**
 * SVG renderer for the PrintDoc IR.
 *
 * The preview draws from the same geometry the PDF exporter uses, in the same
 * millimetre coordinate space, so "what you see" really is "what you get". Two
 * details do the heavy lifting:
 *
 *  - the viewBox is the page in mm, so one SVG user unit is one millimetre;
 *  - every multi-character text run is given `textLength` from the PDF's own
 *    font metrics, so a browser whose Helvetica differs slightly from the PDF
 *    base-14 metrics still lays the line out to the identical width.
 */

function pathToD(cmds: PathCmd[]): string {
  return cmds
    .map((c) => {
      if (c.t === 'M') return `M ${c.x} ${c.y}`
      if (c.t === 'L') return `L ${c.x} ${c.y}`
      if (c.t === 'C') return `C ${c.x1} ${c.y1} ${c.x2} ${c.y2} ${c.x} ${c.y}`
      return 'Z'
    })
    .join(' ')
}

function Element({ el, index }: { el: PrintElement; index: number }): JSX.Element | null {
  const key = index

  switch (el.kind) {
    case 'rect':
      return (
        <rect
          key={key}
          x={el.x}
          y={el.y}
          width={Math.max(0, el.w)}
          height={Math.max(0, el.h)}
          rx={el.radius ?? 0}
          ry={el.radius ?? 0}
          fill={el.fill ?? 'none'}
          stroke={el.stroke ?? 'none'}
          strokeWidth={el.lineWidth ?? 0}
          strokeDasharray={el.dash?.join(' ')}
          opacity={el.opacity}
        />
      )

    case 'line':
      return (
        <line
          key={key}
          x1={el.x1}
          y1={el.y1}
          x2={el.x2}
          y2={el.y2}
          stroke={el.stroke ?? '#000'}
          strokeWidth={el.lineWidth ?? 0.3}
          strokeDasharray={el.dash?.join(' ')}
          strokeLinecap={el.cap}
          opacity={el.opacity}
        />
      )

    case 'circle':
      return (
        <circle
          key={key}
          cx={el.cx}
          cy={el.cy}
          r={Math.max(0, el.r)}
          fill={el.fill ?? 'none'}
          stroke={el.stroke ?? 'none'}
          strokeWidth={el.lineWidth ?? 0}
          strokeDasharray={el.dash?.join(' ')}
          opacity={el.opacity}
        />
      )

    case 'polygon': {
      const points = el.points.map(([x, y]) => `${x},${y}`).join(' ')
      const Tag = el.closed === false ? 'polyline' : 'polygon'
      return (
        <Tag
          key={key}
          points={points}
          fill={el.fill ?? 'none'}
          stroke={el.stroke ?? 'none'}
          strokeWidth={el.lineWidth ?? 0}
          strokeLinejoin="round"
          opacity={el.opacity}
        />
      )
    }

    case 'path':
      return (
        <path
          key={key}
          d={pathToD(el.d)}
          fill={el.fill ?? 'none'}
          stroke={el.stroke ?? 'none'}
          strokeWidth={el.lineWidth ?? 0}
          strokeDasharray={el.dash?.join(' ')}
          strokeLinejoin="round"
          strokeLinecap="round"
          opacity={el.opacity}
        />
      )

    case 'text': {
      const anchor = el.align === 'center' ? 'middle' : el.align === 'right' ? 'end' : 'start'
      const width = el.exactWidth
        ? measureText(el.text, el.size, el.font ?? 'sans', el.weight ?? 'normal', el.style ?? 'normal', el.charSpace ?? 0)
        : undefined
      return (
        <text
          key={key}
          x={el.x}
          y={el.y}
          fill={el.color ?? '#111827'}
          fontFamily={CSS_FONT[el.font ?? 'sans']}
          fontSize={pt2mm(el.size)}
          fontWeight={el.weight === 'bold' ? 700 : 400}
          fontStyle={el.style === 'italic' ? 'italic' : undefined}
          textAnchor={anchor}
          letterSpacing={el.charSpace ? el.charSpace : undefined}
          textLength={width && width > 0 ? width : undefined}
          lengthAdjust={width ? 'spacingAndGlyphs' : undefined}
          opacity={el.opacity}
          // jsPDF rotates counter-clockwise; SVG's positive rotation is clockwise.
          transform={el.rotate ? `rotate(${-el.rotate} ${el.x} ${el.y})` : undefined}
          style={{ whiteSpace: 'pre' }}
        >
          {el.text}
        </text>
      )
    }

    default:
      return null
  }
}

export interface PagePreviewProps {
  page: PrintPage
  width: number
  height: number
  /** Rendered width in CSS pixels. */
  pixelWidth?: number
  className?: string
}

export const PagePreview = memo(function PagePreview({
  page,
  width,
  height,
  pixelWidth,
  className,
}: PagePreviewProps): JSX.Element {
  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      width={pixelWidth}
      height={pixelWidth ? (pixelWidth * height) / width : undefined}
      className={className}
      role="img"
      aria-label={page.label}
      style={
        pixelWidth
          ? { display: 'block', background: '#fff' }
          : { display: 'block', background: '#fff', width: '100%', height: '100%' }
      }
    >
      <rect x={0} y={0} width={width} height={height} fill="#ffffff" />
      {page.elements.map((el, i) => (
        <Element key={i} el={el} index={i} />
      ))}
    </svg>
  )
})

export interface DocPreviewProps {
  doc: PrintDoc
  /** Percentage zoom applied to the natural on-screen size. */
  zoom: number
  /** Restrict rendering to one page index. */
  pageIndex?: number
}

/** Scrollable stack of rendered pages. */
export function DocPreview({ doc, zoom, pageIndex }: DocPreviewProps): JSX.Element {
  const pages = useMemo(
    () => (pageIndex === undefined ? doc.pages : [doc.pages[pageIndex]].filter(Boolean)),
    [doc.pages, pageIndex],
  )
  // 3.78 px per mm is 96 dpi - the natural on-screen size of a printed page.
  const pixelWidth = (doc.width * 3.78 * zoom) / 100

  return (
    <div className="flex flex-col items-center gap-6 py-6">
      {pages.map((page, i) => (
        <figure key={`${page.label}-${i}`} className="flex flex-col items-center gap-2">
          <div className="overflow-hidden rounded-sm shadow-page ring-1 ring-slate-900/10">
            <PagePreview page={page} width={doc.width} height={doc.height} pixelWidth={pixelWidth} />
          </div>
          <figcaption className="text-[11px] font-medium uppercase tracking-wider text-slate-500">
            {pageIndex === undefined ? `${i + 1} / ${doc.pages.length}` : `${pageIndex + 1} / ${doc.pages.length}`}
            {' · '}
            {page.label}
          </figcaption>
        </figure>
      ))}
    </div>
  )
}

/**
 * Hidden container used for browser printing. An `@page` rule sized to the
 * document makes the browser lay each SVG onto exactly one physical sheet, with
 * no scaling and no stray margins.
 */
export function PrintSurface({ doc }: { doc: PrintDoc }): JSX.Element | null {
  if (typeof document === 'undefined') return null

  // Rendered into <body> rather than into #root, because the print stylesheet
  // hides the whole app and shows only this surface.
  return createPortal(
    <div className="print-surface" aria-hidden>
      <style>{`
        @media print {
          @page { size: ${doc.width}mm ${doc.height}mm; margin: 0; }
          html, body { margin: 0 !important; padding: 0 !important; background: #fff !important; }
          body > #root { display: none !important; }
          body > .print-surface { display: block !important; }
          .print-surface .print-page { width: ${doc.width}mm; height: ${doc.height}mm; page-break-after: always; break-after: page; overflow: hidden; }
          .print-surface .print-page:last-child { page-break-after: auto; break-after: auto; }
        }
      `}</style>
      {doc.pages.map((page, i) => (
        <div className="print-page" key={`${page.label}-print-${i}`}>
          <PagePreview page={page} width={doc.width} height={doc.height} />
        </div>
      ))}
    </div>,
    document.body,
  )
}
