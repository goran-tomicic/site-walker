export interface JourneyStep {
  id: number;
  description: string;
  expected: string;
}

export interface Journey {
  name: string;
  targetUrl: string;
  allowedDomains: string[];
  steps: JourneyStep[];
}

export interface InteractiveElement {
  index: number;
  tag: string;
  role: string | null;
  text: string;
  inputType: string | null;
  name: string | null;
}

export type AgentAction =
  | { type: "click"; elementIndex: number; expectedOutcome: string; reasoning: string }
  | { type: "fill"; elementIndex: number; value: string; expectedOutcome: string; reasoning: string }
  | { type: "wait"; ms: number; expectedOutcome: string; reasoning: string }
  | { type: "none"; expectedOutcome: string; reasoning: string };

export interface Judgement {
  passed: boolean;
  frictionNote: string;
}

export type StepStatus = "pass" | "pass-with-alternative" | "blocked";

export interface StepResult {
  step: JourneyStep;
  status: StepStatus;
  screenshotPath: string;
  actions: AgentAction[];
  alternativeActions: AgentAction[] | null;
  frictionNote: string;
}

export interface RunResult {
  journey: Journey;
  steps: StepResult[];
  startedAt: string;
  finishedAt: string;
}
