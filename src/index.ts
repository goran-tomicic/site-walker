import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { runJourney } from "./agent/runner.js";
import { buildMarkdownReport } from "./report/markdown.js";
import type { Journey } from "./types.js";

async function main() {
  const journeyPath = process.argv[2];
  if (!journeyPath) {
    console.error("Usage: npm run walk -- data/journeys/<file>.json");
    process.exit(1);
  }

  const journey = JSON.parse(await readFile(journeyPath, "utf-8")) as Journey;

  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const outDir = path.join("reports", `${journey.name.replace(/\s+/g, "-").toLowerCase()}-${stamp}`);
  await mkdir(outDir, { recursive: true });

  console.log(`Running journey "${journey.name}" against ${journey.targetUrl}...`);
  const run = await runJourney(journey, outDir);

  const reportPath = path.join(outDir, "report.md");
  await writeFile(reportPath, buildMarkdownReport(run, outDir), "utf-8");

  const passed = run.steps.filter((s) => s.status !== "blocked").length;
  console.log(`Done: ${passed}/${run.steps.length} steps completed.`);
  console.log(`Report: ${reportPath}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
