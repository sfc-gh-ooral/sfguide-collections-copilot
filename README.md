# Collections Prioritization Copilot

Help collections teams contact the right delinquent customers first, with the right offer and a compliant, empathetic conversation guide.

**[Guide](https://sfc-gh-ooral.github.io/sfguide-collections-copilot/) · [Try the example (no account needed)](https://sfc-gh-ooral.github.io/sfguide-collections-copilot/try/)**

A collections app on Snowflake for a fictional consumer lender, Northwind Financial, with 30,000 auto and personal loans. It has five screens:

| Screen | What the collector does | Snowflake capability |
| --- | --- | --- |
| Portfolio | Reads loans by days-past-due (DPD) bucket, the delinquency trend, roll and cure rates, and the promise-kept rate | Snowflake SQL, Dynamic Tables, Model Registry metadata |
| Today's queue | Works accounts ranked by expected recovery × roll risk, with the best channel and time, a suggested offer, and calls used against the limit | Batch scores from an XGBoost model trained with Snowpark ML and served from the Model Registry, the `TODAY_QUEUE` dynamic table |
| Account view | Reads the history, reach rate by channel and time, hardship eligibility, and contact-limit tracking; drafts a conversation guide with AI; logs a promise, requests a hardship enrollment, or schedules a contact; re-scores the account live with the registered model | Cortex `AI_COMPLETE`, Model Registry inference (`ROLL_RISK_XGB!PREDICT_PROBA`), Dynamic Tables |
| Call QA | Reviews transcript compliance flags and coaching notes, by flag type and agent; re-reviews a call on demand | Cortex `AI_CLASSIFY` (multi-label), `AI_COMPLETE` |
| Ask | Asks questions such as "Which accounts broke promises twice this month?" | Cortex Agents with Cortex Analyst over a semantic view |

All data is synthetic, with four planted stories: borrowers who answer evening texts but are called at 10am, broken promises that predict a roll to 60+ DPD, a hardship-eligible cluster in a declared disaster area, and a call where the agent's language risks a fair debt collection violation. See [data/README.md](data/README.md).

> **Disclaimer.** Synthetic data and illustrative logic only. This is not a production collections system, and not legal, regulatory, or compliance advice. The contact-frequency limit (7 calls in 7 days) and hardship rules are illustrative, not a statement of any law. Model and QA results describe this synthetic data set only. This is an illustrative example, not an official Snowflake product, and is not supported by Snowflake Support.

## Prerequisites

- **Sample mode:** Node.js 20.19 or later. Nothing else.
- **Live mode:** a Snowflake account (Standard Edition is enough) where you can use ACCOUNTADMIN, or USERADMIN + SECURITYADMIN and SYSADMIN, to run `sql/setup.sql`.
  - Cortex AI available in your region, or cross-region inference enabled, for `AI_CLASSIFY`, `AI_COMPLETE` (default model `claude-sonnet-4-5`), and Cortex Agents.
  - Anaconda packages for Snowpark Python (`snowflake-ml-python`, `xgboost`, `scikit-learn`), which setup uses inside stored procedures.
  - Key-pair authentication (or a programmatic access token) for the user that runs the app.
- Tested with Node.js 22, Next.js 16, and snowflake-sdk 3.4 in November 2026 on an AWS US East account.

## Quick start: Sample mode (no account)

```bash
git clone https://github.com/sfc-gh-ooral/sfguide-collections-copilot.git
cd sfguide-collections-copilot
npm install
npm run dev
```

Open http://localhost:3000. The header switch shows **Sample**. Data comes from `lib/mock/sample.json`, captured from a Live run (the top 25 rows of each queue filter, their account views, and every flagged call). AI answers are labeled **Sample AI response**: they are text captured from live calls, shown after a short delay with the same steps the live call runs. Actions you take stay in your browser and are checked with the same rules as Live mode.

## Live mode: deploy to your account

1. Open a Snowsight SQL worksheet as ACCOUNTADMIN and run [`sql/setup.sql`](sql/setup.sql) top to bottom. No edits are needed. It generates the data, builds the feature and contact-profile dynamic tables, trains and registers the roll-risk model, scores today's accounts, builds the queue, reviews every transcript with AI, and creates the semantic view and agent.
2. Create a key pair and register the public key on your user (steps are in `.env.example`).
3. Copy `.env.example` to `.env.local` and fill in your account identifier, user, and key path. `.env.local` is git-ignored; never commit it.
4. Run `npm run dev` and switch the header to **Live**. If a live call fails, the app shows the error; it never falls back to sample data.

Setup grants `COLLECTIONS_COPILOT_ROLE` to the user who runs it, and the app connects with only that role (`USE SECONDARY ROLES NONE`).

### Objects created

| Object | Name | Notes |
| --- | --- | --- |
| Role | `COLLECTIONS_COPILOT_ROLE` | Least privilege: usage on the warehouse and database, create rights in its three schemas only, `SNOWFLAKE.CORTEX_USER`, and `EXECUTE TASK` |
| Warehouse | `COLLECTIONS_COPILOT_WH` | XSMALL, `AUTO_SUSPEND = 60`, created suspended |
| Database | `COLLECTIONS_COPILOT` | Schemas `RAW`, `ML`, `APP` |
| Tables (RAW) | `CONFIG`, `REGIONS`, `ACCOUNTS`, `DELINQUENCY_DAILY` (~3.1M rows), `PAYMENTS`, `CONTACT_ATTEMPTS`, `PROMISES_TO_PAY`, `HARDSHIP_PROGRAMS`, `HARDSHIP_ENROLLMENTS`, `DISASTER_DECLARATIONS`, `CALL_TRANSCRIPTS` | Seeded synthetic data; function `U` is the seeded random draw |
| Dynamic tables | `ML.ACCOUNT_FEATURES`, `ML.CONTACT_PROFILE`, `APP.TODAY_QUEUE` | `TARGET_LAG = '1 day'` |
| Model | `ML.ROLL_RISK_XGB` version `V1` | XGBoost in the Model Registry |
| Procedures, task | `ML.TRAIN_MODEL`, `ML.SCORE_ACCOUNTS`, task `ML.SCORE_ACCOUNTS_TASK` | The task is created suspended |
| Tables (ML, APP) | `ML.MODEL_EVAL`, `ML.SCORES`, `APP.TRANSCRIPT_QA`, `APP.ACCOUNT_ACTIONS` | The app writes collector actions to `ACCOUNT_ACTIONS` |
| Views | `ML.SNAPSHOTS`, `APP.PORTFOLIO_DAILY`, `APP.ACCOUNT_STATUS`, `APP.PROMISES` | |
| Semantic view, agent | `APP.COLLECTIONS_SV`, `APP.COLLECTIONS_AGENT` | Accounts and promises to pay |

### Clean up

Run [`sql/cleanup.sql`](sql/cleanup.sql). It drops the agent, the database (and everything in it), the warehouse, and the role, and nothing else. Then delete `.env.local`.

## Expected cost and time

- **Setup:** about 2.5 minutes (2 minutes 36 seconds in the November 20, 2026 run) on the XSMALL warehouse, measured end to end (data generation, three dynamic tables, model training and registration, scoring, and AI review of 381 transcripts).
- **Measured warehouse credits:** 0.83 credits in total for two full setup runs, a Live walkthrough of every screen, and the capture of the sample bundle (107 account views and guides, 33 transcript reviews, three agent questions), from `WAREHOUSE_METERING_HISTORY`. A single setup and walkthrough uses less.
- **AI tokens** are billed separately: setup makes 381 `AI_CLASSIFY` calls and one `AI_COMPLETE` call per flagged transcript (33 on this data). In the app, a conversation guide took about 7 seconds, a re-review about 7 seconds, and an agent question 10 to 30 seconds.
- **Idle cost:** none while the warehouse is suspended. The dynamic tables refresh once a day if you leave them; run cleanup when you're done.

## Known limitations

- **Illustrative rules.** The 7-calls-in-7-days limit, the hardship eligibility rules, and the offer logic are examples. They don't encode any federal, state, or product rule. Replace them before relying on the queue.
- **The queue uses batch scores.** Setup scores every account once for the business date in `RAW.CONFIG` (frozen at Monday, Nov 16, 2026, so Sample and Live match), and the queue ranks on those scores. **Re-score now** on the account view runs `ML.ROLL_RISK_XGB!PREDICT_PROBA` live on that account's features and shows the result next to the batch score; it doesn't rewrite the queue. Measured live on November 20, 2026: 17 to 22 seconds per account on the XSMALL warehouse (the model runs as a warehouse UDF), and the live score equaled the batch score for every account tried. `SCORE_ACCOUNTS_TASK` is created suspended; `ALTER TASK ... RESUME` to rescore daily. In Sample mode the button replays the captured batch score and is labeled a sample run.
- **One model.** Roll risk is a single XGBoost model (test AUC 0.775 on this synthetic data; training reads rows in a fixed order, so a rerun gives the same model). Contact propensity is an empirical, smoothed reach rate per channel and time of day, not a trained model.
- **Disclosure check is a phrase rule.** In testing, `AI_CLASSIFY` was unreliable at spotting a missing disclosure (an absence), so a phrase rule checks for it and `AI_CLASSIFY` reviews conduct only. Flags are for human review, not a legal finding.
- **Queue updates on refresh.** Actions are recorded in `APP.ACCOUNT_ACTIONS` and shown on the account; they don't change the queue ranking until the next refresh. Hardship enrollments are requests pending review, not enrollments.
- **Transcripts are short synthetic snippets** assembled from template lines, so QA accuracy on real calls will differ.
- Row-level access by team or region is not modeled; every collector sees every account.

## Customize with Cortex Code

- "Explain this pack's data model, then map my servicing tables (loans, daily delinquency, payments, contact attempts, promises) to it without changing any objects. Rebuild the queue score with my recovery data."
- "Add my state-specific contact-frequency and time-of-day rules to the queue and the schedule action, and test the queue against them with examples that should pass and fail."
- "Score 1,000 of my call transcripts against my QA rubric with AI_CLASSIFY, compare the flags with my QA team's labels, and report precision and recall per label before I use it."

## How it's built

- Next.js (App Router), TypeScript, Tailwind, Recharts, and lucide-react. `snowflake-sdk` for Live mode, with bind variables for every input.
- `lib/live-data.ts` holds the Live queries; `lib/client.ts` switches between Live API routes and the bundled sample; `lib/rules.ts` holds the action checks both modes share.
- `npm run build:example` exports the no-account example to `docs/try/` for GitHub Pages. `node scripts/capture-sample.mjs` refreshes the sample bundle from a running Live app (`--resume` continues a partial capture). `npm run capture` refreshes the screenshots.

## Design

The app is branded as **Calvessa Recovery Desk**, a fictional product (the lender in the data, Northwind Financial, is fictional too). [docs/DESIGN.md](docs/DESIGN.md) describes the brand, the "Dusk shift" palette, typography (Figtree, Bricolage Grotesque and JetBrains Mono, self-hosted under the SIL Open Font License), layout and motion. Light and dark themes follow the OS, with a toggle in the top bar; `node scripts/check-contrast.mjs` checks every text color against WCAG AA in both.

## License

Apache 2.0. See [LICENSE](LICENSE). Provided as is, without warranty. An illustrative example on synthetic data: not an official Snowflake product, and not supported by Snowflake Support.

Owner: Oz Oral · Last reviewed: November 2026
