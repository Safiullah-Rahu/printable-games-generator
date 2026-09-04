import type { FactItem } from './types'

type Row = [string, string, number]

const civilizations: Row[] = [
  ['EGYPT', 'the civilisation of pharaohs and pyramids along the Nile', 1],
  ['ROME', 'the empire ruled from a city on seven hills', 1],
  ['GREECE', 'the civilisation that founded democracy and the Olympics', 1],
  ['MAYA', 'the Mesoamerican civilisation known for step pyramids', 3],
  ['AZTEC', 'the empire centred on Tenochtitlan', 3],
  ['INCA', 'the Andean empire that built Machu Picchu', 3],
  ['VIKINGS', 'Norse seafarers who raided and traded across Europe', 2],
  ['PERSIA', 'the ancient empire ruled by Cyrus and Darius', 4],
  ['BABYLON', 'the Mesopotamian city famed for hanging gardens', 4],
  ['SPARTA', 'the Greek city-state known for its warriors', 3],
  ['CARTHAGE', 'the North African rival of Rome', 5],
  ['SUMER', 'the earliest known civilisation, in Mesopotamia', 5],
]

const figures: Row[] = [
  ['CLEOPATRA', 'the last active pharaoh of ancient Egypt', 3],
  ['NEWTON', 'the scientist who described gravity and motion', 2],
  ['CURIE', 'the scientist who won Nobel Prizes in two sciences', 3],
  ['GANDHI', 'the leader of non-violent Indian independence', 3],
  ['MANDELA', 'the anti-apartheid leader who became president', 3],
  ['LINCOLN', 'the president during the American Civil War', 3],
  ['DARWIN', 'the naturalist who proposed evolution by natural selection', 3],
  ['EDISON', 'the inventor associated with the light bulb', 2],
  ['GALILEO', 'the astronomer who improved the telescope', 3],
  ['SHAKESPEARE', 'the playwright who wrote Hamlet', 2],
  ['COLUMBUS', 'the navigator who crossed the Atlantic in 1492', 2],
  ['MAGELLAN', 'the explorer whose expedition first circled the globe', 4],
  ['NIGHTINGALE', 'the nurse who reformed hospital care', 3],
  ['ARCHIMEDES', 'the Greek mathematician of the lever and buoyancy', 4],
  ['TUBMAN', 'the abolitionist who guided people to freedom', 4],
  ['EINSTEIN', 'the physicist who developed relativity', 2],
]

const events: Row[] = [
  ['RENAISSANCE', 'the rebirth of art and learning in Europe', 3],
  ['REVOLUTION', 'a complete overthrow of a government or system', 2],
  ['CRUSADES', 'the medieval religious wars over the Holy Land', 4],
  ['REFORMATION', 'the sixteenth-century split in Western Christianity', 4],
  ['INDEPENDENCE', 'freedom from the rule of another country', 2],
  ['ARMISTICE', 'the agreement that ended fighting in 1918', 4],
  ['DEPRESSION', 'the worldwide economic collapse of the 1930s', 4],
  ['MOON LANDING', 'the 1969 mission that first walked on the Moon', 2],
  ['PLAGUE', 'the deadly disease that swept medieval Europe', 3],
  ['EXPLORATION', 'the age when Europeans mapped distant coasts', 3],
]

const inventions: Row[] = [
  ['WHEEL', 'the ancient invention that made carts possible', 1],
  ['COMPASS', 'the invention that let sailors find north', 2],
  ['PRINTING', 'the invention that spread books widely', 2],
  ['TELEPHONE', 'the invention that carried voices down a wire', 2],
  ['AEROPLANE', 'the machine first flown by the Wright brothers', 2],
  ['PENICILLIN', 'the mould-based medicine found by Fleming', 4],
  ['STEAM ENGINE', 'the machine that powered the Industrial Revolution', 3],
  ['INTERNET', 'the global network linking computers', 2],
  ['VACCINE', 'the medical advance that prevents disease', 3],
  ['TELEGRAPH', 'the system that sent messages in code down wires', 4],
]

const terms: Row[] = [
  ['MONARCHY', 'rule by a king or queen', 2],
  ['DEMOCRACY', 'a system where people vote for their leaders', 2],
  ['EMPIRE', 'a group of lands ruled by one power', 2],
  ['TREATY', 'a formal agreement between countries', 3],
  ['DYNASTY', 'a line of rulers from one family', 3],
  ['ARCHAEOLOGY', 'the study of the past through what people left behind', 3],
  ['ARTEFACT', 'an object made by people long ago', 3],
  ['CENTURY', 'a period of one hundred years', 1],
  ['DECADE', 'a period of ten years', 1],
  ['MEDIEVAL', 'belonging to the Middle Ages', 3],
  ['PARLIAMENT', 'the body that debates and makes laws', 3],
  ['CONSTITUTION', 'the document setting out how a state is run', 4],
  ['CHRONICLE', 'a written record of events in order', 4],
  ['PRIMARY SOURCE', 'evidence created at the time being studied', 4],
]

function build(rows: Row[], category: string, prefix: string): FactItem[] {
  return rows.map(([term, clue, tier]) => ({
    term,
    clue: `${prefix}${clue}`,
    category,
    subject: 'history' as const,
    tier,
  }))
}

export const HISTORY_FACTS: FactItem[] = [
  ...build(civilizations, 'civilizations', 'Civilisation: '),
  ...build(figures, 'figures', 'Who was it: '),
  ...build(events, 'events', 'Event or era: '),
  ...build(inventions, 'inventions', 'Invention: '),
  ...build(terms, 'history-terms', 'History term: '),
]
