import type { FactItem } from './types'

type Row = [string, string, number]

/** Synonym pairs: term is the answer, clue names the prompt word. */
const synonyms: Row[] = [
  ['HAPPY', 'glad', 1], ['BIG', 'large', 1], ['SMALL', 'tiny', 1], ['FAST', 'quick', 1],
  ['COLD', 'chilly', 1], ['ANGRY', 'cross', 1], ['BRAVE', 'fearless', 2], ['CALM', 'peaceful', 2],
  ['CLEVER', 'smart', 1], ['DIFFICULT', 'hard', 2], ['EASY', 'simple', 1], ['BEGIN', 'start', 1],
  ['FINISH', 'complete', 2], ['SHOUT', 'yell', 1], ['QUIET', 'silent', 1], ['STRANGE', 'odd', 2],
  ['ANCIENT', 'very old', 3], ['ENORMOUS', 'huge', 2], ['DELICATE', 'fragile', 3],
  ['GENEROUS', 'giving', 3], ['HONEST', 'truthful', 2], ['RAPID', 'swift', 3],
  ['STURDY', 'strong', 3], ['WEARY', 'tired', 3], ['VIVID', 'bright and clear', 4],
  ['ABUNDANT', 'plentiful', 4], ['RELUCTANT', 'unwilling', 4], ['METICULOUS', 'very careful', 5],
  ['CANDID', 'openly frank', 5], ['LUCID', 'clearly expressed', 5], ['TENACIOUS', 'persistent', 5],
]

const antonyms: Row[] = [
  ['HOT', 'cold', 1], ['UP', 'down', 1], ['DAY', 'night', 1], ['OPEN', 'closed', 1],
  ['EARLY', 'late', 1], ['FULL', 'empty', 1], ['HEAVY', 'light', 1], ['ROUGH', 'smooth', 2],
  ['ANCIENT', 'modern', 3], ['ARRIVE', 'depart', 2], ['EXPAND', 'shrink', 3],
  ['ACCEPT', 'reject', 3], ['ASCEND', 'descend', 4], ['SCARCE', 'plentiful', 4],
  ['TRANSPARENT', 'opaque', 4], ['TEMPORARY', 'permanent', 4], ['MAXIMUM', 'minimum', 3],
  ['ARTIFICIAL', 'natural', 3], ['CONCEAL', 'reveal', 4], ['HUMBLE', 'arrogant', 4],
]

const grammar: Row[] = [
  ['NOUN', 'a word naming a person, place or thing', 1],
  ['VERB', 'a word showing an action or state', 1],
  ['ADJECTIVE', 'a word describing a noun', 2],
  ['ADVERB', 'a word describing a verb', 2],
  ['PRONOUN', 'a word standing in for a noun', 2],
  ['PREPOSITION', 'a word showing position or relation', 3],
  ['CONJUNCTION', 'a joining word such as and or but', 3],
  ['SENTENCE', 'a complete unit of words with a verb', 1],
  ['PARAGRAPH', 'a group of sentences on one idea', 2],
  ['SYLLABLE', 'a single beat of sound in a word', 2],
  ['PLURAL', 'the form meaning more than one', 1],
  ['APOSTROPHE', 'the mark showing possession or omission', 3],
  ['COMMA', 'the mark showing a short pause', 1],
  ['SUFFIX', 'letters added to the end of a word', 3],
  ['PREFIX', 'letters added to the start of a word', 3],
  ['SYNONYM', 'a word with a similar meaning', 2],
  ['ANTONYM', 'a word with the opposite meaning', 2],
  ['HOMOPHONE', 'a word that sounds the same but differs in meaning', 3],
  ['METAPHOR', 'a comparison stating one thing is another', 4],
  ['SIMILE', 'a comparison using like or as', 3],
  ['ALLITERATION', 'repeating the same starting sound', 4],
  ['PERSONIFICATION', 'giving human traits to objects', 4],
  ['NARRATOR', 'the voice telling a story', 3],
  ['CLAUSE', 'a group of words containing a verb', 4],
  ['PUNCTUATION', 'the marks organising written language', 2],
]

const spelling: Row[] = [
  ['BECAUSE', 'be- _ause: gives a reason', 1],
  ['FRIEND', 'someone you like; remember the i before e', 1],
  ['BEAUTIFUL', 'very pleasing to look at', 2],
  ['NECESSARY', 'needed; one c and two s letters', 4],
  ['SEPARATE', 'to divide apart; there is a rat in it', 3],
  ['RHYTHM', 'a repeated pattern of sound; no true vowels', 4],
  ['DEFINITELY', 'certainly; contains the word finite', 4],
  ['OCCASION', 'a special event; two c letters, one s', 4],
  ['ACCOMMODATE', 'to make room for; two c and two m letters', 5],
  ['EMBARRASS', 'to make someone feel awkward', 5],
  ['CONSCIENCE', 'the inner sense of right and wrong', 5],
  ['MISCHIEVOUS', 'playfully causing trouble', 5],
  ['ENVIRONMENT', 'the surroundings we live in', 3],
  ['GOVERNMENT', 'the body that runs a country', 3],
  ['KNOWLEDGE', 'information and understanding', 3],
  ['QUESTION', 'a sentence asking for information', 1],
  ['ANSWER', 'a reply to a question; silent w', 1],
  ['ISLAND', 'land surrounded by sea; silent s', 2],
  ['WEDNESDAY', 'the day after Tuesday', 2],
  ['FEBRUARY', 'the shortest month', 2],
]

const homophones: Row[] = [
  ['THEIR', 'belonging to them; not there or they are', 2],
  ['WHERE', 'in what place; not wear or ware', 2],
  ['PIECE', 'a part of something; not peace', 2],
  ['WEATHER', 'sun, rain or snow; not whether', 2],
  ['PRINCIPAL', 'the head of a school; not principle', 4],
  ['STATIONERY', 'paper and pens; not stationary', 4],
  ['COMPLIMENT', 'a kind remark; not complement', 4],
  ['ALLOWED', 'permitted; not aloud', 3],
]

const literature: Row[] = [
  ['CHAPTER', 'a main division of a book', 1],
  ['CHARACTER', 'a person in a story', 1],
  ['SETTING', 'where and when a story takes place', 2],
  ['PLOT', 'the sequence of events in a story', 2],
  ['FICTION', 'writing about imagined events', 2],
  ['BIOGRAPHY', 'the life story of a real person', 3],
  ['POETRY', 'writing arranged in verse', 2],
  ['STANZA', 'a group of lines in a poem', 3],
  ['DIALOGUE', 'the spoken words between characters', 3],
  ['CLIMAX', 'the most intense point of a story', 3],
  ['THEME', 'the central idea explored in a text', 3],
  ['GENRE', 'a category of writing such as mystery', 3],
]

function build(rows: Row[], category: string, clueFn: (c: string) => string, tierShift = 0): FactItem[] {
  return rows.map(([term, clue, tier]) => ({
    term,
    clue: clueFn(clue),
    category,
    subject: 'english' as const,
    tier: Math.min(5, tier + tierShift),
  }))
}

export const ENGLISH_FACTS: FactItem[] = [
  ...build(synonyms, 'synonyms', (c) => `A word meaning the same as "${c}"`),
  ...build(antonyms, 'antonyms', (c) => `The opposite of "${c}"`),
  ...build(grammar, 'grammar', (c) => `Grammar: ${c}`),
  ...build(spelling, 'spelling', (c) => `Spell it: ${c}`),
  ...build(homophones, 'homophones', (c) => `Choose correctly: ${c}`),
  ...build(literature, 'literature', (c) => `In writing: ${c}`),
]

/** Vocabulary is exposed separately so the Vocabulary subject can lean on it. */
export const VOCABULARY_FACTS: FactItem[] = [
  ...build(synonyms, 'synonyms', (c) => `A word meaning the same as "${c}"`).map((f) => ({ ...f, subject: 'vocabulary' as const })),
  ...build(antonyms, 'antonyms', (c) => `The opposite of "${c}"`).map((f) => ({ ...f, subject: 'vocabulary' as const })),
  ...[
    ['CURIOUS', 'eager to know or learn', 2],
    ['PATIENT', 'able to wait calmly', 2],
    ['LOYAL', 'faithful and dependable', 2],
    ['CAUTIOUS', 'careful to avoid danger', 3],
    ['DILIGENT', 'showing steady careful effort', 4],
    ['RESILIENT', 'able to recover quickly', 4],
    ['AMBIGUOUS', 'open to more than one meaning', 5],
    ['INEVITABLE', 'certain to happen', 4],
    ['PROFOUND', 'very deep or intense', 4],
    ['SUBTLE', 'delicate and not obvious', 4],
    ['VERSATILE', 'able to adapt to many uses', 4],
    ['OBSOLETE', 'no longer in use', 5],
    ['PRAGMATIC', 'dealing with things practically', 5],
    ['ELOQUENT', 'fluent and persuasive in speech', 5],
    ['NOVICE', 'a person new to an activity', 3],
    ['ABANDON', 'to leave behind completely', 2],
    ['GRATEFUL', 'feeling thankful', 2],
    ['FRAGILE', 'easily broken', 2],
    ['VACANT', 'empty or unoccupied', 3],
    ['GENUINE', 'real and not fake', 3],
  ].map(([term, clue, tier]) => ({
    term: term as string,
    clue: `Means: ${clue as string}`,
    category: 'definitions',
    subject: 'vocabulary' as const,
    tier: tier as number,
  })),
]
