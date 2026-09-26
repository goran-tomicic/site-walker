# Release log

One entry per push to `main`. Newest first.

## Unreleased (branch: `fix/multi-action-steps`)
- Fixed the step loop: a step now chains multiple actions (e.g. fill → fill → click for login) before being judged once, instead of judging after a single action. Verified live: saucedemo journey went from a false 3/5 (login falsely marked PASS after only the password field was filled) to a real 5/5.

## 2026-09-26 — Initial scaffold
- Commits: `917b545`, `7afea76`
- Node/TS CLI journey-walking agent: Playwright browser session, Claude decide/judge loop, markdown report generator.
- First journey added: `data/journeys/saucedemo.json` (login → add to cart → view cart → start checkout).
- `.gitignore` set up to keep `.env`, `CLAUDE.md`, `docs/`, and `reports/` out of the public repo.
