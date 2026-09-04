import type { GameGenerator } from '../types'
import { mathBingoGenerator, numberBingoGenerator } from './bingo'
import { boardGameGenerator } from './boardGame'
import { challengeCardsGenerator, flashCardsGenerator, memoryCardsGenerator, quizCardsGenerator } from './cards'
import { coordinateGridGenerator } from './coordinateGrid'
import { crosswordGenerator } from './crossword'
import { logicPuzzleGenerator } from './logicPuzzle'
import { equationMatchingGenerator, matchingCardsGenerator } from './matching'
import { mathMazeGenerator } from './mathMaze'
import { numberPuzzleGenerator } from './numberPuzzle'
import { sequencePuzzleGenerator } from './sequencePuzzle'
import { sudokuGenerator } from './sudoku'
import { triviaGameGenerator } from './triviaGame'
import { wordSearchGenerator } from './wordSearch'

/**
 * The generator manifest.
 *
 * ADDING A GAME: write `src/generators/myGame.ts` exporting an object that
 * satisfies `GameGenerator`, import it here, and add it to this array. Nothing
 * else in the app needs to change - the picker, the config panel, the preview,
 * the PDF exporter and the history all read from this list. Full walkthrough in
 * docs/ADDING_GAMES.md.
 */
export const GENERATORS: GameGenerator<any>[] = [
  // Mathematics
  mathBingoGenerator,
  numberBingoGenerator,
  mathMazeGenerator,
  equationMatchingGenerator,
  numberPuzzleGenerator,
  sequencePuzzleGenerator,
  coordinateGridGenerator,

  // Words & literacy
  wordSearchGenerator,
  crosswordGenerator,

  // Puzzles & logic
  sudokuGenerator,
  logicPuzzleGenerator,
  matchingCardsGenerator,

  // Cards
  quizCardsGenerator,
  flashCardsGenerator,
  memoryCardsGenerator,
  challengeCardsGenerator,

  // Board & trivia
  boardGameGenerator,
  triviaGameGenerator,
]

export * from './bingo'
export * from './boardGame'
export * from './cards'
export * from './coordinateGrid'
export * from './crossword'
export * from './logicPuzzle'
export * from './matching'
export * from './mathMaze'
export * from './numberPuzzle'
export * from './promptSource'
export * from './sequencePuzzle'
export * from './sudoku'
export * from './triviaGame'
export * from './wordSearch'
