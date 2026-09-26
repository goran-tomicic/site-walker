import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { runJourney } from "./runner.js";
import { buildMarkdownReport } from "../report/markdown.js";
import type { Journey, RunEventListener, RunResult } from "../types.js";

export function outDirFor(journeyName: string): string {
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  return path.join("reports", `${journeyName.replace(/\s+/g, "-").toLowerCase()}-${stamp}`);
}

export async function loadJourney(journeyPath: string): Promise<Journey> {
  return JSON.parse(await readFile(journeyPath, "utf-8")) as Journey;
}

export async function executeJourney(
  journey: Journey,
  onEvent?: RunEventListener
): Promise<{ run: RunResult; outDir: string; reportPath: string }> {
  const outDir = outDirFor(journey.name);
  await mkdir(outDir, { recursive: true });

  const run = await runJourney(journey, outDir, onEvent);

  const reportPath = path.join(outDir, "report.md");
  await writeFile(reportPath, buildMarkdownReport(run, outDir), "utf-8");
  await writeFile(path.join(outDir, "report.json"), JSON.stringify({ run, outDir }, null, 2), "utf-8");

  return { run, outDir, reportPath };
}
