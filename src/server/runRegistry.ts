import type { Response } from "express";
import type { RunEvent } from "../types.js";

interface RunEntry {
  journeyName: string;
  events: RunEvent[];
  listeners: Set<Response>;
  done: boolean;
}

const runs = new Map<string, RunEntry>();
let activeRunId: string | null = null;

export function isRunActive(): boolean {
  return activeRunId !== null;
}

export function createRun(runId: string, journeyName: string): void {
  runs.set(runId, { journeyName, events: [], listeners: new Set(), done: false });
  activeRunId = runId;
}

export function recordEvent(runId: string, event: RunEvent): void {
  const entry = runs.get(runId);
  if (!entry) return;
  entry.events.push(event);
  for (const res of entry.listeners) {
    res.write(`data: ${JSON.stringify(event)}\n\n`);
  }
  if (event.type === "run-finished" || event.type === "run-error") {
    finishRun(runId);
  }
}

export function finishRun(runId: string): void {
  const entry = runs.get(runId);
  if (!entry || entry.done) return;
  entry.done = true;
  for (const res of entry.listeners) res.end();
  entry.listeners.clear();
  if (activeRunId === runId) activeRunId = null;
}

export function subscribe(runId: string, res: Response): boolean {
  const entry = runs.get(runId);
  if (!entry) return false;
  for (const event of entry.events) {
    res.write(`data: ${JSON.stringify(event)}\n\n`);
  }
  if (entry.done) {
    res.end();
  } else {
    entry.listeners.add(res);
  }
  return true;
}

export function unsubscribe(runId: string, res: Response): void {
  runs.get(runId)?.listeners.delete(res);
}
