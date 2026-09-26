# site-walker

An agent that walks a defined user journey on a website (via Playwright), using Claude to decide what to click/fill based on visual + DOM context, and reports where the flow breaks or confuses.

## Setup
1. `npm install` (also installs the Chromium browser Playwright needs)
2. `cp .env.example .env` and fill in your Anthropic API key
3. Run a journey from the CLI:
   ```
   npm run walk -- data/journeys/saucedemo.json
   ```
   Or from the dashboard:
   ```
   npm run server
   ```
   then open http://localhost:5175 — pick a journey, hit Run, and watch steps complete live. Past runs are listed below and stay browsable after the fact.
4. Find the report + screenshots under `reports/<journey>-<timestamp>/report.md` (and `report.json`, used by the dashboard)

## Journeys
Journey definitions live in `data/journeys/*.json` as an explicit step list (target URL, allowed domains, and one `description`/`expected` pair per step). Add a new file there to test a different flow — it shows up automatically in both the CLI and the dashboard's journey picker.

## Safety
- Only points at domains listed in `ALLOWED_TARGET_DOMAINS` — every navigation and action is checked against it.
- Never fills fields that look like payment, address, phone, or other personal data (blocked by pattern match before any `fill` executes).
- On a failed step, tries exactly one alternative approach before marking it a hard blocker — no infinite retries.
