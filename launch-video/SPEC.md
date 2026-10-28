# SPEC — Period Three

GOAL: a teacher thinks "that would have saved me an hour last night", and
remembers that it writes the answer key too and needs no connection.

OUTPUT: HyperFrames, 1920 × 1080, 30 fps.

TIME: 32.4 s × 30 fps = 972 frames. No music source in this environment, so no
BPM grid; cuts are timed to the actions instead. Scene spans: desk 0–204,
app 204–585, payoff 585–870, end card 870–972.

LOOK — the product's own material, not a chosen palette:

- **Ground** `#EFEDE8` (the app's `--canvas`), carrying the app's own dot grid:
  `radial-gradient(#D2CCC0 1px, transparent 1px)` at `22px` spacing, 55 % alpha.
  Never a dark void, never a gradient.
- **Ink** `#16140F` (`--ink`), secondary `#6A6458` (`--ink-muted`).
- **Accent** `#4F46E5`, allowed in exactly four places: the selected game card
  (the product's own state), the Download button (ditto), one word of the claim,
  and the end-card mark. Nowhere else.
- **Type** Inter, the app's own face. Display 900 at 96 px, tracking −0.03em.
  Sub 700 at 38 px. Body 400 at 30 px. Nothing readable under 28 px.
- **Medium: paper and ink.** Sheets are lifted, slid and stacked — never faded.
  Every sheet carries the app's own contact shadow,
  `0 1px 2px rgb(28 25 20 / .12), 0 18px 48px -20px rgb(28 25 20 / .45)`.
- **Depth** grain 2.5 % on the desk world only; no vignette, no glow, no bloom.

OBJECTS:

- **Sticky note** 460 × 420 px, `#F2D16B`, rotated −2.5°, a 6 px darker fold
  strip along its top edge, contact shadow at 18 px blur. It reads as paper
  because it has a fold and a shadow, not because it is a yellow square.
- **Blank sheet** A4 proportion (1 : 1.414), white, same contact shadow.
- **App window** the real screenshots in `assets/ui/`, 1600 × 1000 CSS captured
  at 2×, shown at 1.0–1.9× so no label falls under 28 px.
- **Cursor** 58 px tall (5.4 % of frame height), ink-coloured arrow with a 2 px
  white outline so it reads on both paper and UI. Enters from off-frame; its
  click causes the next thing on the same frame.
- **Mark** `assets/brand/favicon.svg`, the product's own file.

MOTION:

- enter `power3.out` 14 f · move `power2.inOut` 16 f · exit `power3.in` 10 f ·
  camera `power2.inOut` 16 f (0.53 s), inside the reference's 0.4–0.6 s.
- Paper lifts overshoot: scale 1.0 → 1.035 → 1.0, 20 f.
- Stagger 3 f between sheets in a fan; secondary moves travel 60 % as far and
  start 4 f after the hero move.
- One hero move per shot; everything else holds.

SHOTS (frames at 30 fps):

| #  | Frames  | Hero move | Reads | Hands off by |
| -- | ------- | --------- | ----- | ------------ |
| 1  | 0–39    | the note settles, 12 f | "Gr 4 · maths" / "Thurs · period 3" | the note lifting |
| 2  | 39–138  | the note lifts out, revealing a blank sheet | "11:42 pm", "Still nothing for period three" | the blank sheet |
| 3  | 138–204 | the sheet scales into the window, 23 f | "Printable Games Generator", on paper, before any UI | the white rectangle |
| 4  | 204–252 | the interface paints onto it, bottom up | the whole product | the panel |
| 5  | 252–296 | camera into the panel, 18 f | real labels at ≥ 29 px | the cursor |
| 6  | 296–396 | "word" narrows the list; the click turns the card indigo | "Word Search", "Crossword" | the selected card |
| 7  | 396–450 | camera pulls back, 22 f | the sheet now in the preview | the sheet |
| 8  | 450–510 | camera pushes into the sheet, 20 f | "Grade 4 · Medium · 3 pages" | the page tabs |
| 9  | 510–546 | page three: the sheet becomes the answer key | the page visibly changes | the answer key |
| 10 | 546–585 | pull back; the cursor reaches the real Download button | the product entire | the click |
| 11 | 585–693 | three pages leave the preview and fan onto the desk | "Game · Solution grid · Answer key" | the third page |
| 12 | 693–762 | that page comes up to 3.2×, one object not a copy | the real answers, ≥ 28 px | the page returning |
| 13 | 762–828 | back down to the stack | — | the pages rising |
| 14 | 828–870 | the pages make room; the claim wipes in | "Every answer is checked before it prints." | the mark |
| 15 | 870–972 | the mark is carried in; the wordmark wipes in beside it | name, URL, held 2.5 s | — |

BANNED: a dark void with small UI floating in it; glow, bloom, particles; glass
cards; mesh gradients; three cards in a row; a title over a dimmed screenshot;
everything fading and sliding up; titles that drift after they land; the logo
docked in a corner; serif display with italic accent words and "01 / 02" labels;
an invented dashboard or any button the product does not have; product UI tilted
in 3D.

SOUND: **silent.** There is no music source in this environment (no HeyGen
sign-in, no local model), and the reference says to ship silent rather than
synthesise a bed. Intended bed: a calm room tone with a slow marimba pulse,
paper and click effects only on the real actions.

QA — frames to check and what each must show:

- f12 — the note reads and is not centred; the frame is the thumbnail.
- f100 — "11:42 pm" and the blank sheet, no app yet.
- f150 — mid-morph: one object changing shape, not a cross-fade between two.
- **f204 — the seam.** The white rectangle must be identical either side of the
  desk → app cut, or the morph reads as a jump.
- f330 — the selected card is indigo, the cursor is on it, and that card and the
  Download button are the only accent on screen.
- f465 — the sheet, with the config line centred under it and clear of the panel.
- **f585 — the seam.** The window must be identical either side of the
  app → payoff cut.
- f735 — the answer key's own text readable at ≥ 28 px, from the same seed as
  every other sheet in the film.
- f840 — the claim over the stack, accent on one word only.
- f900 — the mark at 15 % of frame width, the URL readable.

ASSETS: every frame of the product is a real screenshot captured in one browser
session (`seed meadow-coral-2333`), so the letter grid, the rail numbers and the
answer key all belong to the same generated game. Nothing is composited from two
states the app never showed at once.
