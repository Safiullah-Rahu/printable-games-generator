import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { defaultConfigFor } from '../src/engines/config'
import { buildGame } from '../src/engines/pipeline'
import { renderPdf } from '../src/pdf/exportPdf'
import { docToSvgPages } from '../src/pdf/exportSvg'
import type { GameConfig } from '../src/types'

/**
 * Sample sheet generation - the visual-inspection harness.
 *
 * By default this only asserts that one representative sheet per game type
 * builds. Set SAMPLE_DIR and/or PDF_DIR to also write the files out so they can
 * be opened and eyeballed:
 *
 *   SAMPLE_DIR=./out PDF_DIR=./out npx vitest run tests/samples.test.ts
 */

const SVG_OUT = process.env.SAMPLE_DIR
const PDF_OUT = process.env.PDF_DIR

const SAMPLES: Array<{ name: string; config: Partial<GameConfig> & { gameType: string } }> = [
  { name: 'word-search', config: { gameType: 'word-search', subject: 'geography', grade: '5', theme: 'ocean', itemCount: 16 } },
  { name: 'crossword', config: { gameType: 'crossword', subject: 'science', grade: '6', theme: 'space', itemCount: 14 } },
  { name: 'math-bingo', config: { gameType: 'math-bingo', grade: '5', players: '3-4', theme: 'fun', mathTopic: 'multiplication' } },
  { name: 'number-bingo', config: { gameType: 'number-bingo', grade: '2', players: '2', theme: 'seasonal' } },
  { name: 'math-maze', config: { gameType: 'math-maze', grade: '4', theme: 'adventure', itemCount: 8 } },
  { name: 'sudoku', config: { gameType: 'sudoku', grade: '7', theme: 'minimal', itemCount: 2 } },
  { name: 'quiz-cards', config: { gameType: 'quiz-cards', subject: 'science', grade: '6', theme: 'classroom', itemCount: 12 } },
  { name: 'flash-cards', config: { gameType: 'flash-cards', grade: '3', theme: 'animals', mathTopic: 'multiplication', itemCount: 16 } },
  { name: 'memory-cards', config: { gameType: 'memory-cards', subject: 'science', grade: '4', theme: 'animals', itemCount: 12 } },
  { name: 'challenge-cards', config: { gameType: 'challenge-cards', subject: 'english', grade: '5', theme: 'fun', itemCount: 12 } },
  { name: 'board-game', config: { gameType: 'board-game', subject: 'general-knowledge', grade: '5', theme: 'fantasy' } },
  { name: 'trivia-game', config: { gameType: 'trivia-game', subject: 'history', grade: '8', theme: 'adventure', itemCount: 18 } },
  { name: 'logic-puzzle', config: { gameType: 'logic-puzzle', grade: '7', theme: 'seasonal' } },
  { name: 'coordinate-grid', config: { gameType: 'coordinate-grid', grade: '6', theme: 'space' } },
  { name: 'number-puzzle', config: { gameType: 'number-puzzle', grade: '4', theme: 'sports', itemCount: 4 } },
  { name: 'sequence-puzzle', config: { gameType: 'sequence-puzzle', grade: '6', theme: 'minimal', itemCount: 12 } },
  { name: 'matching-game', config: { gameType: 'matching-game', subject: 'geography', grade: '5', theme: 'classroom', itemCount: 10 } },
  { name: 'equation-matching', config: { gameType: 'equation-matching', grade: '5', theme: 'ocean', itemCount: 12 } },
]

describe('representative sheets', () => {
  if (SVG_OUT) mkdirSync(SVG_OUT, { recursive: true })
  if (PDF_OUT) mkdirSync(PDF_OUT, { recursive: true })

  it.each(SAMPLES.map((s) => [s.name, s] as const))('%s builds a complete sheet', (name, sample) => {
    const config = { ...defaultConfigFor(sample.config.gameType, `sample-${name}`), ...sample.config } as GameConfig
    const game = buildGame(config)

    expect(game.validation.ok).toBe(true)
    expect(game.doc.pages.length).toBeGreaterThan(0)

    const svgPages = docToSvgPages(game.doc)
    if (SVG_OUT) {
      svgPages.forEach((svg, i) => writeFileSync(join(SVG_OUT, `${name}-p${i + 1}.svg`), svg, 'utf8'))
    }
    if (PDF_OUT) {
      const pdf = renderPdf(game.doc, { title: game.meta.title })
      writeFileSync(join(PDF_OUT, `${name}.pdf`), Buffer.from(pdf.output('arraybuffer') as ArrayBuffer))
    }
  })
})
