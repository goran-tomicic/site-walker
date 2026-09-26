import { mkdir } from "node:fs/promises";
import path from "node:path";
import { BrowserSession } from "../browser/session.js";
import { decideAction, judgeOutcome } from "../claude/client.js";
import { BLOCKED_FIELD_PATTERNS, isDomainAllowed } from "../config.js";
import type { AgentAction, Journey, RunEventListener, RunResult, StepResult } from "../types.js";

/** Thrown only for safety-boundary violations, which must abort the whole run — never treated as recoverable step friction. */
class DomainViolationError extends Error {}

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

const MAX_ACTIONS_PER_ATTEMPT = 5;

async function attemptStep(
  session: BrowserSession,
  journey: Journey,
  step: StepResult["step"],
  screenshotDir: string,
  attemptLabel: string,
  attemptNumber: number,
  onEvent?: RunEventListener,
  excludeReasoning?: string
): Promise<{ actions: AgentAction[]; passed: boolean; frictionNote: string; screenshotPath: string }> {
  const beforeUrl = session.url();
  if (!isDomainAllowed(beforeUrl)) {
    throw new DomainViolationError(`Refusing to act: ${beforeUrl} is not in ALLOWED_TARGET_DOMAINS`);
  }

  const actions: AgentAction[] = [];
  const history: string[] = [];
  let shotPath = "";

  for (let i = 0; i < MAX_ACTIONS_PER_ATTEMPT; i++) {
    const elements = await session.scanInteractiveElements();
    shotPath = path.join(screenshotDir, `step-${step.id}-${attemptLabel}-action${i}.png`);
    await session.screenshot(shotPath);

    const action = await decideAction(step, elements, shotPath, history, excludeReasoning);
    actions.push(action);
    onEvent?.({ type: "action", stepId: step.id, attempt: attemptNumber, action, screenshotPath: shotPath });

    if (action.type === "none") break;

    try {
      await executeAction(session, action);
    } catch (err) {
      if (err instanceof DomainViolationError) throw err;
      // A click/fill can genuinely fail on a real site (animating element, nothing at that
      // index anymore, etc). That's step friction, not a run-ending error — surface it as a
      // failed attempt so the normal "try one alternative" flow in runJourney still runs,
      // instead of throwing and skipping straight to a hard blocker.
      const message = err instanceof Error ? err.message : String(err);
      return {
        actions,
        passed: false,
        frictionNote: `Action failed: ${action.type} on element ${action.type === "wait" ? "" : (action as { elementIndex: number }).elementIndex} — ${message.split("\n")[0]}`,
        screenshotPath: shotPath,
      };
    }
    history.push(`${i + 1}. ${action.type} -> ${action.reasoning}`);

    const afterUrl = session.url();
    if (!isDomainAllowed(afterUrl)) {
      throw new DomainViolationError(`Action navigated outside allowed domains: ${afterUrl}`);
    }
  }

  const finalShot = path.join(screenshotDir, `step-${step.id}-${attemptLabel}-final.png`);
  await session.screenshot(finalShot);

  const judgement = await judgeOutcome(step, actions, beforeUrl, session.url(), finalShot);

  return { actions, passed: judgement.passed, frictionNote: judgement.frictionNote, screenshotPath: finalShot };
}

export async function runJourney(journey: Journey, outDir: string, onEvent?: RunEventListener): Promise<RunResult> {
  const screenshotDir = path.join(outDir, "screenshots");
  await mkdir(screenshotDir, { recursive: true });

  const session = new BrowserSession();
  await session.launch();

  const startedAt = new Date().toISOString();
  const steps: StepResult[] = [];

  onEvent?.({ type: "run-started", journeyName: journey.name, targetUrl: journey.targetUrl });

  try {
    if (!isDomainAllowed(journey.targetUrl)) {
      throw new Error(`Target URL ${journey.targetUrl} is not in ALLOWED_TARGET_DOMAINS`);
    }
    await session.goto(journey.targetUrl);

    for (const step of journey.steps) {
      let result: StepResult;
      onEvent?.({ type: "step-started", stepId: step.id, description: step.description });

      try {
        const first = await attemptStep(session, journey, step, screenshotDir, "attempt1", 1, onEvent);

        if (first.passed) {
          result = {
            step,
            status: "pass",
            screenshotPath: first.screenshotPath,
            actions: first.actions,
            alternativeActions: null,
            frictionNote: first.frictionNote,
          };
        } else {
          const second = await attemptStep(
            session,
            journey,
            step,
            screenshotDir,
            "attempt2",
            2,
            onEvent,
            first.frictionNote
          );

          result = second.passed
            ? {
                step,
                status: "pass-with-alternative",
                screenshotPath: second.screenshotPath,
                actions: first.actions,
                alternativeActions: second.actions,
                frictionNote: second.frictionNote,
              }
            : {
                step,
                status: "blocked",
                screenshotPath: second.screenshotPath,
                actions: first.actions,
                alternativeActions: second.actions,
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
          actions: [],
          alternativeActions: null,
          frictionNote: message,
        };
      }

      steps.push(result);
      onEvent?.({
        type: "step-finished",
        stepId: step.id,
        status: result.status,
        frictionNote: result.frictionNote,
        screenshotPath: result.screenshotPath,
      });
    }
  } catch (err) {
    onEvent?.({ type: "run-error", message: err instanceof Error ? err.message : String(err) });
    throw err;
  } finally {
    await session.close();
  }

  const passed = steps.filter((s) => s.status !== "blocked").length;
  onEvent?.({ type: "run-finished", passed, total: steps.length });

  return { journey, steps, startedAt, finishedAt: new Date().toISOString() };
}
