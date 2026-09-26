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
  const historyBlock = history.length ? `Actions already taken this step (avoid repeating a failed one):\n${history.join("\n")}` : "";
  const excludeBlock = excludeReasoning
    ? `The previous approach failed: "${excludeReasoning}". Try a genuinely different element or approach this time.`
    : "";

  const prompt = `You are testing a website by navigating it like a real user, using ONLY the numbered interactive elements below and the screenshot for context. Never invent selectors or elements that are not in the list.

Journey step goal: ${step.description}
Expected outcome: ${step.expected}

${historyBlock}
${excludeBlock}

Interactive elements currently on screen (numbered):
${legend}

Decide the single next action to make progress on this step. Respond with ONLY a JSON object, no prose, in one of these shapes:
{"type":"click","elementIndex":<number>,"expectedOutcome":"...","reasoning":"..."}
{"type":"fill","elementIndex":<number>,"value":"...","expectedOutcome":"...","reasoning":"..."}
{"type":"wait","ms":<number>,"expectedOutcome":"...","reasoning":"..."}
{"type":"none","expectedOutcome":"...","reasoning":"explain why no action is needed, e.g. the step's goal is already satisfied"}

Rules:
- Only use "fill" for values needed to complete this specific journey step (e.g. a documented test username/password). Never fill in real or fake payment card numbers, addresses, phone numbers, emails, or other personal data.
- Prefer the element whose visible text most directly matches the step's goal.`;

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
  action: AgentAction,
  beforeUrl: string,
  afterUrl: string,
  screenshotPath: string
): Promise<Judgement> {
  const prompt = `You just watched an automated browser take an action while testing a website journey step.

Journey step goal: ${step.description}
Expected outcome: ${step.expected}
Action taken: ${JSON.stringify(action)}
URL before action: ${beforeUrl}
URL after action: ${afterUrl}

The attached screenshot shows the page state AFTER the action. Judge whether the step's goal was achieved.

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
