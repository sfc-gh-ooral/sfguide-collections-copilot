# Design: Calvessa Recovery Desk

The v2 look for the Collections Prioritization Copilot. Calvessa is a fictional product name (a coined word,
not a real firm); the lender in the data stays "Northwind Financial", also fictional.

## Brand

- **Name:** Calvessa Recovery Desk. Product for consumer and auto-loan collections teams: the collector on a
  shift, the team lead running the queue, and the QA lead reviewing calls.
- **Logo mark:** a crescent moon cradling a small rising dot, drawn as inline SVG (`components/Logo.tsx`, the
  same paths in `docs/index.html`). The crescent nods to the pack's first story: borrowers who answer in the
  evening. Two-tone: dusk indigo crescent, ember dot.
- **Voice:** calm, plain and humane. Borrowers are people, not "debtors"; screens say "reach", "help",
  "promise", "hardship". Numbers are exact and sourced. No urgency theatre, no exclamation marks.

## Design direction: "Dusk shift"

Collections work runs into the evening, and this pack's main insight is *when* people answer. The palette
moves from daylight lavender to a dusk sky; the ember accent marks the moments that matter (best time to
reach, a promise made).

### Palette (tokens in `app/globals.css`, exposed to Tailwind with `@theme`)

| Token | Light | Dark | Use |
| --- | --- | --- | --- |
| `canvas` | `#F5F3FA` | `#100D1C` | Page background (lavender mist / night) |
| `surface` | `#FFFFFF` | `#191529` | Panels, tables |
| `surface-2` | `#EEEBF6` | `#231E37` | Wells, table header, tracks |
| `line` | `#DEDAEA` | `#332D4B` | Borders, grid lines |
| `ink` | `#1C1830` | `#ECE9F7` | Primary text |
| `ink-2` | `#5A5470` | `#ABA5C2` | Secondary text |
| `dusk` | `#4B3FA8` | `#A99DF7` | Brand, primary actions, active nav, series 1, focus ring |
| `ember` | `#A3460F` | `#F4A672` | Accent: best contact window, AI, series 2 |
| `cure` | `#15734D` | `#5BD39A` | Cured, kept, eligible, reached |
| `caution` | `#8F5A00` | `#F0BE5A` | Near limit, broken once, watch |
| `roll` | `#B42345` | `#FF7D98` | Roll risk, broken promise, high-risk call |
| `sample` | `#6B4BB8` | `#C3AEFF` | "Sample AI response" and Sample badge |
| Dusk gradient | `#2A2060 → #6A4FB8 → #E58F5C` | same | Page header band and landing hero only |

Contrast is checked by `scripts/check-contrast.mjs`: every text token passes WCAG AA (4.5:1) on `canvas`,
`surface` and on its own 13% tinted pill, in both themes.

### Typography

- **Bricolage Grotesque** (600/700) for headings, KPI figures and the wordmark: warm, slightly irregular,
  nothing like the condensed or geometric faces other packs use.
- **Figtree** (400–700) for UI text; tabular figures via `font-variant-numeric: tabular-nums`.
- **JetBrains Mono** for account IDs, transcript IDs, SQL.
- All self-hosted with `next/font` at build time (SIL Open Font License). The landing page reuses the same
  woff2 files from `docs/fonts/` with the license. No font CDN.

### Layout model: the agent desktop

- **Top bar, not a sidebar.** Logo and wordmark, four tabs (Portfolio, Today's queue, Call QA, Ask), a
  **shift meter** (queue worked today, calls remaining under the contact limit), the role chip
  ("Maren Holt · Collections lead", fictional) and the Sample/Live environment badge. On phones the tabs
  move to a horizontal scroller under the bar.
- **Dusk band:** each page opens with a short gradient band holding the title, business date and the
  capability chips; the content panels overlap its bottom edge.
- **Worklist + workspace:** Today's queue is a ranked worklist; selecting a row opens a right-hand drawer with
  the plan, offer, limit and promise history, with a link to the full account workspace. On phones the drawer
  is a bottom sheet.
- **Account workspace:** a profile header, a timeline rail (payments, promises, contacts, calls on one
  chronological line) and a sticky right column with the AI conversation guide and actions.
- **Density:** comfortable for collectors (40 px table rows, 14 px body), compact KPI tiles.

### Charts

Recharts with custom tooltips (surface card, colored key dots, formatted values) and legends. Series colors
in order: dusk, ember, cure, roll. Soft area fills with a vertical gradient, 2 px lines, rounded bar tops.
A **roll ladder** (DPD buckets as steps with cure/roll arrows) replaces a plain table on the portfolio, and a
**reach heatmap** (channel × time of day) shows when each borrower answers.

### Motion

- 180 ms ease-out page fade/rise; drawer slides 220 ms; skeleton shimmer while loading.
- KPI counters count up once on first paint (600 ms), and are static under `prefers-reduced-motion`.
- AI: staged reasoning steps with real counts from the record ("Reading 7 promises and 29 contact
  attempts…"), 4–8 s in Sample mode, then a streaming word-by-word reveal and source chips.
- Hover: panels lift 1 px with a dusk-tinted shadow; rows tint `surface-2`.

### Dark mode

Follows the OS (`prefers-color-scheme`), with a manual toggle in the top bar stored in `localStorage`.

## How this differs from the other packs

Looked at the landing pages and Try apps of: Odometer (Auto Finance Portfolio Analytics), Workforce
Intelligence, Quillstone (Client Account Views), Tallyward (Continuous Control Testing), Veritome (Governed
Context Layer), Tallowmark (Complaints Intelligence), Veltrona (Claims Intelligence), Tidemere (Market Data
Discovery), Ferrovane (Payments Fraud) and Cross-Border FX.

| Pack | What it uses | What Calvessa avoids |
| --- | --- | --- |
| Odometer | Deep green/teal sidebar, gradient hero banner with stat tiles, grid paper | No sidebar, no green/teal, no grid paper |
| Quillstone | Saffron on charcoal, Space Grotesk | No saffron/yellow accent (ember is a burnt orange used sparingly), different faces |
| Tallyward | Paper + vermilion, IBM Plex Condensed, ledger grid | No paper texture, no Plex, no red brand |
| Veritome | Graphite night with acid lime | Not dark-first, no lime |
| Tallowmark | Burgundy on stone | No burgundy or stone neutrals |
| Veltrona | Spruce teal, pipeline spine layout | No teal, no pipeline spine |
| Tidemere | Harbor navy rail + raspberry, contour lines | No navy rail, no contour pattern, no command palette |
| Ferrovane | Top bar with ticker, lime/magenta, bottom tab bar | Top bar carries a shift meter, not a ticker; tabs scroll, no bottom bar; no lime |
| Cross-Border FX | White page, blue header, form/report split | Lavender canvas, dusk gradient band |

Unique to Calvessa: the violet-to-ember dusk palette, Bricolage Grotesque + Figtree, the crescent mark, the
shift meter, the worklist-plus-drawer queue, the roll ladder, the reach heatmap and the evening text-thread
hero on the landing page.
