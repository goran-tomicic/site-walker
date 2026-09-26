# Release log

One entry per push to `main`. Newest first.

## Unreleased (branch: `feature/portfolio-journey`)
- Added a second journey, `data/journeys/portfolio.json`, targeting goran-tomicic.xyz (homepage → work section → open a project → find contact). `ALLOWED_TARGET_DOMAINS` now includes this domain.
- Fixed a real bug: element interactions (click/fill) used raw Playwright `ElementHandle`s, which go stale on animated/client-rendered pages (this portfolio is Next.js) — switched to Playwright `Locator`s that re-resolve at interaction time instead.
- Fixed a second bug: when an action genuinely failed to execute (e.g. a click timeout), the exception skipped the "try one alternative path" logic entirely and went straight to a hard blocker. Execution failures are now treated as a failed attempt like a judged failure, so the alternative-path retry runs as SPEC requires.
- Result: running the portfolio journey surfaced real friction on the live site (a "Selected Work" carousel card click that doesn't navigate, and a partially off-screen card whose click never resolves) — verified independently outside this app, not an artifact of our code.

## 2026-09-26 — Local dashboard
- Commit: `352832b`
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
