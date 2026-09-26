import "dotenv/config";
import { randomUUID } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import express from "express";
import { executeJourney, loadJourney } from "../agent/execute.js";
import { createRun, isRunActive, recordEvent, subscribe, unsubscribe } from "./runRegistry.js";
import type { RunResult } from "../types.js";

const app = express();
const PORT = Number(process.env.PORT) || 5175;
const JOURNEYS_DIR = "data/journeys";
const REPORTS_DIR = "reports";

app.use(express.json());
app.use("/reports", express.static(REPORTS_DIR));
app.use(express.static("public"));

app.get("/api/journeys", async (_req, res) => {
  try {
    const files = (await readdir(JOURNEYS_DIR)).filter((f) => f.endsWith(".json"));
    const journeys = await Promise.all(
      files.map(async (file) => {
        const journey = await loadJourney(path.join(JOURNEYS_DIR, file));
        return { file, name: journey.name, targetUrl: journey.targetUrl, stepCount: journey.steps.length };
      })
    );
    res.json(journeys);
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

app.get("/api/reports", async (_req, res) => {
  try {
    const dirs = (await readdir(REPORTS_DIR, { withFileTypes: true }))
      .filter((d) => d.isDirectory())
      .map((d) => d.name)
      .sort()
      .reverse();

    const summaries = await Promise.all(
      dirs.map(async (dir) => {
        try {
          const raw = await readFile(path.join(REPORTS_DIR, dir, "report.json"), "utf-8");
          const { run } = JSON.parse(raw) as { run: RunResult };
          const passed = run.steps.filter((s) => s.status !== "blocked").length;
          return {
            dir,
            journeyName: run.journey.name,
            targetUrl: run.journey.targetUrl,
            startedAt: run.startedAt,
            finishedAt: run.finishedAt,
            passed,
            total: run.steps.length,
          };
        } catch {
          return null;
        }
      })
    );

    res.json(summaries.filter(Boolean));
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

app.post("/api/runs", async (req, res) => {
  const journeyFile = req.body?.journeyFile as string | undefined;
  if (!journeyFile) return res.status(400).json({ error: "journeyFile is required" });
  if (isRunActive()) return res.status(409).json({ error: "A run is already in progress" });

  let journey;
  try {
    journey = await loadJourney(path.join(JOURNEYS_DIR, journeyFile));
  } catch {
    return res.status(404).json({ error: `Journey file not found: ${journeyFile}` });
  }

  const runId = randomUUID();
  createRun(runId, journey.name);
  res.json({ runId });

  executeJourney(journey, (event) => recordEvent(runId, event)).catch((err) => {
    recordEvent(runId, { type: "run-error", message: err instanceof Error ? err.message : String(err) });
  });
});

app.get("/api/runs/:id/stream", (req, res) => {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders();

  const ok = subscribe(req.params.id, res);
  if (!ok) {
    res.write(`data: ${JSON.stringify({ type: "run-error", message: "Unknown run id" })}\n\n`);
    res.end();
    return;
  }

  req.on("close", () => unsubscribe(req.params.id, res));
});

app.listen(PORT, () => {
  console.log(`site-walker dashboard: http://localhost:${PORT}`);
});
