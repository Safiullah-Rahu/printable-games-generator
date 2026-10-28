# Launch captions

Attach `renders/launch-video_*.mp4` (1920 × 1080, 32 s, silent).

---

## LinkedIn

Teachers spend real time hunting for worksheets that match the class they
actually have. This builds them instead.

Printable Games Generator turns a few choices — game type, grade, difficulty,
theme — into a complete, print-ready classroom game: the sheet, the
instructions, the solution grid and the answer key, exported as a vector PDF.
Eighteen generators cover word search, crossword, sudoku, logic puzzles, maths
mazes, bingo, quiz and flash card decks, memory tiles, a roll-and-move board
game and team trivia.

The engineering problem was not "generate a worksheet". It was generating
thousands of them that are all correct and all print properly, without a person
checking each one. Three ideas do that work.

**One geometric document, three renderers.** Generators emit a typed drawing
model in millimetres rather than HTML. An SVG renderer draws the preview, a
print surface handles the browser, and a third writes the PDF — so the preview
is what prints, and a 30-card bingo set is a 26 KB vector file with selectable
text rather than a multi-megabyte image.

**Nothing broken reaches the page.** Every generator validates its own output,
and the finished document is validated again for geometry: elements off the
page, text wider than the box it was given, type too small to read. Only a
document that passes both is shown.

**Answers are proved, not asserted.** Every generated maths problem carries an
expression that re-derives its own answer, and a separate evaluator checks the
two agree. The test suite runs this over 37,800 problems. The same rigour
applies to puzzles — sudoku only removes a cell while a solver confirms the
solution stays unique, and the logic-puzzle generator adds clues until a
constraint solver reports exactly one answer, then strips every clue that is not
load-bearing.

It runs entirely on the device. No backend, no account, and no network request
at all unless someone chooses to add their own API key for the optional content
layer. Load it once and it keeps working with the connection off.

React, TypeScript, Vite, Tailwind and jsPDF. 297 tests. Free and open source.

printable-games-generator.vercel.app
github.com/Safiullah-Rahu/printable-games-generator

---

## X / Twitter

Printable Games Generator — a browser app that builds complete, print-ready
classroom games: the sheet, the instructions, the solution grid and the answer
key, as a vector PDF.

18 generators. Every maths answer is re-derived by a separate evaluator and
dropped if it does not check out — 37,800 of them verified in CI. Sudoku and
logic puzzles are solver-checked to have exactly one solution.

No backend, no account, no network request. Load it once and it works offline.

printable-games-generator.vercel.app

---

## Short form (one line, for a reply or a portfolio card)

A printable-game factory that runs entirely in the browser: pick a game type, a
grade and a difficulty, and it builds the sheet, the instructions and the answer
key as a print-ready PDF. 18 generators, every answer independently verified,
no account and no connection needed.

---

## Alt text for the video

Screen recording of a web app. A sticky note reading "Gr 4 · maths" lifts off a
desk to reveal a blank sheet, which becomes the Printable Games Generator
interface. A word search is chosen from a filtered list, the sheet builds in the
preview, and its answer key is opened and shown close enough to read. Three
printed pages fan out onto the desk beside the line "Every answer is checked
before it prints."

---

## Notes before posting

- The film is silent by design — there was no music source available when it was
  built. Adding a bed later is one `<audio>` tag in `index.html`; see SPEC.md.
- Every frame of the product is a real screenshot from one session, so the
  letter grid, the rail numbers and the answer key all belong to the same
  generated game. Nothing in it is a mockup.
- Claims used above that trace to the repository: 18 generators, 297 tests,
  37,800 verified problems, 26 KB bingo PDF, zero network requests without a
  key. Keep them as written or re-check them before changing.
