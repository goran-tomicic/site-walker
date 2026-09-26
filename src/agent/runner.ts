import { mkdir } from "node:fs/promises";
import path from "node:path";
import { BrowserSession } from "../browser/session.js";
import { decideAction, judgeOutcome } from "../claude/client.js";
import { BLOCKED_FIELD_PATTERNS, isDomainAllowed } from "../config.js";
import type { AgentAction, Journey, RunResult, StepResult } from "../types.js";

async function guardedFill(session: BrowserSession, action: Extract<AgentAction, { type: "fill" }>) {
  const identity = await session.fieldIdentity(action.elementIndex);
  if (BLOCKED_FIELD_PATTERNS.some((re) => re.test(identity))) {
    throw new Error(`Refusing to fill field "${identity}": looks like personal or payment data, which is out of scope.`);
  }
  await session.fillElement(action.elementIndex, action.value);
}

async function executeAction(session: BrowserSession, action: AgentAction): Promise<void> {
  switch (action.type) {
    case "click":
      await session.clickElement(action.elementIndex);
      break;
    case "fill":
      await guardedFill(session, action);
      break;
    case "wait":
      await new Promise((r) => setTimeout(r, Math.min(action.ms, 5000)));
      break;
    case "none":
      break;
  }
}

async function attemptStep(
  session: BrowserSession,
  journey: Journey,
  step: StepResult["step"],
  screenshotDir: string,
  attemptLabel: string,
  history: string[],
  excludeReasoning?: string
): Promise<{ action: AgentAction; passed: boolean; frictionNote: string; screenshotPath: string }> {
  const elements = await session.scanInteractiveElements();
  const preShot = path.join(screenshotDir, `step-${step.id}-${attemptLabel}-before.png`);
  await session.screenshot(preShot);

  const action = await decideAction(step, elements, preShot, history, excludeReasoning);
  const beforeUrl = session.url();

  if (!isDomainAllowed(beforeUrl)) {
    throw new Error(`Refusing to act: ${beforeUrl} is not in ALLOWED_TARGET_DOMAINS`);
  }

  await executeAction(session, action);

  const afterUrl = session.url();
  if (!isDomainAllowed(afterUrl)) {
    throw new Error(`Action navigated outside allowed domains: ${afterUrl}`);
  }

  const postShot = path.join(screenshotDir, `step-${step.id}-${attemptLabel}-after.png`);
  await session.screenshot(postShot);

  const judgement = await judgeOutcome(step, action, beforeUrl, afterUrl, postShot);

  return { action, passed: judgement.passed, frictionNote: judgement.frictionNote, screenshotPath: postShot };
}

export async function runJourney(journey: Journey, outDir: string): Promise<RunResult> {
  const screenshotDir = path.join(outDir, "screenshots");
  await mkdir(screenshotDir, { recursive: true });

  const session = new BrowserSession();
  await session.launch();

  const startedAt = new Date().toISOString();
  const steps: StepResult[] = [];

  try {
    if (!isDomainAllowed(journey.targetUrl)) {
      throw new Error(`Target URL ${journey.targetUrl} is not in ALLOWED_TARGET_DOMAINS`);
    }
    await session.goto(journey.targetUrl);

    for (const step of journey.steps) {
      const history: string[] = [];
      let result: StepResult;

      try {
        const first = await attemptStep(session, journey, step, screenshotDir, "attempt1", history);
        history.push(`${first.action.type} -> ${first.frictionNote}`);

        if (first.passed) {
          result = {
            step,
            status: "pass",
            screenshotPath: first.screenshotPath,
            action: first.action,
            alternativeAction: null,
            frictionNote: first.frictionNote,
          };
        } else {
          const second = await attemptStep(
            session,
            journey,
            step,
            screenshotDir,
            "attempt2",
            history,
            first.frictionNote
          );

          result = second.passed
            ? {
                step,
                status: "pass-with-alternative",
                screenshotPath: second.screenshotPath,
                action: first.action,
                alternativeAction: second.action,
                frictionNote: second.frictionNote,
              }
            : {
                step,
                status: "blocked",
                screenshotPath: second.screenshotPath,
                action: first.action,
                alternativeAction: second.action,
                frictionNote: `${first.frictionNote} Alternative also failed: ${second.frictionNote}`,
              };
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        const errorShot = path.join(screenshotDir, `step-${step.id}-error.png`);
        await session.screenshot(errorShot).catch(() => undefined);
        result = {
          step,
          status: "blocked",
          screenshotPath: errorShot,
          action: null,
          alternativeAction: null,
          frictionNote: message,
        };
      }

      steps.push(result);
    }
  } finally {
    await session.close();
  }

  return { journey, steps, startedAt, finishedAt: new Date().toISOString() };
}
