import { executeJourney, loadJourney } from "./agent/execute.js";

async function main() {
  const journeyPath = process.argv[2];
  if (!journeyPath) {
    console.error("Usage: npm run walk -- data/journeys/<file>.json");
    process.exit(1);
  }

  const journey = await loadJourney(journeyPath);

  console.log(`Running journey "${journey.name}" against ${journey.targetUrl}...`);
  const { run, reportPath } = await executeJourney(journey, (event) => {
    if (event.type === "step-started") console.log(`  step ${event.stepId}: ${event.description}`);
    if (event.type === "action") console.log(`    action: ${event.action.type} — ${event.action.reasoning}`);
    if (event.type === "step-finished") console.log(`  -> ${event.status}: ${event.frictionNote}`);
  });

  const passed = run.steps.filter((s) => s.status !== "blocked").length;
  console.log(`Done: ${passed}/${run.steps.length} steps completed.`);
  console.log(`Report: ${reportPath}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
