import type { FactItem } from './types'

const capitals: Array<[string, string, number]> = [
  ['PARIS', 'France', 1], ['LONDON', 'the United Kingdom', 1], ['ROME', 'Italy', 1],
  ['MADRID', 'Spain', 1], ['BERLIN', 'Germany', 1], ['LISBON', 'Portugal', 2],
  ['ATHENS', 'Greece', 2], ['VIENNA', 'Austria', 2], ['DUBLIN', 'Ireland', 2],
  ['OSLO', 'Norway', 2], ['HELSINKI', 'Finland', 3], ['WARSAW', 'Poland', 3],
  ['PRAGUE', 'the Czech Republic', 3], ['BUDAPEST', 'Hungary', 3], ['BRUSSELS', 'Belgium', 2],
  ['AMSTERDAM', 'the Netherlands', 2], ['STOCKHOLM', 'Sweden', 2], ['COPENHAGEN', 'Denmark', 3],
  ['CAIRO', 'Egypt', 2], ['NAIROBI', 'Kenya', 3], ['ABUJA', 'Nigeria', 4],
  ['ACCRA', 'Ghana', 4], ['RABAT', 'Morocco', 4], ['PRETORIA', 'South Africa', 4],
  ['TOKYO', 'Japan', 1], ['BEIJING', 'China', 1], ['SEOUL', 'South Korea', 2],
  ['BANGKOK', 'Thailand', 2], ['HANOI', 'Vietnam', 3], ['MANILA', 'the Philippines', 3],
  ['JAKARTA', 'Indonesia', 3], ['DELHI', 'India', 2], ['ISLAMABAD', 'Pakistan', 3],
  ['DHAKA', 'Bangladesh', 4], ['KABUL', 'Afghanistan', 4], ['ANKARA', 'Turkey', 3],
  ['CANBERRA', 'Australia', 3], ['WELLINGTON', 'New Zealand', 3], ['OTTAWA', 'Canada', 2],
  ['BRASILIA', 'Brazil', 3], ['LIMA', 'Peru', 3], ['SANTIAGO', 'Chile', 3],
  ['BOGOTA', 'Colombia', 3], ['CARACAS', 'Venezuela', 4], ['QUITO', 'Ecuador', 4],
  ['HAVANA', 'Cuba', 3], ['KINGSTON', 'Jamaica', 4], ['MOSCOW', 'Russia', 2],
  ['KYIV', 'Ukraine', 3], ['BAGHDAD', 'Iraq', 4], ['TEHRAN', 'Iran', 4],
  ['RIYADH', 'Saudi Arabia', 4], ['DOHA', 'Qatar', 4], ['AMMAN', 'Jordan', 4],
]

const rivers: Array<[string, string, number]> = [
  ['NILE', 'the longest river in Africa', 2],
  ['AMAZON', 'the river with the greatest flow, in South America', 2],
  ['DANUBE', 'a river flowing through ten European countries', 4],
  ['THAMES', 'the river running through London', 2],
  ['GANGES', 'a sacred river of northern India', 3],
  ['MEKONG', 'a major river of Southeast Asia', 4],
  ['VOLGA', 'the longest river in Europe', 4],
  ['YANGTZE', 'the longest river in Asia', 3],
  ['SEINE', 'the river running through Paris', 3],
  ['CONGO', 'the deepest river in the world', 4],
  ['RHINE', 'a river flowing from the Alps to the North Sea', 3],
  ['MISSISSIPPI', 'the great river of the central United States', 2],
]

const mountains: Array<[string, string, number]> = [
  ['EVEREST', 'the highest mountain on Earth', 1],
  ['ANDES', 'the longest mountain range on land', 3],
  ['ALPS', 'the mountain range of central Europe', 2],
  ['HIMALAYAS', 'the range containing the world tallest peaks', 3],
  ['KILIMANJARO', 'the highest mountain in Africa', 3],
  ['ROCKIES', 'the great mountain range of western North America', 3],
  ['FUJI', 'the famous volcano of Japan', 2],
  ['ETNA', 'the most active volcano in Europe', 4],
  ['URALS', 'the range dividing Europe from Asia', 4],
]

const landforms: Array<[string, string, number]> = [
  ['ISLAND', 'land completely surrounded by water', 1],
  ['PENINSULA', 'land surrounded by water on three sides', 3],
  ['VALLEY', 'low land lying between hills', 1],
  ['PLATEAU', 'a raised area of flat land', 3],
  ['CANYON', 'a deep gorge cut by a river', 2],
  ['DELTA', 'the fan of land where a river meets the sea', 3],
  ['GLACIER', 'a slow-moving river of ice', 3],
  ['VOLCANO', 'a mountain that can erupt with lava', 1],
  ['DESERT', 'a very dry region with little rainfall', 1],
  ['TUNDRA', 'a cold treeless plain with frozen ground', 4],
  ['SAVANNA', 'a grassland scattered with trees', 3],
  ['ISTHMUS', 'a narrow strip of land joining two larger areas', 5],
  ['ARCHIPELAGO', 'a chain or cluster of islands', 5],
  ['ESTUARY', 'where a river mouth meets the tide', 4],
  ['FJORD', 'a deep sea inlet carved by a glacier', 4],
  ['PRAIRIE', 'a wide open grassland of North America', 3],
]

const oceansSeas: Array<[string, string, number]> = [
  ['PACIFIC', 'the largest ocean on Earth', 1],
  ['ATLANTIC', 'the ocean between the Americas and Europe', 1],
  ['INDIAN', 'the ocean south of Asia', 2],
  ['ARCTIC', 'the smallest and coldest ocean', 2],
  ['SOUTHERN', 'the ocean encircling Antarctica', 3],
  ['MEDITERRANEAN', 'the sea between Europe and Africa', 3],
  ['CARIBBEAN', 'the sea east of Central America', 3],
  ['BALTIC', 'the sea in northern Europe', 4],
  ['CASPIAN', 'the largest inland body of water', 4],
]

const continents: Array<[string, string, number]> = [
  ['ASIA', 'the largest continent by area and population', 1],
  ['AFRICA', 'the continent crossed by the equator and the Sahara', 1],
  ['EUROPE', 'the continent west of the Ural Mountains', 1],
  ['ANTARCTICA', 'the frozen continent at the South Pole', 2],
  ['AUSTRALIA', 'the smallest continent, also a country', 1],
  ['OCEANIA', 'the region of Pacific islands including Australia', 3],
]

const geoTerms: Array<[string, string, number]> = [
  ['EQUATOR', 'the imaginary line around the middle of Earth', 2],
  ['LATITUDE', 'lines measuring distance north or south of the equator', 3],
  ['LONGITUDE', 'lines measuring distance east or west of Greenwich', 3],
  ['COMPASS', 'the instrument that shows direction', 1],
  ['ATLAS', 'a book of maps', 2],
  ['CLIMATE', 'the usual weather pattern of a region', 2],
  ['HEMISPHERE', 'one half of the globe', 3],
  ['TROPICS', 'the warm zone either side of the equator', 3],
  ['CAPITAL', 'the city where a country government sits', 1],
  ['BORDER', 'the line separating two countries', 1],
  ['POPULATION', 'the number of people living in a place', 2],
  ['EROSION', 'the wearing away of land by wind or water', 3],
  ['MONSOON', 'a seasonal wind bringing heavy rain', 4],
  ['TIMEZONE', 'a region sharing the same standard clock time', 4],
]

function build(rows: Array<[string, string, number]>, category: string, clueFn: (c: string) => string): FactItem[] {
  return rows.map(([term, clue, tier]) => ({
    term,
    clue: clueFn(clue),
    category,
    subject: 'geography' as const,
    tier,
  }))
}

export const GEOGRAPHY_FACTS: FactItem[] = [
  ...build(capitals, 'capitals', (c) => `Capital city of ${c}`),
  ...build(rivers, 'rivers', (c) => `The river known as ${c}`),
  ...build(mountains, 'mountains', (c) => `Mountain or range: ${c}`),
  ...build(landforms, 'landforms', (c) => `Landform: ${c}`),
  ...build(oceansSeas, 'oceans', (c) => `Body of water: ${c}`),
  ...build(continents, 'continents', (c) => `Continent: ${c}`),
  ...build(geoTerms, 'geography-terms', (c) => c[0].toUpperCase() + c.slice(1)),
]
