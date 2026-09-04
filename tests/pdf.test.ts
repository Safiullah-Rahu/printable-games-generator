import { describe, expect, it } from 'vitest'
import { defaultConfigFor } from '../src/engines/config'
import { buildGame } from '../src/engines/pipeline'
import { listGenerators } from '../src/engines/registry'
import { pdfFilename, renderPdf } from '../src/pdf/exportPdf'
import { docToSvgPages, pageToSvg } from '../src/pdf/exportSvg'

/**
 * PDF and SVG export.
 *
 * Confirms every generator survives the trip through jsPDF, that the page count
 * matches the document, that hiding the answer key really removes those pages,
 * and that the output is a real PDF rather than an error string.
 */

function pdfBytes(doc: ReturnType<typeof renderPdf>): Uint8Array {
  return new Uint8Array(doc.output('arraybuffer') as ArrayBuffer)
}

function asText(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString('latin1')
}

describe.each(listGenerators().map((g) => [g.id] as const))('%s export', (id) => {
  it('renders a well-formed PDF', () => {
    const game = buildGame(defaultConfigFor(id, `pdf-${id}`))
    const pdf = renderPdf(game.doc, { title: game.meta.title })
    const bytes = pdfBytes(pdf)
    const text = asText(bytes)

    expect(text.startsWith('%PDF-')).toBe(true)
    expect(text.trimEnd().endsWith('%%EOF')).toBe(true)
    // A blank page is a few hundred bytes; real content is far more.
    expect(bytes.byteLength).toBeGreaterThan(2000)
    expect(pdf.getNumberOfPages()).toBe(game.doc.pages.length)
  })

  it('drops answer-key pages when they are excluded', () => {
    const game = buildGame({ ...defaultConfigFor(id, `pdf-key-${id}`), includeAnswerKey: true })
    const keyPages = game.doc.pages.filter((p) => p.role === 'answerKey').length

    const withKey = renderPdf(game.doc, { includeAnswerKey: true })
    const withoutKey = renderPdf(game.doc, { includeAnswerKey: false })

    expect(withKey.getNumberOfPages()).toBe(game.doc.pages.length)
    expect(withoutKey.getNumberOfPages()).toBe(game.doc.pages.length - keyPages)
  })

  it('serialises every page to valid standalone SVG', () => {
    const game = buildGame(defaultConfigFor(id, `svg-${id}`))
    const pages = docToSvgPages(game.doc)
    expect(pages.length).toBe(game.doc.pages.length)
    for (const svg of pages) {
      expect(svg.startsWith('<svg xmlns="http://www.w3.org/2000/svg"')).toBe(true)
      expect(svg.trimEnd().endsWith('</svg>')).toBe(true)
      // Unescaped ampersands are the classic way to produce unparseable SVG.
      expect(/&(?!amp;|lt;|gt;|quot;|apos;|#)/.test(svg)).toBe(false)
    }
  })
})

describe('pdf metadata and paper sizes', () => {
  it('names the file from the title and seed', () => {
    const game = buildGame(defaultConfigFor('word-search', 'amber-orbit-4821'))
    const name = pdfFilename(game)
    expect(name.endsWith('.pdf')).toBe(true)
    expect(name).toContain('amber-orbit-4821')
    expect(/[\\/:*?"<>|]/.test(name)).toBe(false)
  })

  it('uses the requested paper size and orientation', () => {
    for (const pageSize of ['a4', 'letter'] as const) {
      for (const orientation of ['portrait', 'landscape'] as const) {
        const game = buildGame({
          ...defaultConfigFor('word-search', `paper-${pageSize}-${orientation}`),
          pageSize,
          orientation,
        })
        const pdf = renderPdf(game.doc)
        const { width, height } = pdf.internal.pageSize
        expect(width).toBeCloseTo(game.doc.width, 1)
        expect(height).toBeCloseTo(game.doc.height, 1)
        if (orientation === 'portrait') expect(height).toBeGreaterThan(width)
        else expect(width).toBeGreaterThan(height)
      }
    }
  })

  it('keeps a whole 30-card classroom bingo set under a megabyte', () => {
    const game = buildGame({
      ...defaultConfigFor('math-bingo', 'classroom-set'),
      players: 'classroom',
    })
    const bytes = pdfBytes(renderPdf(game.doc))
    expect(game.doc.pages.length).toBeGreaterThan(10)
    // Vector output; a rasterised equivalent would be tens of megabytes.
    expect(bytes.byteLength).toBeLessThan(1_000_000)
  })

  it('escapes characters that would corrupt an SVG page', () => {
    const svg = pageToSvg(
      {
        label: 'test',
        elements: [
          {
            kind: 'text',
            x: 10,
            y: 10,
            text: 'Tom & Jerry <5> "quoted"',
            size: 10,
            exactWidth: true,
          },
        ],
      },
      210,
      297,
    )
    expect(svg).toContain('Tom &amp; Jerry &lt;5&gt; &quot;quoted&quot;')
  })
})
