import Anthropic from "@anthropic-ai/sdk";
import { readFile } from "node:fs/promises";
import { config } from "../config.js";
import type { AgentAction, InteractiveElement, Judgement, JourneyStep } from "../types.js";

const anthropic = new Anthropic({ apiKey: config.anthropicApiKey });

function elementLegend(elements: InteractiveElement[]): string {
  return elements
    .map((e) => {
      const parts = [`[${e.index}]`, e.tag];
      if (e.role) parts.push(`role=${e.role}`);
      if (e.inputType) parts.push(`type=${e.inputType}`);
      if (e.name) parts.push(`name=${e.name}`);
      if (e.text) parts.push(`"${e.text}"`);
      return parts.join(" ");
    })
    .join("\n");
}

async function screenshotBlock(path: string) {
  const data = await readFile(path);
  return {
    type: "image" as const,
    source: {
      type: "base64" as const,
      media_type: "image/png" as const,
      data: data.toString("base64"),
    },
  };
}

function extractJson(text: string): unknown {
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) throw new Error(`No JSON object found in model response: ${text}`);
  return JSON.parse(match[0]);
}

export async function decideAction(
  step: JourneyStep,
  elements: InteractiveElement[],
  screenshotPath: string,
  history: string[],
  excludeReasoning?: string
): Promise<AgentAction> {
  const legend = elementLegend(elements);
  const historyBlock = history.length
    ? `Actions already taken so far while working on THIS step, in order:\n${history.join("\n")}`
    : "No actions taken yet for this step.";
  const excludeBlock = excludeReasoning
    ? `The previous full attempt at this step failed: "${excludeReasoning}". This is a fresh alternative attempt — try a genuinely different approach, not the same sequence.`
    : "";

  const prompt = `You are testing a website by navigating it like a real user, using ONLY the numbered interactive elements below and the screenshot for context. Never invent selectors or elements that are not in the list.

A single journey step (like "log in") may require SEVERAL actions in sequence (e.g. fill username, fill password, then click the login button). You will be called again after each action with the updated page state, so only decide the ONE next action right now.

Journey step goal: ${step.description}
Expected outcome: ${step.expected}

${historyBlock}
${excludeBlock}

Interactive elements currently on screen (numbered):
${legend}

Decide the single next action. Respond with ONLY a JSON object, no prose, in one of these shapes:
{"type":"click","elementIndex":<number>,"expectedOutcome":"...","reasoning":"..."}
{"type":"fill","elementIndex":<number>,"value":"...","expectedOutcome":"...","reasoning":"..."}
{"type":"wait","ms":<number>,"expectedOutcome":"...","reasoning":"..."}
{"type":"none","expectedOutcome":"...","reasoning":"explain why no further action is needed — use this ONLY when the expected outcome above is already visibly true on screen right now"}

Rules:
- Only use "fill" for values needed to complete this specific journey step (e.g. a documented test username/password). Never fill in real or fake payment card numbers, addresses, phone numbers, emails, or other personal data.
- Prefer the element whose visible text most directly matches the step's goal.
- If you just filled a field and there's an obvious next field or submit button still needed to complete the goal, keep going — don't stop early.`;

  const response = await anthropic.messages.create({
    model: config.model,
    max_tokens: 1024,
    messages: [
      {
        role: "user",
        content: [await screenshotBlock(screenshotPath), { type: "text", text: prompt }],
      },
    ],
  });

  const textBlock = response.content.find((b) => b.type === "text");
  if (!textBlock || textBlock.type !== "text") throw new Error("Model returned no text content");
  return extractJson(textBlock.text) as AgentAction;
}

export async function judgeOutcome(
  step: JourneyStep,
  actions: AgentAction[],
  beforeUrl: string,
  afterUrl: string,
  screenshotPath: string
): Promise<Judgement> {
  const actionsList = actions.map((a, i) => `${i + 1}. ${a.type} — ${a.reasoning}`).join("\n");
  const prompt = `You just watched an automated browser attempt a website journey step, taking one or more actions in sequence.

Journey step goal: ${step.description}
Expected outcome: ${step.expected}
Actions taken, in order:
${actionsList}
URL before this step's first action: ${beforeUrl}
URL after the last action: ${afterUrl}

The attached screenshot shows the CURRENT page state, after all actions above. Judge whether the step's expected outcome is achieved right now — not whether the actions "seemed reasonable."

Respond with ONLY a JSON object:
{"passed": true|false, "frictionNote": "one short sentence describing any friction (unclear CTA, dead end, unexpected redirect, broken element), or a brief confirmation if it passed cleanly"}`;

  const response = await anthropic.messages.create({
    model: config.model,
    max_tokens: 512,
    messages: [
      {
        role: "user",
        content: [await screenshotBlock(screenshotPath), { type: "text", text: prompt }],
      },
    ],
  });

  const textBlock = response.content.find((b) => b.type === "text");
  if (!textBlock || textBlock.type !== "text") throw new Error("Model returned no text content");
  return extractJson(textBlock.text) as Judgement;
}
