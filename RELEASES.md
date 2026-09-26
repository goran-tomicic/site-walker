# Release log

One entry per push to `main`. Newest first.

## Unreleased (branch: `feature/dashboard`)
- Added a local dashboard (`npm run server`): Express + SSE server, vanilla JS frontend at `public/`. Pick a journey, trigger a run, watch steps complete live with streaming screenshots/action logs, browse past runs.
- Refactored the run/report-writing logic out of the CLI into `src/agent/execute.ts` so the CLI and server share it; runs now also emit a `report.json` alongside `report.md`.
- Runner now emits step-by-step `RunEvent`s (`run-started`, `step-started`, `action`, `step-finished`, `run-finished`/`run-error`) instead of only returning a final result.
- Verified live in a real browser via Playwright screenshots of the running dashboard: journey run streamed correctly end-to-end, 5/5 steps passed.

## 2026-09-26 — Multi-action step fix
- Commits: `f6ad906`, `3172b14`
- Fixed the step loop: a step now chains multiple actions (e.g. fill → fill → click for login) before being judged once, instead of judging after a single action. Verified live: saucedemo journey went from a false 3/5 (login falsely marked PASS after only the password field was filled) to a real 5/5.

## 2026-09-26 — Initial scaffold
- Commits: `917b545`, `7afea76`
- Node/TS CLI journey-walking agent: Playwright browser session, Claude decide/judge loop, markdown report generator.
- First journey added: `data/journeys/saucedemo.json` (login → add to cart → view cart → start checkout).
- `.gitignore` set up to keep `.env`, `CLAUDE.md`, `docs/`, and `reports/` out of the public repo.
