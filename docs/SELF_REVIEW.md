# Self-review

Taken from the self-review in the catalog pull request ([sfc-gh-ooral/snow-packs#45](https://github.com/sfc-gh-ooral/snow-packs/pull/45)), November 2026.

Build standard, "Before you call it done":

| Item | Status |
| --- | --- |
| Mock mode from a fresh clone | Pass in part: the static `/try/` build from this commit ran at 390 px and 1440 px with no overflow or console errors. A `git clone` + `npm ci` + `npm run dev` from scratch was not repeated this round; it passed in the earlier build. |
| setup → live → cleanup in a clean role | Pass (table above, pack role `COLLECTIONS_COPILOT_ROLE`) |
| Grep files and history for secrets, account ids, user names | Pass: the full history of `origin/main` matches only the public GitHub owner in repo links; no keys and no account locator. All 8 commits signed (G). |
| Pages URL and `/try/` signed out, phone width | Pass: guide 200, 6 images 200, 13 `/try/` JS/CSS assets 200, Re-score works on the published `/try/` at 390 px |
| Dark mode | Skipped this round (not re-checked after this change; passed in the earlier build) |
| Every story beat visible in a screenshot | Pass: evening texters (card 2), broken promises at 95% (card 3), flood-area forbearance (card 4), TR900001 flags (card 5) |

CONTRIBUTING Musts:

| Must | Status |
| --- | --- |
| Business problem first; one industry and one function | Pass |
| Public `sfguide-` repo, Apache 2.0 LICENSE, Pages on with `docs/.nojekyll` | Pass |
| Problem and outcome on the first screen; screenshots of the running app | Pass |
| Caption names the capability, plus alt text | Pass (alt texts re-read against the recaptured cards) |
| Only claim capabilities used and tested | Pass after this round: inference is labeled batch in the queue and live in Re-score; every listed feature ran live above |
| Visible disclaimer; links to repo and docs; no Snowflake logo; no sales motions | Pass |
| End-user app with a real workflow; no-account mode; Sample labels; live mode | Pass ("Sample AI response" on AI, "Sample run" on Re-score) |
| Synthetic, deterministic data | Pass (twice-run hashes above; training now reproducible too) |
| Self-contained setup (own DB, XSMALL, AUTO_SUSPEND 60); cleanup removes everything | Pass |
| No credentials, account ids or internal hostnames in code, screenshots or history; user names redacted | Pass |
| No customer names, deals or internal programs | Pass (Northwind Financial left for Oz, flagged by the reviewer) |
| GA or labeled preview features | Pass |
| README: prerequisites, run steps and objects, cost and time, limitations, Customize with Cortex Code, owner and date, license and as-is disclaimer | Pass (cost and time updated with this run's measurements) |
| Outcomes as possibilities; synthetic results qualified | Pass |


## Polish pass, November 20, 2026

- Fresh clone, `npm ci`, `npm run dev`: pass (home page returns 200).
- Dark mode: renders with the dark theme, no console errors.
- `npm run lint` failed from a fresh clone (ESLint 9 found no `eslint.config.*`). Added the flat config with the Next core-web-vitals and TypeScript presets (the two React Compiler advisory rules off, as the app does not use the compiler) and fixed what it reported; lint and `tsc --noEmit` now pass.
