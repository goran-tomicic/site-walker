import "dotenv/config";

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required env var: ${name}. Copy .env.example to .env and fill it in.`);
  }
  return value;
}

export const config = {
  anthropicApiKey: required("ANTHROPIC_API_KEY"),
  model: process.env.CLAUDE_MODEL || "claude-sonnet-5",
  allowedTargetDomains: (process.env.ALLOWED_TARGET_DOMAINS || "")
    .split(",")
    .map((d) => d.trim())
    .filter(Boolean),
};

// Field names/autocomplete hints we refuse to fill, regardless of journey/model instructions.
// CLAUDE.md: "No auto-fix behavior, no form submission with real/fake payment or personal data."
export const BLOCKED_FIELD_PATTERNS = [
  /card/i,
  /cc-/i,
  /cvv/i,
  /cvc/i,
  /expir/i,
  /ssn/i,
  /social.?security/i,
  /passport/i,
  /postal/i,
  /zip/i,
  /address/i,
  /phone/i,
  /email/i,
  /birth/i,
];

export function isDomainAllowed(url: string): boolean {
  if (config.allowedTargetDomains.length === 0) return true;
  try {
    const host = new URL(url).hostname;
    return config.allowedTargetDomains.some((d) => host === d || host.endsWith(`.${d}`));
  } catch {
    return false;
  }
}
