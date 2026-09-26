import path from "node:path";
import type { RunResult, StepResult } from "../types.js";

function statusLabel(status: StepResult["status"]): string {
  switch (status) {
    case "pass":
      return "PASS";
    case "pass-with-alternative":
      return "PASS (via alternative path)";
    case "blocked":
      return "BLOCKED";
  }
}

export function buildMarkdownReport(run: RunResult, outDir: string): string {
  const total = run.steps.length;
  const passed = run.steps.filter((s) => s.status !== "blocked").length;
  const blockers = run.steps.filter((s) => s.status === "blocked");

  const lines: string[] = [];
  lines.push(`# Journey report: ${run.journey.name}`);
  lines.push("");
  lines.push(`- Target: ${run.journey.targetUrl}`);
  lines.push(`- Started: ${run.startedAt}`);
  lines.push(`- Finished: ${run.finishedAt}`);
  lines.push("");
  lines.push(`## Summary: ${passed}/${total} steps completed`);
  lines.push("");
  if (blockers.length === 0) {
    lines.push("No hard blockers.");
  } else {
    lines.push("Hard blockers:");
    for (const b of blockers) {
      lines.push(`- Step ${b.step.id}: ${b.step.description} — ${b.frictionNote}`);
    }
  }
  lines.push("");
  lines.push("## Steps");

  for (const s of run.steps) {
    const relShot = path.relative(outDir, s.screenshotPath);
    lines.push("");
    lines.push(`### Step ${s.step.id}: ${s.step.description}`);
    lines.push(`- Expected: ${s.step.expected}`);
    lines.push(`- Result: ${statusLabel(s.status)}`);
    lines.push(`- Friction note: ${s.frictionNote}`);
    if (s.alternativeAction) {
      lines.push(`- Alternative path tried: ${s.alternativeAction.type} — ${s.alternativeAction.reasoning}`);
    }
    lines.push(`- Screenshot: ![step ${s.step.id}](${relShot})`);
  }

  return lines.join("\n") + "\n";
}
