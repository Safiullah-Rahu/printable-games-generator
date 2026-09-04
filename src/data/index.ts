import type { Subject, ThemeId } from '../types'
import { ENGLISH_FACTS, VOCABULARY_FACTS } from './english'
import { GEOGRAPHY_FACTS } from './geography'
import { HISTORY_FACTS } from './history'
import { GENERAL_FACTS, LOGIC_FACTS, MATH_FACTS } from './misc-subjects'
import { SCIENCE_FACTS } from './science'
import type { FactItem } from './types'

export * from './types'
export { LOGIC_RIDDLES } from './misc-subjects'

/** Every fact, indexed by subject. */
export const FACTS_BY_SUBJECT: Record<Subject, FactItem[]> = {
  mathematics: MATH_FACTS,
  english: ENGLISH_FACTS,
  science: SCIENCE_FACTS,
  geography: GEOGRAPHY_FACTS,
  history: HISTORY_FACTS,
  'general-knowledge': GENERAL_FACTS,
  logic: LOGIC_FACTS,
  vocabulary: VOCABULARY_FACTS,
}

export const ALL_FACTS: FactItem[] = Object.values(FACTS_BY_SUBJECT).flat()

/**
 * Theme word banks. Used by grid puzzles when the chosen theme should colour the
 * content as well as the styling - a Space-themed word search on a General
 * Knowledge sheet should still be full of rockets.
 */
export const THEME_WORDS: Record<ThemeId, string[]> = {
  minimal: [],
  classroom: [
    'PENCIL', 'RULER', 'ERASER', 'NOTEBOOK', 'TEACHER', 'LESSON', 'HOMEWORK', 'CRAYON',
    'BACKPACK', 'CHALK', 'DESK', 'LIBRARY', 'PROJECT', 'READING', 'SCIENCE', 'RECESS',
  ],
  fun: [
    'BALLOON', 'CONFETTI', 'LAUGHTER', 'PUZZLE', 'CIRCUS', 'JUGGLE', 'CARNIVAL', 'RIDDLE',
    'SURPRISE', 'GIGGLE', 'PARTY', 'STICKER', 'RAINBOW', 'BUBBLE', 'JOKE', 'PRIZE',
  ],
  space: [
    'ROCKET', 'PLANET', 'COMET', 'GALAXY', 'ORBIT', 'ASTRONAUT', 'METEOR', 'NEBULA',
    'SATURN', 'JUPITER', 'ECLIPSE', 'CRATER', 'TELESCOPE', 'GRAVITY', 'LAUNCH', 'COSMOS',
    'STARDUST', 'MOONBASE', 'SHUTTLE', 'ASTEROID',
  ],
  adventure: [
    'COMPASS', 'TREASURE', 'JUNGLE', 'SUMMIT', 'CANYON', 'EXPLORE', 'MAPS', 'TRAIL',
    'CAMPFIRE', 'LANTERN', 'RAPIDS', 'BOULDER', 'SAFARI', 'VOYAGE', 'ROPE', 'QUEST',
  ],
  animals: [
    'TIGER', 'PANDA', 'FALCON', 'OTTER', 'BADGER', 'IGUANA', 'WALRUS', 'MONKEY',
    'ZEBRA', 'RABBIT', 'PARROT', 'BEAVER', 'CAMEL', 'LEMUR', 'MOOSE', 'HERON',
    'GECKO', 'BISON', 'SEAL', 'FOX',
  ],
  ocean: [
    'CORAL', 'DOLPHIN', 'LAGOON', 'ANCHOR', 'SEAWEED', 'CURRENT', 'STARFISH', 'TIDE',
    'HARBOR', 'SHRIMP', 'WHALE', 'PEARL', 'REEF', 'WAVES', 'SAILOR', 'PLANKTON',
    'TURTLE', 'MARLIN', 'KELP', 'ISLAND',
  ],
  fantasy: [
    'DRAGON', 'WIZARD', 'CASTLE', 'POTION', 'GRIFFIN', 'SPELL', 'KNIGHT', 'GOBLIN',
    'ENCHANT', 'CRYSTAL', 'SCROLL', 'PHOENIX', 'UNICORN', 'TOWER', 'RUNES', 'QUEST',
  ],
  sports: [
    'SOCCER', 'TENNIS', 'HOCKEY', 'RELAY', 'HURDLE', 'DRIBBLE', 'RACKET', 'MEDAL',
    'STADIUM', 'COACH', 'SPRINT', 'ARCHERY', 'CYCLING', 'ROWING', 'REFEREE', 'TROPHY',
  ],
  seasonal: [
    'SNOWFLAKE', 'PUMPKIN', 'BLOSSOM', 'HARVEST', 'MITTENS', 'SLEIGH', 'TULIP', 'AUTUMN',
    'WINTER', 'SUMMER', 'SPRING', 'FROST', 'LANTERN', 'GARLAND', 'CANDLE', 'FEAST',
  ],
}

/**
 * Theme words wrapped as facts so themed content can flow into clue-based games
 * too. The clue is deliberately generic - these exist to add flavour, and any
 * generator needing a real definition filters on `category !== 'theme'`.
 */
export function themeFacts(theme: ThemeId): FactItem[] {
  return THEME_WORDS[theme].map((word) => ({
    term: word,
    clue: `Themed word (${theme}), ${word.length} letters`,
    category: 'theme',
    subject: 'general-knowledge' as const,
    tier: word.length <= 6 ? 2 : 3,
  }))
}
