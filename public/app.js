const journeySelect = document.getElementById("journey-select");
const runButton = document.getElementById("run-button");
const runStatus = document.getElementById("run-status");
const liveSummary = document.getElementById("live-summary");
const liveSteps = document.getElementById("live-steps");
const pastRunsEl = document.getElementById("past-runs");
const pastRunDetailEl = document.getElementById("past-run-detail");

const stepCards = new Map(); // stepId -> element

function badgeClass(status) {
  return status.replace(/\s+/g, "-");
}

function statusLabel(status) {
  if (status === "running") return "RUNNING";
  if (status === "pass") return "PASS";
  if (status === "pass-with-alternative") return "PASS (alt path)";
  if (status === "blocked") return "BLOCKED";
  return status;
}

function ensureStepCard(container, stepId, description) {
  if (stepCards.has(stepId)) return stepCards.get(stepId);
  const card = document.createElement("div");
  card.className = "step-card";
  card.innerHTML = `
    <img alt="screenshot pending" />
    <div>
      <div class="badge running">RUNNING</div>
      <div class="step-title">Step ${stepId}: ${description}</div>
      <div class="step-meta"></div>
      <div class="friction"></div>
      <div class="action-log"></div>
    </div>
  `;
  container.appendChild(card);
  stepCards.set(stepId, card);
  return card;
}

function updateStepCard(card, { status, frictionNote, screenshotPath }) {
  const badge = card.querySelector(".badge");
  badge.className = `badge ${badgeClass(status)}`;
  badge.textContent = statusLabel(status);
  if (frictionNote) card.querySelector(".friction").textContent = frictionNote;
  if (screenshotPath) card.querySelector("img").src = "/" + screenshotPath;
}

function appendAction(card, action) {
  const log = card.querySelector(".action-log");
  log.textContent += `${action.type} — ${action.reasoning}\n`;
}

async function loadJourneys() {
  const journeys = await fetch("/api/journeys").then((r) => r.json());
  journeySelect.innerHTML = journeys
    .map((j) => `<option value="${j.file}">${j.name} (${j.stepCount} steps)</option>`)
    .join("");
}

async function loadPastRuns() {
  const runs = await fetch("/api/reports").then((r) => r.json());
  pastRunsEl.innerHTML = runs
    .map(
      (r) => `
      <div class="past-run-row" data-dir="${r.dir}">
        <span>${r.journeyName} — ${new Date(r.startedAt).toLocaleString()}</span>
        <span class="result">${r.passed}/${r.total} passed</span>
      </div>`
    )
    .join("");

  pastRunsEl.querySelectorAll(".past-run-row").forEach((row) => {
    row.addEventListener("click", () => showPastRun(row.dataset.dir));
  });
}

async function showPastRun(dir) {
  const { run } = await fetch(`/reports/${dir}/report.json`).then((r) => r.json());
  pastRunDetailEl.innerHTML = "";
  for (const s of run.steps) {
    const card = document.createElement("div");
    card.className = "step-card";
    card.innerHTML = `
      <img src="/${s.screenshotPath}" alt="screenshot" />
      <div>
        <div class="badge ${badgeClass(s.status)}">${statusLabel(s.status)}</div>
        <div class="step-title">Step ${s.step.id}: ${s.step.description}</div>
        <div class="step-meta">Expected: ${s.step.expected}</div>
        <div class="friction">${s.frictionNote}</div>
        <div class="action-log">${s.actions.map((a) => `${a.type} — ${a.reasoning}`).join("\n")}</div>
      </div>
    `;
    pastRunDetailEl.appendChild(card);
  }
}

function runJourney() {
  const journeyFile = journeySelect.value;
  if (!journeyFile) return;

  runButton.disabled = true;
  runStatus.textContent = "starting…";
  liveSummary.className = "summary hidden";
  liveSteps.innerHTML = "";
  stepCards.clear();

  fetch("/api/runs", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ journeyFile }),
  })
    .then((r) => r.json())
    .then(({ runId, error }) => {
      if (error) throw new Error(error);
      runStatus.textContent = "running…";
      const source = new EventSource(`/api/runs/${runId}/stream`);

      source.onmessage = (msg) => {
        const event = JSON.parse(msg.data);

        if (event.type === "step-started") {
          ensureStepCard(liveSteps, event.stepId, event.description);
        } else if (event.type === "action") {
          const card = ensureStepCard(liveSteps, event.stepId, "");
          appendAction(card, event.action);
          if (event.screenshotPath) card.querySelector("img").src = "/" + event.screenshotPath;
        } else if (event.type === "step-finished") {
          const card = ensureStepCard(liveSteps, event.stepId, "");
          updateStepCard(card, event);
        } else if (event.type === "run-finished") {
          runStatus.textContent = "done";
          runButton.disabled = false;
          liveSummary.className = "summary ok";
          liveSummary.textContent = `${event.passed}/${event.total} steps completed`;
          source.close();
          loadPastRuns();
        } else if (event.type === "run-error") {
          runStatus.textContent = "error";
          runButton.disabled = false;
          liveSummary.className = "summary err";
          liveSummary.textContent = event.message;
          source.close();
        }
      };

      source.onerror = () => {
        runButton.disabled = false;
      };
    })
    .catch((err) => {
      runStatus.textContent = "";
      liveSummary.className = "summary err";
      liveSummary.textContent = err.message;
      runButton.disabled = false;
    });
}

runButton.addEventListener("click", runJourney);

loadJourneys();
loadPastRuns();
